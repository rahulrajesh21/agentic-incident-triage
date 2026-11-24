import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[1]
TRACES_DB = BASE_DIR / "sandbox" / "traces.db"

# USD per 1M tokens: (input_per_1m, output_per_1m). Local/unlisted models default to 0.0.
MODEL_PRICING_PER_1M: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1": (2.00, 8.00),
}


def extract_token_usage(message: Any) -> tuple[int, int]:
    """Safely extract (prompt_tokens, completion_tokens) from a LangChain AIMessage."""
    usage = getattr(message, "usage_metadata", None)
    if isinstance(usage, dict) and usage:
        return int(usage.get("input_tokens", 0)), int(usage.get("output_tokens", 0))

    meta = getattr(message, "response_metadata", None) or {}
    token_usage = meta.get("token_usage") or meta.get("usage") or {}
    return (
        int(token_usage.get("prompt_tokens", 0)),
        int(token_usage.get("completion_tokens", 0)),
    )


def estimate_cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    clean_model = model.split("/")[-1].lower()
    in_rate, out_rate = MODEL_PRICING_PER_1M.get(clean_model, (0.0, 0.0))
    cost = (prompt_tokens / 1_000_000) * in_rate + (completion_tokens / 1_000_000) * out_rate
    return round(cost, 6)


class TraceLogger:
    """SQLite-backed structured tracer for TraceGate runs."""

    def __init__(self, db_path: Path = TRACES_DB):
        self.db_path = db_path
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with closing(self._connect()) as conn:
            with conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS trace_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        incident_id TEXT NOT NULL,
                        node TEXT NOT NULL,
                        event_type TEXT NOT NULL,
                        name TEXT NOT NULL,
                        status TEXT NOT NULL,
                        latency_ms REAL NOT NULL,
                        prompt_tokens INTEGER NOT NULL DEFAULT 0,
                        completion_tokens INTEGER NOT NULL DEFAULT 0,
                        cost_usd REAL NOT NULL DEFAULT 0.0,
                        model TEXT NOT NULL DEFAULT '',
                        prompt_version TEXT NOT NULL DEFAULT '',
                        metadata_json TEXT NOT NULL DEFAULT '{}',
                        created_at TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_trace_incident ON trace_events(incident_id, id)"
                )

    def _insert(
        self,
        *,
        incident_id: str,
        node: str,
        event_type: str,
        name: str,
        status: str,
        latency_ms: float,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        cost_usd: float = 0.0,
        model: str = "",
        prompt_version: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with closing(self._connect()) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO trace_events (
                        incident_id, node, event_type, name, status, latency_ms,
                        prompt_tokens, completion_tokens, cost_usd,
                        model, prompt_version, metadata_json, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        incident_id,
                        node,
                        event_type,
                        name,
                        status,
                        round(latency_ms, 2),
                        prompt_tokens,
                        completion_tokens,
                        cost_usd,
                        model,
                        prompt_version,
                        json.dumps(metadata or {}, default=str),
                        now,
                    ),
                )

    def log_llm_call(
        self,
        *,
        incident_id: str,
        node: str,
        model: str,
        prompt_version: str,
        latency_ms: float,
        prompt_tokens: int,
        completion_tokens: int,
        status: str = "ok",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        cost = estimate_cost_usd(model, prompt_tokens, completion_tokens)
        self._insert(
            incident_id=incident_id,
            node=node,
            event_type="llm_call",
            name=model,
            status=status,
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=cost,
            model=model,
            prompt_version=prompt_version,
            metadata=metadata,
        )

    def log_tool_call(
        self,
        *,
        incident_id: str,
        node: str,
        tool_name: str,
        status: str,
        latency_ms: float,
        args: dict[str, Any],
        result_preview: str,
    ) -> None:
        self._insert(
            incident_id=incident_id,
            node=node,
            event_type="tool_call",
            name=tool_name,
            status=status,
            latency_ms=latency_ms,
            metadata={
                "args": args,
                "result_preview": result_preview[:400],
            },
        )

    def get_incident_trace(self, incident_id: str) -> dict[str, Any]:
        """Return ordered timeline + aggregated latency/token/cost totals for API & evals."""
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT * FROM trace_events WHERE incident_id = ? ORDER BY id ASC",
                (incident_id,),
            ).fetchall()

        events = []
        total_latency_ms = 0.0
        total_prompt = 0
        total_completion = 0
        total_cost = 0.0

        for row in rows:
            item = dict(row)
            item["metadata"] = json.loads(item.pop("metadata_json"))
            events.append(item)
            total_latency_ms += item["latency_ms"]
            total_prompt += item["prompt_tokens"]
            total_completion += item["completion_tokens"]
            total_cost += item["cost_usd"]

        return {
            "incident_id": incident_id,
            "event_count": len(events),
            "totals": {
                "latency_ms": round(total_latency_ms, 2),
                "prompt_tokens": total_prompt,
                "completion_tokens": total_completion,
                "cost_usd": round(total_cost, 6),
            },
            "events": events,
        }
