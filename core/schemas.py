import re
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

SHA_PATTERN = re.compile(r"^[0-9a-f]{7,40}$")


class IncidentAlert(BaseModel):
    """Normalized incoming alert payload (matches Alertmanager & sandbox/manifest.json)."""

    model_config = ConfigDict(populate_by_name=True)

    alertname: str = Field(..., description="Name of the firing alert rule.")
    service: str = Field(..., description="Affected microservice name (e.g., checkout-api).")
    severity: Literal["critical", "warning", "info"] = Field(
        default="critical",
        description="Raw alert severity from monitoring.",
    )
    starts_at: str = Field(
        ...,
        alias="startsAt",
        description="ISO-8601 UTC timestamp when the incident began.",
    )
    summary: str = Field(..., description="Short human-readable alert summary.")


class EvidenceCitation(BaseModel):
    """A single grounded piece of evidence returned by a read-only MCP tool."""

    source: Literal["telemetry", "git", "runbook"] = Field(
        ...,
        description="Which read-only MCP namespace produced this evidence.",
    )
    reference_id: str = Field(
        ...,
        description=(
            "Exact identifier from tool output: trace_id (e.g., 'tr-104'), "
            "short git SHA (e.g., 'a1b2c3d'), or runbook section "
            "(e.g., 'postgres-pool-runbook.md#rollback')."
        ),
    )
    excerpt: str = Field(
        ...,
        description="Concise verified fact or metric directly observed in tool output.",
    )


class ProposedAction(BaseModel):
    """Remediation recommendation passed to the human approval gate."""

    action_type: Literal["rollback", "escalate"] = Field(
        ...,
        description="'rollback' only when a verified bad commit is safe to revert; otherwise 'escalate'.",
    )
    target_sha: str | None = Field(
        default=None,
        description=(
            "Prior known-good baseline commit SHA to roll back to (NOT the culprit SHA). "
            "Must be null when action_type is 'escalate'."
        ),
    )
    rationale: str = Field(
        ...,
        description="Why this action is safe and supported by the active runbook and telemetry.",
    )


class TriageReport(BaseModel):
    """Strict structured output produced by the LangGraph synthesize node."""

    service: str = Field(..., description="Affected service name.")
    severity: Literal["P1", "P2", "P3"] = Field(
        ...,
        description="Incident priority: P1 (critical outage), P2 (degraded), P3 (minor).",
    )
    root_cause_summary: str = Field(
        ...,
        description="Clear, evidence-backed explanation of what broke and why.",
    )
    culprit_sha: str | None = Field(
        default=None,
        description="Short git SHA of the commit that introduced the bug, or null if none.",
    )
    evidence: list[EvidenceCitation] = Field(
        ...,
        description="Verified citations from telemetry, git, and active runbooks.",
    )
    runbook_references: list[str] = Field(
        default_factory=list,
        description="Active runbook reference_ids used (e.g., ['postgres-pool-runbook.md#rollback']).",
    )
    proposed_action: ProposedAction = Field(
        ...,
        description="Recommended remediation for human approval.",
    )
    confidence: float = Field(
        ...,
        description="Confidence score between 0.0 and 1.0 calibrated to evidence completeness.",
    )
    degraded_sources: list[str] = Field(
        default_factory=list,
        description="Any MCP sources that returned TOOL_UNAVAILABLE during investigation.",
    )
    recommended_next_steps: list[str] = Field(
        default_factory=list,
        description="Concrete follow-up steps for the on-call engineer (e.g., replay DLQ, page DBA).",
    )

    @model_validator(mode="after")
    def validate_safety_invariants(self) -> "TriageReport":
        if not (0.0 <= self.confidence <= 1.0):
            raise ValueError(f"confidence must be between 0.0 and 1.0, got {self.confidence}")

        if self.culprit_sha is not None:
            self.culprit_sha = self.culprit_sha.strip().lower() or None

        action = self.proposed_action
        if action.action_type == "rollback":
            if not action.target_sha or not SHA_PATTERN.match(action.target_sha.strip().lower()):
                raise ValueError(
                    f"Rollback requires a valid 7-40 char hex target_sha, got: {action.target_sha!r}"
                )
            action.target_sha = action.target_sha.strip().lower()

            # Catch the classic LLM mistake of rolling back TO the broken commit
            if self.culprit_sha and action.target_sha == self.culprit_sha:
                raise ValueError(
                    "target_sha cannot equal culprit_sha; it must be the prior known-good baseline SHA."
                )
        else:
            # Force target_sha to None on escalations so downstream state stays clean
            action.target_sha = None

        return self


class ApprovalDecision(BaseModel):
    """Payload sent to POST /incidents/{incident_id}/approve."""

    approved: bool = Field(..., description="True to execute the proposed action, False to reject.")
    approved_by: str = Field(..., description="Human reviewer username or email.")
    comment: str = Field(default="", description="Optional operator note.")

    @model_validator(mode="after")
    def validate_approver(self) -> "ApprovalDecision":
        self.approved_by = self.approved_by.strip()
        if not self.approved_by:
            raise ValueError("'approved_by' must be a non-empty human identifier.")
        return self