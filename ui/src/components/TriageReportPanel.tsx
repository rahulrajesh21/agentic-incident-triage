import React, { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckSquare,
  Copy,
  GitBranch,
  GitCommit,
  ListChecks,
  RotateCcw,
  Sparkles,
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
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const confidencePct = Math.round(report.confidence * 100);
  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.85) return "text-emerald-400 bg-emerald-500";
    if (conf >= 0.6) return "text-amber-400 bg-amber-500";
    return "text-rose-400 bg-rose-500";
  };

  const isRollback = report.proposed_action?.action_type === "rollback";

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/70 backdrop-blur-md p-5 space-y-4">
      {/* Top Banner: Service, Priority, Confidence */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md border ${
                report.severity === "P1"
                  ? "bg-rose-950/80 text-rose-300 border-rose-800"
                  : report.severity === "P2"
                  ? "bg-amber-950/80 text-amber-300 border-amber-800"
                  : "bg-zinc-800 text-zinc-300 border-zinc-700"
              }`}
            >
              {report.severity}
            </span>
            <h3 className="font-bold text-base text-white tracking-tight">
              {report.service}
            </h3>
          </div>

          <span
            className={`text-xs font-mono px-2 py-0.5 rounded border uppercase font-semibold ${
              isRollback
                ? "bg-cyan-950/80 text-cyan-300 border-cyan-800"
                : "bg-amber-950/80 text-amber-300 border-amber-800"
            }`}
          >
            Proposed Action: {report.proposed_action?.action_type}
          </span>
        </div>

        {/* Calibrated Confidence Gauge */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase font-mono text-zinc-400">
              Confidence Calibration
            </div>
            <div className="text-sm font-mono font-bold text-white flex items-center justify-end gap-1.5">
              <span className={getConfidenceColor(report.confidence).split(" ")[0]}>
                {confidencePct}%
              </span>
              <span className="text-[11px] text-zinc-500 font-normal">
                ({report.confidence >= 0.85 ? "High / Tri-Verified" : report.confidence >= 0.6 ? "Moderate" : "Low / Inconclusive"})
              </span>
            </div>
          </div>

          <div className="w-24 h-2 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700">
            <div
              className={`h-full transition-all duration-500 ${getConfidenceColor(report.confidence).split(" ")[1]}`}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Root Cause Summary */}
      <div>
        <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          <span>Root Cause Summary</span>
        </h4>
        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/80 p-3.5 text-xs text-zinc-200 leading-relaxed font-sans">
          {report.root_cause_summary}
        </div>
      </div>

      {/* Git SHA Comparison Bar (if Culprit or Target exists) */}
      {(report.culprit_sha || report.proposed_action?.target_sha) && (
        <div className="rounded-lg border border-cyan-500/20 bg-gradient-to-r from-cyan-950/30 via-zinc-950 to-indigo-950/30 p-3.5 space-y-2">
          <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
              <GitBranch className="h-3.5 w-3.5" />
              Git State Trajectory
            </span>
            <span className="text-[10px] text-zinc-500">Service: {report.service}</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/80 rounded-md p-2.5 border border-white/5 font-mono text-xs">
            {/* Culprit SHA */}
            <div className="flex items-center gap-2">
              <span className="text-rose-400 font-medium text-[11px]">Culprit Commit:</span>
              {report.culprit_sha ? (
                <button
                  onClick={() => copyToClipboard(report.culprit_sha!, "culprit")}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 hover:bg-rose-900/60 transition group"
                >
                  <GitCommit className="h-3 w-3 text-rose-400" />
                  <span className="font-bold">{report.culprit_sha}</span>
                  <Copy className="h-2.5 w-2.5 text-rose-400/60 group-hover:text-rose-300" />
                </button>
              ) : (
                <span className="text-zinc-500 text-xs italic">None (External / DNS)</span>
              )}
            </div>

            <ArrowRight className="h-4 w-4 text-zinc-600 hidden sm:block" />

            {/* Target Rollback SHA */}
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-medium text-[11px]">Rollback Target:</span>
              {report.proposed_action?.target_sha ? (
                <button
                  onClick={() => copyToClipboard(report.proposed_action.target_sha!, "target")}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/60 transition group"
                >
                  <RotateCcw className="h-3 w-3 text-emerald-400" />
                  <span className="font-bold">{report.proposed_action.target_sha}</span>
                  <Copy className="h-2.5 w-2.5 text-emerald-400/60 group-hover:text-emerald-300" />
                </button>
              ) : (
                <span className="text-zinc-500 text-xs italic">N/A (Escalate Only)</span>
              )}
            </div>
          </div>
          {copiedKey && (
            <p className="text-[10px] text-emerald-400 font-mono text-right">
              Copied {copiedKey} SHA to clipboard!
            </p>
          )}
        </div>
      )}

      {/* Action Rationale */}
      <div className="rounded-lg bg-zinc-950/40 border border-zinc-800 p-3 text-xs space-y-1">
        <span className="text-[10px] uppercase font-mono text-zinc-500 font-semibold">
          Remediation Rationale
        </span>
        <p className="text-zinc-300 leading-relaxed font-sans">
          {report.proposed_action?.rationale}
        </p>
      </div>

      {/* Two Column Section: Runbook References & Next Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        {/* Runbook References */}
        <div className="space-y-2">
          <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-cyan-400" />
            <span>Active Runbooks ({report.runbook_references?.length || 0})</span>
          </h4>
          <div className="space-y-1.5">
            {report.runbook_references && report.runbook_references.length > 0 ? (
              report.runbook_references.map((rb) => (
                <div
                  key={rb}
                  onClick={() => copyToClipboard(rb, rb)}
                  className="group flex items-center justify-between p-2 rounded-md bg-zinc-950/60 border border-zinc-800 hover:border-cyan-500/40 text-xs font-mono text-cyan-300 cursor-pointer transition"
                >
                  <span className="truncate">{rb}</span>
                  <Copy className="h-3 w-3 text-zinc-500 group-hover:text-cyan-300" />
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-500 italic p-2 bg-zinc-950/40 rounded border border-zinc-850">
                No active runbook matched this failure mode.
              </p>
            )}
          </div>
        </div>

        {/* Recommended Next Steps */}
        <div className="space-y-2">
          <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5 text-indigo-400" />
            <span>On-Call Next Steps ({report.recommended_next_steps?.length || 0})</span>
          </h4>
          <div className="space-y-1.5">
            {report.recommended_next_steps && report.recommended_next_steps.length > 0 ? (
              report.recommended_next_steps.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2 rounded-md bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-300"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{step}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-500 italic p-2 bg-zinc-950/40 rounded border border-zinc-850">
                No specific follow-up actions recorded.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
