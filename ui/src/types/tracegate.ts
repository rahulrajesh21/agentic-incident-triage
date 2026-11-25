export type IncidentStatus =
  | "investigating"
  | "synthesizing"
  | "awaiting_approval"
  | "executed"
  | "rejected"
  | "failed";

export type SeverityLevel = "P1" | "P2" | "P3" | "critical" | "warning" | "info";

export interface AlertPayload {
  alertname: string;
  service: string;
  severity: "critical" | "warning" | "info";
  startsAt: string;
  summary: string;
}

export interface EvidenceCitation {
  source: "telemetry" | "git" | "runbook";
  reference_id: string;
  excerpt: string;
}

export interface ProposedAction {
  action_type: "rollback" | "escalate";
  target_sha: string | null;
  rationale: string;
}

export interface TriageReport {
  service: string;
  severity: "P1" | "P2" | "P3";
  root_cause_summary: string;
  culprit_sha: string | null;
  evidence: EvidenceCitation[];
  runbook_references: string[];
  proposed_action: ProposedAction;
  confidence: number; // 0.0 - 1.0
  degraded_sources: string[];
  recommended_next_steps: string[];
}

export interface TraceEvent {
  id: number;
  incident_id: string;
  node: string;
  event_type: "llm_call" | "tool_call";
  name: string;
  status: string;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  model: string;
  prompt_version: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TraceData {
  incident_id: string;
  event_count: number;
  totals: {
    latency_ms: number;
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number;
  };
  events: TraceEvent[];
}

export interface IncidentDetail {
  incident_id: string;
  status: IncidentStatus;
  awaiting_human_approval?: boolean;
  alert?: AlertPayload;
  degraded_sources?: string[];
  triage_report?: TriageReport | null;
  approved?: boolean | null;
  approved_by?: string | null;
  remediation_result?: Record<string, unknown> | null;
  error?: string | null;
  trace?: TraceData;
}

export interface ApprovalDecision {
  approved: boolean;
  approved_by: string;
  comment?: string;
}

export interface WebhookResponse {
  accepted: Array<{
    incident_id: string;
    status: "accepted" | "duplicate_ignored";
  }>;
}

export interface IncidentSummaryItem {
  incident_id: string;
  service?: string;
  alertname?: string;
  severity?: string;
  status?: IncidentStatus;
  timestamp?: string;
  awaiting_approval?: boolean;
}
