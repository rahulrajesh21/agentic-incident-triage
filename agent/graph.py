import asyncio
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.messages import AnyMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.types import Command, interrupt

from agent.mcp_client import call_remediation_tool
from agent.prompts import INVESTIGATE_SYSTEM_PROMPT, SYNTHESIZE_SYSTEM_PROMPT
from core.schemas import TriageReport

MAX_STEPS = 6
TOOL_TIMEOUT_SEC = 4.0


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
    status: Literal[
        "investigating",
        "synthesizing",
        "awaiting_approval",
        "executed",
        "rejected",
    ]


def build_triage_graph(llm, readonly_tools: list, checkpointer):
    """Build and compile the TraceGate LangGraph state machine."""
    tool_map = {t.name: t for t in readonly_tools}
    llm_with_tools = llm.bind_tools(readonly_tools)
    structured_llm = llm.with_structured_output(TriageReport)

    # 1. Read-only reasoning node
    async def investigate(state: TriageState) -> dict:
        prompt_msgs = [
            SystemMessage(content=INVESTIGATE_SYSTEM_PROMPT),
            *state["messages"],
        ]
        response = await llm_with_tools.ainvoke(prompt_msgs)
        return {
            "messages": [response],
            "step_count": state.get("step_count", 0) + 1,
            "status": "investigating",
        }

    # 2. Timeout-protected read-only MCP tool runner (:8010)
    async def run_tools(state: TriageState) -> dict:
        last_msg = state["messages"][-1]
        tool_messages: list[ToolMessage] = []
        degraded = list(state.get("degraded_sources", []))

        for call in last_msg.tool_calls:
            tool_name = call["name"]
            tool = tool_map.get(tool_name)
            source = tool_name.split("_", 1)[0]  # telemetry / git / runbook

            if not tool:
                content = f"TOOL_UNAVAILABLE: Unknown tool '{tool_name}'."
            else:
                try:
                    result = await asyncio.wait_for(
                        tool.ainvoke(call["args"]),
                        timeout=TOOL_TIMEOUT_SEC,
                    )
                    content = str(result)
                except Exception as exc:
                    if source not in degraded:
                        degraded.append(source)
                    content = f"TOOL_UNAVAILABLE ({source}): {type(exc).__name__}: {exc}"

            tool_messages.append(
                ToolMessage(content=content, tool_call_id=call["id"], name=tool_name)
            )

        return {"messages": tool_messages, "degraded_sources": degraded}

    # 3. Router enforcing the 6-step cap
    def should_continue(state: TriageState) -> Literal["tools", "synthesize"]:
        last_msg = state["messages"][-1]
        if getattr(last_msg, "tool_calls", None) and state.get("step_count", 0) < MAX_STEPS:
            return "tools"
        return "synthesize"

    # 4. Structured synthesis node (Pydantic TriageReport)
    async def synthesize(state: TriageState) -> dict:
        degraded_note = (
            f"Degraded/unavailable sources: {state.get('degraded_sources', [])}"
        )
        prompt_msgs = [
            SystemMessage(content=f"{SYNTHESIZE_SYSTEM_PROMPT}\n{degraded_note}"),
            *state["messages"],
        ]
        report: TriageReport = await structured_llm.ainvoke(prompt_msgs)
        return {
            "triage_report": report.model_dump(),
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
        action = report["proposed_action"]["action_type"]  # "rollback" or "escalate"

        if action == "rollback":
            target_sha = report["proposed_action"]["target_sha"]
            idempotency_key = f"{incident_id}:rollback:{target_sha}"
            result = await call_remediation_tool(
                "trigger_rollback",
                {
                    "service": report["service"],
                    "target_sha": target_sha,
                    "approved_by": approved_by,
                    "idempotency_key": idempotency_key,
                    "reason": report["root_cause_summary"],
                },
            )
        else:
            severity = report["severity"]
            idempotency_key = f"{incident_id}:escalate:{severity}"
            result = await call_remediation_tool(
                "escalate_incident",
                {
                    "service": report["service"],
                    "severity": severity,
                    "approved_by": approved_by,
                    "idempotency_key": idempotency_key,
                    "reason": report["root_cause_summary"],
                },
            )

        return {"remediation_result": result, "status": "executed"}

    async def reject_remediation(state: TriageState) -> dict:
        return {
            "remediation_result": {"status": "rejected_by_human"},
            "status": "rejected",
        }

    # Wire edges
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
