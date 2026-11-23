import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

mcp = FastMCP("remediation-mcp")

SHA_PATTERN = re.compile(r"^[0-9a-f]{7,40}$")

BASE_DIR = Path(__file__).resolve().parents[2]
AUDIT_DB = BASE_DIR / "sandbox" / "audit.db"


def _get_connection() -> sqlite3.Connection:
    AUDIT_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(AUDIT_DB)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            idempotency_key TEXT UNIQUE NOT NULL,
            action TEXT NOT NULL,
            service TEXT NOT NULL,
            target TEXT NOT NULL,
            approved_by TEXT NOT NULL,
            reason TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    return conn


def _record_action(
    service: str,
    action: str,
    target_sha: str,
    approved_by: str,
    idempotency_key: str,
    reason: str,
) -> dict:
    if not approved_by.strip():
        raise ToolError("Write action rejected: 'approved_by' (human reviewer) is required.")
    if not idempotency_key.strip():
        raise ToolError("Write action rejected: 'idempotency_key' is required.")

    now = datetime.now(timezone.utc).isoformat()

    with _get_connection() as conn:
        existing = conn.execute(
            "SELECT * FROM audit_log WHERE idempotency_key = ?",
            (idempotency_key,),
        ).fetchone()

        if existing:
            return {"status": "already_executed", "record": dict(existing)}

        conn.execute(
            """
            INSERT INTO audit_log (idempotency_key, action, service, target, approved_by, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (idempotency_key, action, service, target_sha, approved_by, reason, now),
        )
        row = conn.execute(
            "SELECT * FROM audit_log WHERE idempotency_key = ?",
            (idempotency_key,),
        ).fetchone()

    return {"status": "executed", "record": dict(row)}


@mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": True})
def trigger_rollback(
    service: str,
    target_sha: str,
    approved_by: str,
    idempotency_key: str,
    reason: str,
) -> dict:
    """Roll back a service to a known-good commit SHA. Requires human approval."""
    clean_sha = target_sha.strip().lower()

    if not SHA_PATTERN.match(clean_sha):
        raise ToolError(f"Invalid target_sha: {target_sha}")

    return _record_action(
        service=service,
        action="rollback",
        target_sha=clean_sha,
        approved_by=approved_by,
        idempotency_key=idempotency_key,
        reason=reason,
    )


@mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
def escalate_incident(
    service: str,
    reason: str,
    approved_by: str,
    idempotency_key: str,
) -> dict:
    """Escalate an incident to the human on-call engineer without rolling back."""
    return _record_action(
        service=service,
        action="escalate",
        target_sha="none",
        approved_by=approved_by,
        idempotency_key=idempotency_key,
        reason=reason,
    )


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8004)
