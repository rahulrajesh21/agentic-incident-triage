import React, { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckSquare,
  Copy,
  GitCommit,
  RotateCcw,
} from "lucide-react";
import { TriageReport } from "../types/tracegate";

interface TriageReportPanelProps {
  report: TriageReport;
}

export const TriageReportPanel: React.FC<TriageReportPanelProps> = ({ report }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const confidencePct = Math.round(report.confidence * 100);
  const getConfidenceStyle = (conf: number) => {
    if (conf >= 0.85) return { text: "text-emerald-400", bar: "bg-emerald-500", label: "High" };
    if (conf >= 0.6) return { text: "text-amber-400", bar: "bg-amber-500", label: "Moderate" };
    return { text: "text-red-400", bar: "bg-red-500", label: "Low" };
  };

  const confStyle = getConfidenceStyle(report.confidence);
  const isRollback = report.proposed_action?.action_type === "rollback";

  return (
    <div className="rounded-md border border-zinc-800/90 bg-[#111113] p-5 space-y-4">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-zinc-800/90">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span
            className={`font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded border ${
              report.severity === "P1"
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : report.severity === "P2"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                : "bg-zinc-800 text-zinc-300 border-zinc-700"
            }`}
          >
            {report.severity}
          </span>
          <h3 className="font-semibold text-sm text-zinc-100 font-mono">
            {report.service}
          </h3>
          <span
            className={`font-mono text-[11px] uppercase px-1.5 py-0.5 rounded border ${
              isRollback
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
            }`}
          >
            proposed: {report.proposed_action?.action_type}
          </span>
        </div>

        {/* Confidence Calibration */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase text-zinc-500">
              Confidence
            </div>
            <div className="font-mono text-xs tabular-nums flex items-center justify-end gap-1.5">
              <span className={`font-semibold ${confStyle.text}`}>
                {confidencePct}%
              </span>
              <span className="text-zinc-500">({confStyle.label})</span>
            </div>
          </div>
          <div className="w-20 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${confStyle.bar}`}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Root Cause Summary */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
          Root Cause Summary
        </div>
        <div className="rounded-md bg-[#0e0e11] border border-zinc-800/90 p-3.5 text-xs text-zinc-200 leading-relaxed">
          {report.root_cause_summary}
        </div>
      </div>

      {/* Git SHA Trajectory */}
      {(report.culprit_sha || report.proposed_action?.target_sha) && (
        <div className="rounded-md border border-zinc-800/90 bg-[#0e0e11] p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
            <span className="uppercase tracking-wider">Git Commit Diff</span>
            <span>{report.service}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs pt-1">
            {/* Culprit */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-[11px]">Culprit:</span>
              {report.culprit_sha ? (
                <button
                  type="button"
                  onClick={() => copyToClipboard(report.culprit_sha!, "culprit")}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-red-500/30 text-red-400 hover:border-red-500/50 transition-colors"
                >
                  <GitCommit className="w-3 h-3" />
                  <span>{report.culprit_sha}</span>
                  {copiedKey === "culprit" ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3 text-zinc-500" />
                  )}
                </button>
              ) : (
                <span className="text-zinc-500">none (external dependency)</span>
              )}
            </div>

            <ArrowRight className="w-3.5 h-3.5 text-zinc-600 hidden sm:block" />

            {/* Target */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-[11px]">Rollback Target:</span>
              {report.proposed_action?.target_sha ? (
                <button
                  type="button"
                  onClick={() => copyToClipboard(report.proposed_action.target_sha!, "target")}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-emerald-500/30 text-emerald-400 hover:border-emerald-500/50 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{report.proposed_action.target_sha}</span>
                  {copiedKey === "target" ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3 text-zinc-500" />
                  )}
                </button>
              ) : (
                <span className="text-zinc-500">N/A (escalate only)</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Remediation Rationale */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
          Remediation Rationale
        </div>
        <div className="rounded-md bg-[#0e0e11] border border-zinc-800/90 p-3 text-xs text-zinc-300 leading-relaxed">
          {report.proposed_action?.rationale}
        </div>
      </div>

      {/* Runbooks & Next Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        {/* Active Runbooks */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Active Runbooks</span>
            <span className="tabular-nums">{report.runbook_references?.length || 0}</span>
          </div>
          <div className="space-y-1.5">
            {report.runbook_references && report.runbook_references.length > 0 ? (
              report.runbook_references.map((rb) => (
                <button
                  key={rb}
                  type="button"
                  onClick={() => copyToClipboard(rb, rb)}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-[#0e0e11] border border-zinc-800/90 hover:border-zinc-700 text-xs font-mono text-emerald-400 text-left transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{rb}</span>
                  </span>
                  {copiedKey === rb ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  )}
                </button>
              ))
            ) : (
              <div className="p-2.5 rounded-md bg-[#0e0e11] border border-zinc-800/90 text-xs text-zinc-500">
                No active runbook matched.
              </div>
            )}
          </div>
        </div>

        {/* Recommended Next Steps */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>On-Call Next Steps</span>
            <span className="tabular-nums">{report.recommended_next_steps?.length || 0}</span>
          </div>
          <div className="space-y-1.5">
            {report.recommended_next_steps && report.recommended_next_steps.length > 0 ? (
              report.recommended_next_steps.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-[#0e0e11] border border-zinc-800/90 text-xs text-zinc-300"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                  <span className="leading-snug">{step}</span>
                </div>
              ))
            ) : (
              <div className="p-2.5 rounded-md bg-[#0e0e11] border border-zinc-800/90 text-xs text-zinc-500">
                No follow-up steps recorded.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
