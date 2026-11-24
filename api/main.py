import asyncio
import json
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command

from agent.graph import build_triage_graph
from agent.mcp_client import load_readonly_tools
from api.webhooks import make_incident_id, parse_alert_payloads
from core.schemas import ApprovalDecision, IncidentAlert
from core.tracing import TraceLogger

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[1]
CHECKPOINTS_DB = BASE_DIR / "sandbox" / "checkpoints.db"
MANIFEST_PATH = BASE_DIR / "sandbox" / "manifest.json"


@asynccontextmanager
async def lifespan(app: FastAPI):
    CHECKPOINTS_DB.parent.mkdir(parents=True, exist_ok=True)
    readonly_tools = await load_readonly_tools()
    tracer = TraceLogger()

    async with AsyncSqliteSaver.from_conn_string(str(CHECKPOINTS_DB)) as checkpointer:
        app.state.graph = build_triage_graph(
            readonly_tools=readonly_tools,
            checkpointer=checkpointer,
            tracer=tracer,
        )
        app.state.tracer = tracer
        app.state.in_flight: set[str] = set()  # Prevents race-condition duplicates
        app.state.known_incidents: list[str] = []
        yield


app = FastAPI(title="TraceGate API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _run_triage(incident_id: str, alert: IncidentAlert) -> None:
    """Background runner: executes investigate -> synthesize -> pauses at approval_gate."""
    config = {"configurable": {"thread_id": incident_id}}
    initial_state = {
        "incident_id": incident_id,
        "alert": alert.model_dump(by_alias=True),
        "messages": [
            HumanMessage(
                content=(
                    f"Active Alert: {alert.alertname}\n"
                    f"Service: {alert.service}\n"
                    f"Severity: {alert.severity}\n"
                    f"Started At: {alert.starts_at}\n"
                    f"Summary: {alert.summary}\n\n"
                    "Investigate using read-only telemetry, git, and runbook tools."
                )
            )
        ],
        "step_count": 0,
        "degraded_sources": [],
        "triage_report": None,
        "approved": None,
        "approved_by": None,
        "remediation_result": None,
        "status": "investigating",
    }
    try:
        await app.state.graph.ainvoke(initial_state, config=config)
    finally:
        app.state.in_flight.discard(incident_id)


@app.post("/webhooks/alertmanager", status_code=202)
async def alertmanager_webhook(
    background_tasks: BackgroundTasks,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    """Ingest alerts, deduplicate by incident_id, and start triage asynchronously."""
    alerts = parse_alert_payloads(payload)
    results = []

    for alert in alerts:
        incident_id = make_incident_id(alert)
        config = {"configurable": {"thread_id": incident_id}}
        existing = await app.state.graph.aget_state(config)

        if incident_id in app.state.in_flight or bool(existing.values):
            results.append({"incident_id": incident_id, "status": "duplicate_ignored"})
            continue

        app.state.in_flight.add(incident_id)
        if incident_id not in app.state.known_incidents:
            app.state.known_incidents.append(incident_id)

        background_tasks.add_task(_run_triage, incident_id, alert)
        results.append({"incident_id": incident_id, "status": "accepted"})

    return {"accepted": results}


@app.get("/incidents/{incident_id}")
async def get_incident(incident_id: str) -> dict[str, Any]:
    """Inspect current incident state, TriageReport, and execution trace."""
    config = {"configurable": {"thread_id": incident_id}}
    snapshot = await app.state.graph.aget_state(config)

    if not snapshot.values:
        if incident_id in app.state.in_flight:
            return {"incident_id": incident_id, "status": "investigating"}
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")

    state = snapshot.values
    return {
        "incident_id": incident_id,
        "status": state.get("status"),
        "awaiting_human_approval": "approval_gate" in snapshot.next,
        "alert": state.get("alert"),
        "degraded_sources": state.get("degraded_sources", []),
        "triage_report": state.get("triage_report"),
        "approved": state.get("approved"),
        "approved_by": state.get("approved_by"),
        "remediation_result": state.get("remediation_result"),
        "trace": app.state.tracer.get_incident_trace(incident_id),
    }


@app.post("/incidents/{incident_id}/approve")
async def approve_incident(incident_id: str, decision: ApprovalDecision) -> dict[str, Any]:
    """Resume the paused LangGraph thread with the human's approve/reject decision."""
    config = {"configurable": {"thread_id": incident_id}}
    snapshot = await app.state.graph.aget_state(config)

    if not snapshot.values:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")
    if "approval_gate" not in snapshot.next:
        raise HTTPException(
            status_code=409,
            detail=f"Incident '{incident_id}' is not awaiting approval (status={snapshot.values.get('status')}).",
        )

    final_state = await app.state.graph.ainvoke(
        Command(
            resume={
                "approved": decision.approved,
                "approved_by": decision.approved_by,
                "comment": decision.comment,
            }
        ),
        config=config,
    )

    return {
        "incident_id": incident_id,
        "status": final_state.get("status"),
        "approved": final_state.get("approved"),
        "approved_by": final_state.get("approved_by"),
        "remediation_result": final_state.get("remediation_result"),
    }


@app.get("/incidents")
async def list_incidents() -> dict[str, Any]:
    """List known incident IDs from active state and traces database."""
    incidents = list(getattr(app.state, "known_incidents", []))
    try:
        with sqlite3.connect(app.state.tracer.db_path) as conn:
            rows = conn.execute("SELECT DISTINCT incident_id FROM trace_events ORDER BY id DESC").fetchall()
            for (inc_id,) in rows:
                if inc_id not in incidents:
                    incidents.append(inc_id)
    except Exception:
        pass
    return {"incidents": incidents}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
