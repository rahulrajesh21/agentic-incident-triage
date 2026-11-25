import asyncio
import json
import re
import time
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.types import Command, interrupt

from agent.llm import LLMConfig, get_llm
from agent.mcp_client import call_remediation_tool
from agent.prompts import (
    INVESTIGATE_SYSTEM_PROMPT,
    PROMPT_VERSION,
    SYNTHESIZE_SYSTEM_PROMPT,
)
from core.schemas import TriageReport
from core.tracing import TraceLogger, extract_token_usage

MAX_STEPS = 6
TOOL_TIMEOUT_SEC = 4.0
MAX_TOOL_OUTPUT_CHARS = 6000


class TriageState(TypedDict):
    incident_id: str
    alert: dict[str, Any]
    messages: Annotated[list[AnyMessage], add_messages]
    step_count: int
    degraded_sources: list[str]
    triage_report: dict[str, Any] | None
    approved: bool | None
    approved_by: str | None
    remediation_result: dict[str, Any] | None
    error: str | None
    status: Literal[
        "investigating",
        "synthesizing",
        "awaiting_approval",
        "executed",
        "rejected",
        "failed",
    ]


def _extract_triage_report(raw_text: str) -> TriageReport:
    """Extract and validate a TriageReport JSON object from raw model output."""
    cleaned = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL).strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, flags=re.DOTALL)
    candidate = fence.group(1) if fence else cleaned
    start = candidate.find("{")
    if start == -1:
        raise ValueError("No JSON object found in synthesis response.")
    obj, _ = json.JSONDecoder().raw_decode(candidate[start:])
    return TriageReport.model_validate(obj)


