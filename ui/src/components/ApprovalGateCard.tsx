import React, { useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  Fingerprint,
  Lock,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  User,
  XCircle,
  Zap,
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

  const report = incident.triage_report;
  const isAwaiting = incident.awaiting_human_approval || incident.status === "awaiting_approval";
  const action = report?.proposed_action;

  // Compute idempotency key preview
  const isRollback = action?.action_type === "rollback";
  const idempotencyKey = isRollback
    ? `${incident.incident_id}:rollback:${action?.target_sha || "none"}`
    : `${incident.incident_id}:escalate:${report?.severity || "P1"}`;

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

  // Case 1: Already Executed or Rejected -> Immutable Audit Log Receipt
  if (incident.status === "executed" || incident.status === "rejected") {
    const isExecuted = incident.status === "executed";
    const receipt = incident.remediation_result as Record<string, unknown> | undefined;
    const record = receipt?.record as Record<string, unknown> | undefined;

    return (
      <div
        className={`rounded-xl border p-5 transition-all ${
          isExecuted
            ? "bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-950 border-emerald-500/40 shadow-xl shadow-emerald-950/20"
            : "bg-gradient-to-br from-rose-950/40 via-zinc-900 to-zinc-950 border-rose-500/40 shadow-xl shadow-rose-950/20"
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg ${
                isExecuted ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
              }`}
            >
              {isExecuted ? <ShieldCheck className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>Remediation Audit Receipt</span>
                <span
                  className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-bold ${
                    isExecuted
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                      : "bg-rose-950 text-rose-300 border border-rose-700"
                  }`}
                >
                  {incident.status}
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                Deterministic write log stored in SQLite audit trail (:8004).
              </p>
            </div>
          </div>

          <div className="text-right font-mono text-xs text-zinc-400">
            <span>Reviewed By: </span>
            <span className="text-white font-semibold">
              {incident.approved_by || (record?.approved_by as string) || "operator"}
            </span>
          </div>
        </div>

        {/* Audit Details */}
        <div className="space-y-3 font-mono text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-zinc-950/70 p-3.5 rounded-lg border border-white/5">
            <div>
              <span className="text-zinc-500 text-[11px]">Action Dispatched:</span>
              <p className="font-bold text-zinc-200 mt-0.5">
                {(record?.action as string) || (receipt?.status as string) || incident.status}
              </p>
            </div>
            <div>
              <span className="text-zinc-500 text-[11px]">Idempotency Key:</span>
              <p className="font-bold text-cyan-300 mt-0.5 truncate">
                {(record?.idempotency_key as string) || idempotencyKey}
              </p>
            </div>
            <div>
              <span className="text-zinc-500 text-[11px]">Target SHA / Service:</span>
              <p className="font-bold text-emerald-300 mt-0.5">
                {(record?.target as string) || action?.target_sha || report?.service || "N/A"}
              </p>
            </div>
            <div>
              <span className="text-zinc-500 text-[11px]">Recorded At (UTC):</span>
              <p className="font-bold text-zinc-300 mt-0.5">
                {(record?.created_at as string) || new Date().toISOString()}
              </p>
            </div>
          </div>

          {/* Raw Payload Drawer */}
          {receipt && (
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-zinc-500 font-semibold">
                Remediation MCP Output Payload
              </span>
              <pre className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-[11px] text-zinc-300 overflow-x-auto">
                {JSON.stringify(receipt, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Case 2: Awaiting Approval -> Hero Action Box
  if (isAwaiting) {
    return (
      <div className="rounded-xl border-2 border-amber-500/80 bg-gradient-to-br from-amber-950/40 via-zinc-900 to-zinc-950 p-5 shadow-2xl shadow-amber-950/40 ring-1 ring-amber-500/40 animate-glow-amber space-y-4">
        {/* Header Alert */}
        <div className="flex items-center justify-between pb-3 border-b border-amber-500/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 animate-pulse">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>Human Approval Gate Paused</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500 text-black font-bold tracking-wider">
                  ACTION REQUIRED
                </span>
              </h3>
              <p className="text-[11px] text-amber-200/80">
                Execution paused at <code className="font-mono text-amber-300">approval_gate (interrupt)</code>.
                Write actions require human verification before hitting port :8004.
              </p>
            </div>
          </div>

          <div className="hidden sm:block text-right">
            <div className="text-[10px] uppercase font-mono text-amber-400 font-semibold">
              Write Target
            </div>
            <div className="text-xs font-mono text-white font-bold">
              Remediation MCP (:8004)
            </div>
          </div>
        </div>

        {/* Action Preview Card */}
        <div className="bg-zinc-950/80 rounded-lg p-3.5 border border-amber-500/20 space-y-2.5 font-mono text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="text-zinc-400">Target Write Tool:</span>
              <span className="text-amber-300 font-bold">
                {isRollback ? "trigger_rollback" : "escalate_incident"}
              </span>
            </div>

            <div className="text-[11px] text-zinc-400">
              Service: <span className="text-white font-bold">{report?.service}</span>
            </div>
          </div>

          {isRollback && action?.target_sha && (
            <div className="flex items-center gap-2 text-xs bg-emerald-950/40 p-2 rounded border border-emerald-500/30">
              <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-300">Rollback Target SHA:</span>
              <span className="font-bold text-white px-1.5 py-0.5 rounded bg-emerald-900/60 border border-emerald-600/50">
                {action.target_sha}
              </span>
            </div>
          )}

          <div className="text-[11px] text-zinc-400 flex items-center gap-2 pt-1 border-t border-zinc-800">
            <Fingerprint className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-zinc-500">Idempotency Key:</span>
            <span className="text-cyan-300 truncate">{idempotencyKey}</span>
          </div>

          {action?.rationale && (
            <p className="text-zinc-300 font-sans text-xs pt-1 border-t border-zinc-850">
              <span className="text-zinc-500 font-mono text-[10px] uppercase block mb-0.5">
                Proposed Rationale:
              </span>
              {action.rationale}
            </p>
          )}
        </div>

        {/* Form Controls */}
        <div className="space-y-3 pt-1">
          {errorMsg && (
            <div className="p-2.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 uppercase mb-1">
                Human Reviewer <span className="text-amber-400">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="e.g. rahul-oncall"
                  value={approver}
                  onChange={(e) => setApprover(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-zinc-400 uppercase mb-1">
                Operator Comment (Optional)
              </label>
              <div className="relative">
                <MessageSquare className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="e.g. Verified rollback SHA matches baseline config."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => handleSubmitDecision(false)}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rose-600/60 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 text-xs font-semibold shadow transition active:scale-95 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              <span>Reject Remediation</span>
            </button>

            <button
              onClick={() => handleSubmitDecision(true)}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 border border-emerald-400/40 transition active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isSubmitting ? "Dispatching Write..." : "Approve & Execute Fix"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 3: Still investigating or synthesizing -> Placeholder
  return (
    <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 text-center text-xs text-zinc-500 space-y-1">
      <p className="font-mono text-zinc-400">
        Write Gate Locked (Autonomous Investigation in Progress)
      </p>
      <p className="text-[11px]">
        When synthesis completes, human sign-off will be requested here before any write action fires.
      </p>
    </div>
  );
};
