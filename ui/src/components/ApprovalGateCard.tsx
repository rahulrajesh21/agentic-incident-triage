import React, { useState } from "react";
import {
  AlertOctagon,
  Check,
  Copy,
  Lock,
  ShieldCheck,
  Terminal,
  XCircle,
} from "lucide-react";
import { ApprovalDecision, IncidentDetail } from "../types/tracegate";

interface ApprovalGateCardProps {
  incident: IncidentDetail;
  onApprove: (decision: ApprovalDecision) => Promise<void>;
}

export const ApprovalGateCard: React.FC<ApprovalGateCardProps> = ({
  incident,
  onApprove,
}) => {
  const [approver, setApprover] = useState<string>(() => {
    return localStorage.getItem("tracegate_approver") || "rahul-sre";
  });
  const [comment, setComment] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedIdem, setCopiedIdem] = useState<boolean>(false);

  const report = incident.triage_report;
  const isAwaiting =
    Boolean(incident.awaiting_human_approval) || incident.status === "awaiting_approval";
  const action = report?.proposed_action;

  const isRollback = action?.action_type === "rollback";
  const toolName = isRollback ? "trigger_rollback" : "escalate_incident";
  const idempotencyKey = isRollback
    ? `${incident.incident_id}:rollback:${action?.target_sha || "none"}`
    : `${incident.incident_id}:escalate:${report?.severity || "P1"}`;

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedIdem(true);
    setTimeout(() => setCopiedIdem(false), 1800);
  };

  const handleSubmitDecision = async (approved: boolean) => {
    if (!approver.trim()) {
      setErrorMsg("Human reviewer identifier ('approved_by') is required.");
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);
    localStorage.setItem("tracegate_approver", approver.trim());

    try {
      await onApprove({
        approved,
        approved_by: approver.trim(),
        comment: comment.trim() || undefined,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit decision");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Case 1: Executed or Rejected -> Immutable Audit Receipt
  if (incident.status === "executed" || incident.status === "rejected") {
    const isExecuted = incident.status === "executed";
    const receipt = incident.remediation_result as Record<string, unknown> | undefined;
    const record = receipt?.record as Record<string, unknown> | undefined;
    const resolvedKey = (record?.idempotency_key as string) || idempotencyKey;

    return (
      <div
        className={`rounded-md border p-5 space-y-4 ${
          isExecuted
            ? "border-emerald-500/30 bg-emerald-500/[0.02]"
            : "border-red-500/30 bg-red-500/[0.02]"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/90">
          <div className="flex items-center gap-2">
            {isExecuted ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <h3 className="text-sm font-semibold text-zinc-100">
              Remediation Audit Receipt
            </h3>
            <span
              className={`font-mono text-[10px] uppercase px-1.5 py-0.5 rounded border ${
                isExecuted
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
              }`}
            >
              {incident.status}
            </span>
          </div>

          <div className="font-mono text-xs text-zinc-400">
            reviewed_by:{" "}
            <span className="text-zinc-100">
              {incident.approved_by || (record?.approved_by as string) || "operator"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md bg-[#0e0e11] border border-zinc-800/90 p-3.5 font-mono text-xs">
          <div>
            <div className="text-[10px] uppercase text-zinc-500">Action Dispatched</div>
            <div className="text-zinc-100 mt-0.5">
              {(record?.action as string) || (receipt?.status as string) || incident.status}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase text-zinc-500">Idempotency Key</div>
            <button
              type="button"
              onClick={() => copyKey(resolvedKey)}
              className="mt-0.5 flex items-center gap-1.5 text-zinc-200 hover:text-white max-w-full text-left"
              title="Copy idempotency key"
            >
              <span className="truncate">{resolvedKey}</span>
              {copiedIdem ? (
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-3 h-3 text-zinc-500 shrink-0" />
              )}
            </button>
          </div>

          <div>
            <div className="text-[10px] uppercase text-zinc-500">Target SHA / Service</div>
            <div
              className={`mt-0.5 ${
                isExecuted ? "text-emerald-400" : "text-zinc-300"
              }`}
            >
              {(record?.target as string) || action?.target_sha || report?.service || "N/A"}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase text-zinc-500">Recorded At (UTC)</div>
            <div className="text-zinc-300 mt-0.5 tabular-nums">
              {(record?.created_at as string) || "Recorded in :8004 SQLite audit log"}
            </div>
          </div>
        </div>

        {receipt && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              MCP Output Payload (:8004)
            </div>
            <pre className="rounded-md bg-zinc-950 border border-zinc-800/90 p-3 text-[11px] font-mono text-zinc-300 overflow-x-auto">
              {JSON.stringify(receipt, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // Case 2: Awaiting Human Approval -> Crisp 1px Amber Gate
  if (isAwaiting) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/[0.03] p-5 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-amber-500/20">
          <div className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">
                  Human Approval Gate
                </h3>
                <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Execution paused at <code className="font-mono text-zinc-300">interrupt()</code>.
                Human sign-off required before dispatching write to <code className="font-mono text-zinc-300">:8004</code>.
              </p>
            </div>
          </div>

          <span className="font-mono text-xs text-amber-400 shrink-0">WG :8004</span>
        </div>

        {/* Exact Write Dispatch Preview */}
        <div className="rounded-md bg-[#0e0e11] border border-zinc-800/90 p-3.5 space-y-2.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
            <div>
              <div className="text-[10px] uppercase text-zinc-500">MCP Write Tool</div>
              <div className="mt-0.5 text-amber-400 font-medium inline-flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 shrink-0" />
                <span>{toolName}</span>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase text-zinc-500">Target Service</div>
              <div className="mt-0.5 text-zinc-100">
                {report?.service || incident.alert?.service || "unknown"}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase text-zinc-500">
                {isRollback ? "Rollback Target SHA" : "Escalation Severity"}
              </div>
              <div className="mt-0.5">
                {isRollback && action?.target_sha ? (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    {action.target_sha}
                  </span>
                ) : (
                  <span className="text-zinc-300">{report?.severity || "P1"}</span>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 font-mono">
            <span className="text-[11px] text-zinc-500">idempotency_key</span>
            <button
              type="button"
              onClick={() => copyKey(idempotencyKey)}
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-200 hover:text-white transition-colors"
              title="Copy deterministic idempotency key"
            >
              <span className="truncate max-w-md">{idempotencyKey}</span>
              {copiedIdem ? (
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-3 h-3 text-zinc-500 shrink-0" />
              )}
            </button>
          </div>

          {action?.rationale && (
            <div className="pt-2 border-t border-zinc-800/80 text-xs text-zinc-300 leading-relaxed font-sans">
              {action.rationale}
            </div>
          )}
        </div>

        {/* Operator Sign-Off Form */}
        <div className="space-y-3">
          {errorMsg && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
              <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                approved_by <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. rahul-sre"
                value={approver}
                onChange={(e) => setApprover(e.target.value)}
                className="w-full h-8 rounded-md bg-zinc-950 border border-zinc-800 px-2.5 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                Operator Note (Optional)
              </label>
              <input
                type="text"
                placeholder="Verified SHA against baseline"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full h-8 rounded-md bg-zinc-950 border border-zinc-800 px-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => handleSubmitDecision(false)}
              disabled={isSubmitting}
              className="h-8 px-3.5 rounded-md border border-zinc-700 hover:border-red-500/40 hover:bg-red-500/10 text-zinc-300 hover:text-red-400 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>

            <button
              type="button"
              onClick={() => handleSubmitDecision(true)}
              disabled={isSubmitting}
              className="h-8 px-4 rounded-md bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isSubmitting ? "Executing..." : "Approve & Execute"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 3: Investigation / Synthesis In Progress
  return (
    <div className="rounded-md border border-zinc-800/90 bg-[#111113] px-4 py-3 flex items-center justify-between text-xs text-zinc-400">
      <div className="flex items-center gap-2 font-mono">
        <Lock className="w-3.5 h-3.5 text-zinc-500" />
        <span>Write Gate (:8004) locked during read-only investigation</span>
      </div>
      <span className="font-mono text-[11px] text-zinc-500">HITL standby</span>
    </div>
  );
};