def build_triage_graph(
    readonly_tools: list,
    checkpointer,
    llm=None,
    llm_config: LLMConfig | None = None,
    tracer: TraceLogger | None = None,
):
    """Build and compile the TraceGate LangGraph state machine with tracing."""
    if llm is None:
        llm, llm_config = get_llm(llm_config)
    model_name = llm_config.model if llm_config else getattr(llm, "model_name", "unknown")
    trace = tracer or TraceLogger()

    tool_map = {t.name: t for t in readonly_tools}
    llm_with_tools = llm.bind_tools(readonly_tools)

    structured_method = llm_config.structured_method if llm_config else None
    structured_stream_llm = llm.bind(
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "TriageReport",
                "strict": True,
                "schema": TriageReport.model_json_schema(),
            },
        }
    )
    structured_fc_llm = (
        llm.with_structured_output(TriageReport, method="function_calling", include_raw=True)
        if structured_method == "function_calling"
        else None
    )

    async def _stream_collect(runnable: Any, msgs: list[Any]) -> Any:
        merged = None
        async for chunk in runnable.astream(msgs):
            merged = chunk if merged is None else merged + chunk
        return merged

    # 1. Read-only reasoning node
    async def investigate(state: TriageState) -> dict:
        prompt_msgs = [
            SystemMessage(content=INVESTIGATE_SYSTEM_PROMPT),
            *state["messages"],
        ]
        started = time.perf_counter()
        response = await llm_with_tools.ainvoke(prompt_msgs)
        latency_ms = (time.perf_counter() - started) * 1000

        prompt_toks, completion_toks = extract_token_usage(response)
        requested_tools = [c["name"] for c in getattr(response, "tool_calls", [])]

        trace.log_llm_call(
            incident_id=state["incident_id"],
            node="investigate",
            model=model_name,
            prompt_version=PROMPT_VERSION,
            latency_ms=latency_ms,
            prompt_tokens=prompt_toks,
            completion_tokens=completion_toks,
            metadata={
                "step": state.get("step_count", 0) + 1,
                "requested_tools": requested_tools,
            },
        )

        return {
            "messages": [response],
            "step_count": state.get("step_count", 0) + 1,
            "status": "investigating",
        }

    # 2. Timeout-protected parallel read-only MCP tool runner (:8010)
    async def run_tools(state: TriageState) -> dict:
        last_msg = state["messages"][-1]
        incident_id = state["incident_id"]
        degraded = list(state.get("degraded_sources", []))

        async def _invoke_one(call: dict[str, Any]) -> tuple[ToolMessage, str | None]:
            tool_name = call["name"]
            args = call.get("args", {})
            tool = tool_map.get(tool_name)
            source = tool_name.split("_", 1)[0]
            started = time.perf_counter()

            if not tool:
                content = f"TOOL_UNAVAILABLE: Unknown tool '{tool_name}'."
                status = "error"
                degraded_source = source
            else:
                try:
                    result = await asyncio.wait_for(
                        tool.ainvoke(args),
                        timeout=TOOL_TIMEOUT_SEC,
                    )
                    content = str(result)
                    if len(content) > MAX_TOOL_OUTPUT_CHARS:
                        content = content[:MAX_TOOL_OUTPUT_CHARS] + "\n...[truncated]"
                    status = "ok"
                    degraded_source = None
                except asyncio.TimeoutError:
                    content = (
                        f"TOOL_UNAVAILABLE ({source}): Timed out after {TOOL_TIMEOUT_SEC}s."
                    )
                    status = "timeout"
                    degraded_source = source
                except Exception as exc:
                    content = f"TOOL_UNAVAILABLE ({source}): {type(exc).__name__}: {exc}"
                    status = "error"
                    degraded_source = source

            latency_ms = (time.perf_counter() - started) * 1000
            trace.log_tool_call(
                incident_id=incident_id,
                node="tools",
                tool_name=tool_name,
                status=status,
                latency_ms=latency_ms,
                args=args,
                result_preview=content,
            )

            msg = ToolMessage(content=content, tool_call_id=call["id"], name=tool_name)
            return msg, degraded_source

        outcomes = await asyncio.gather(*(_invoke_one(c) for c in last_msg.tool_calls))

        tool_messages: list[ToolMessage] = []
        for msg, degraded_source in outcomes:
            tool_messages.append(msg)
            if degraded_source and degraded_source not in degraded:
                degraded.append(degraded_source)

        return {"messages": tool_messages, "degraded_sources": degraded}

    # 3. Router enforcing the 6-step cap
    def should_continue(state: TriageState) -> Literal["tools", "synthesize"]:
        last_msg = state["messages"][-1]
        if getattr(last_msg, "tool_calls", None) and state.get("step_count", 0) < MAX_STEPS:
            return "tools"
        return "synthesize"

    # 4. Structured synthesis node (streaming SSE + fallback JSON extraction)
    async def synthesize(state: TriageState) -> dict:
        degraded = state.get("degraded_sources", [])
        degraded_note = f"Degraded/unavailable sources: {degraded}"
        prompt_msgs = [
            SystemMessage(content=f"{SYNTHESIZE_SYSTEM_PROMPT}\n{degraded_note}"),
            *state["messages"],
        ]

        started = time.perf_counter()
        raw_msg: Any = None
        parsed: TriageReport | None = None
        parsing_error: Any = None
        fallback_used = False

        try:
            if structured_fc_llm is not None:
                output = await structured_fc_llm.ainvoke(prompt_msgs)
                raw_msg = output.get("raw")
                parsed = output.get("parsed")
                parsing_error = output.get("parsing_error")
            else:
                raw_msg = await _stream_collect(structured_stream_llm, prompt_msgs)
                raw_text = str(getattr(raw_msg, "content", "") or "")
                parsed = TriageReport.model_validate_json(raw_text)
        except Exception as exc:
            parsing_error = exc

        if parsed is None and raw_msg is not None and getattr(raw_msg, "content", ""):
            try:
                parsed = _extract_triage_report(str(raw_msg.content))
                parsing_error = None
            except Exception as exc:
                parsing_error = exc

        # Streaming fallback for servers (e.g. llama.cpp) whose sampler rejects json_schema
        if parsed is None:
            fallback_used = True
            evidence_lines = [
                f"[{getattr(m, 'name', None) or 'alert'}]\n{m.content}"
                for m in state["messages"]
                if type(m).__name__ in ("HumanMessage", "ToolMessage")
                and str(getattr(m, "content", "")).strip()
            ]
            digest = "\n\n".join(evidence_lines)
            json_instruction = (
                "Synthesize a TriageReport from the verified evidence below.\n"
                "Respond with ONLY one valid JSON object matching these exact fields:\n"
                '{"service": str, "severity": "P1"|"P2"|"P3", "root_cause_summary": str, '
                '"culprit_sha": str|null, "evidence": [{"source": "telemetry"|"git"|"runbook", '
                '"reference_id": str, "excerpt": str}], "runbook_references": [str], '
                '"proposed_action": {"action_type": "rollback"|"escalate", "target_sha": str|null, '
                '"rationale": str}, "confidence": float, "degraded_sources": [str], '
                '"recommended_next_steps": [str]}\n\n'
                f"=== INVESTIGATION EVIDENCE ===\n{digest}"
            )
            fallback_msgs = [
                SystemMessage(content=f"{SYNTHESIZE_SYSTEM_PROMPT}\n{degraded_note}"),
                HumanMessage(content=json_instruction),
            ]
            raw_msg = await _stream_collect(llm, fallback_msgs)
            try:
                parsed = _extract_triage_report(str(getattr(raw_msg, "content", "")))
                parsing_error = None
            except Exception as exc:
                parsing_error = exc

        latency_ms = (time.perf_counter() - started) * 1000
        prompt_toks, completion_toks = extract_token_usage(raw_msg) if raw_msg else (0, 0)

        trace.log_llm_call(
            incident_id=state["incident_id"],
            node="synthesize",
            model=model_name,
            prompt_version=PROMPT_VERSION,
            latency_ms=latency_ms,
            prompt_tokens=prompt_toks,
            completion_tokens=completion_toks,
            status="ok" if parsed else "error",
            metadata={
                "degraded_sources": degraded,
                "fallback_json": fallback_used,
                "proposed_action": parsed.proposed_action.action_type if parsed else None,
                "parsing_error": str(parsing_error) if parsing_error else None,
            },
        )

        if parsed is None:
            raise ValueError(f"TriageReport structured parsing failed: {parsing_error}")

        # Guarantee degraded sources observed at runtime are always reflected in the report
        merged_degraded = sorted(set(parsed.degraded_sources) | set(degraded))
        report_dict = parsed.model_dump()
        report_dict["degraded_sources"] = merged_degraded

        return {
            "triage_report": report_dict,
            "status": "awaiting_approval",
        }

    # 5. Human-in-the-loop pause gate
    def approval_gate(
        state: TriageState,
    ) -> Command[Literal["execute_remediation", "reject_remediation"]]:
        decision = interrupt(
            {
                "incident_id": state["incident_id"],
                "triage_report": state["triage_report"],
            }
        )
        if decision.get("approved"):
            return Command(
                update={
                    "approved": True,
                    "approved_by": decision["approved_by"],
                },
                goto="execute_remediation",
            )
        return Command(
            update={
                "approved": False,
                "approved_by": decision.get("approved_by", "unknown"),
            },
            goto="reject_remediation",
        )

    # 6. Deterministic write-gated node (calls :8004 directly, no LLM)
    async def execute_remediation(state: TriageState) -> dict:
        report = state["triage_report"]
        incident_id = state["incident_id"]
        approved_by = state["approved_by"]
        action = report["proposed_action"]["action_type"]

        started = time.perf_counter()
        if action == "rollback":
            target_sha = report["proposed_action"]["target_sha"]
            tool_name = "trigger_rollback"
            args = {
                "service": report["service"],
                "target_sha": target_sha,
                "approved_by": approved_by,
                "idempotency_key": f"{incident_id}:rollback:{target_sha}",
                "reason": report["root_cause_summary"],
            }
        else:
            severity = report["severity"]
            tool_name = "escalate_incident"
            args = {
                "service": report["service"],
                "approved_by": approved_by,
                "idempotency_key": f"{incident_id}:escalate:{severity}",
                "reason": f"[{severity}] {report['root_cause_summary']}",
            }

        result = await call_remediation_tool(tool_name, args)
        latency_ms = (time.perf_counter() - started) * 1000

        trace.log_tool_call(
            incident_id=incident_id,
            node="execute_remediation",
            tool_name=tool_name,
            status=str(result.get("status", "ok")),
            latency_ms=latency_ms,
            args=args,
            result_preview=str(result),
        )

        return {"remediation_result": result, "status": "executed"}

    async def reject_remediation(state: TriageState) -> dict:
        trace.log_tool_call(
            incident_id=state["incident_id"],
            node="reject_remediation",
            tool_name="human_rejection",
            status="rejected",
            latency_ms=0.0,
            args={"approved_by": state.get("approved_by", "unknown")},
            result_preview="Remediation rejected by human reviewer; no write MCP called.",
        )
        return {
            "remediation_result": {"status": "rejected_by_human"},
            "status": "rejected",
        }

    # Wire graph
    builder = StateGraph(TriageState)
    builder.add_node("investigate", investigate)
    builder.add_node("tools", run_tools)
    builder.add_node("synthesize", synthesize)
    builder.add_node("approval_gate", approval_gate)
    builder.add_node("execute_remediation", execute_remediation)
    builder.add_node("reject_remediation", reject_remediation)

    builder.add_edge(START, "investigate")
    builder.add_conditional_edges("investigate", should_continue)
    builder.add_edge("tools", "investigate")
    builder.add_edge("synthesize", "approval_gate")
    builder.add_edge("execute_remediation", END)
    builder.add_edge("reject_remediation", END)

    return builder.compile(checkpointer=checkpointer)
