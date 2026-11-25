import React from "react";
import {
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Lock,
  Search,
  Terminal,
  UserCheck,
  XCircle,
} from "lucide-react";
import { IncidentStatus } from "../types/tracegate";

interface PipelineStepperProps {
  status: IncidentStatus;
  awaitingApproval?: boolean;
}

export const PipelineStepper: React.FC<PipelineStepperProps> = ({
  status,
  awaitingApproval,
}) => {
  const getStepState = (stepIndex: number) => {
    if (status === "investigating") {
      if (stepIndex === 0) return "active";
      return "pending";
    }
    if (status === "synthesizing") {
      if (stepIndex === 0) return "completed";
      if (stepIndex === 1) return "active";
      return "pending";
    }
    if (status === "awaiting_approval" || awaitingApproval) {
      if (stepIndex <= 1) return "completed";
      if (stepIndex === 2) return "paused";
      return "pending";
    }
    if (status === "executed") {
      return "completed";
    }
    if (status === "rejected") {
      if (stepIndex <= 2) return "completed";
      return "rejected";
    }
    if (status === "failed") {
      if (stepIndex === 0) return "completed";
      if (stepIndex === 1) return "failed";
      return "pending";
    }
    return "pending";
  };

  const steps = [
    {
      index: "01",
      label: "Investigate",
      desc: "Telemetry, Git & Runbooks",
      port: ":8010",
      icon: Search,
    },
    {
      index: "02",
      label: "Synthesize",
      desc: "Calibrate Confidence & Plan",
      port: ":8010",
      icon: FileText,
    },
    {
      index: "03",
      label: "Approval Gate",
      desc: "LangGraph interrupt()",
      port: "HITL",
      icon: UserCheck,
    },
    {
      index: "04",
      label: "Remediate",
      desc: "Write Dispatch & Audit",
      port: ":8004",
      icon: Terminal,
    },
  ];

  const isPaused = status === "awaiting_approval" || Boolean(awaitingApproval);

  return (
    <div className="rounded-md border border-zinc-800/90 bg-[#111113] p-4 space-y-3">
      {/* Boundary Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-zinc-500" />
          <span>RO :8010 · Investigate &amp; Synthesize</span>
        </span>
        <span
          className={`inline-flex items-center gap-1.5 ${
            isPaused ? "text-amber-400" : "text-zinc-400"
          }`}
        >
          <Lock className={`w-3.5 h-3.5 ${isPaused ? "text-amber-400" : "text-zinc-500"}`} />
          <span>WG :8004 · Human Gate &amp; Write</span>
        </span>
      </div>

      {/* 4-Stage Pipeline Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 border border-zinc-800/90 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/90 bg-[#0e0e11] overflow-hidden">
        {steps.map((step, idx) => {
          const state = getStepState(idx);
          const Icon = step.icon;

          return (
            <div
              key={step.label}
              className={`p-3 transition-colors ${
                state === "paused"
                  ? "bg-amber-500/[0.04] ring-1 ring-inset ring-amber-500/40"
                  : state === "active"
                  ? "bg-zinc-900"
                  : state === "rejected" || state === "failed"
                  ? "bg-red-500/[0.03]"
                  : "bg-transparent"
              }`}
            >
              {/* Header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      state === "paused"
                        ? "text-amber-400"
                        : state === "active"
                        ? "text-zinc-200"
                        : state === "completed"
                        ? "text-emerald-400"
                        : state === "rejected" || state === "failed"
                        ? "text-red-400"
                        : "text-zinc-500"
                    }`}
                  />
                  <span className="text-xs font-medium text-zinc-100 truncate">
                    {step.index} {step.label}
                  </span>
                </div>

                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                    state === "paused"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800"
                  }`}
                >
                  {step.port}
                </span>
              </div>

              {/* Description */}
              <div className="text-[11px] text-zinc-500 mt-1 truncate">
                {step.desc}
              </div>

              {/* Status line */}
              <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                {state === "paused" ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span className="text-amber-400 font-medium">Awaiting Sign-Off</span>
                  </>
                ) : state === "active" ? (
                  <>
                    <Loader2 className="w-3 h-3 text-zinc-300 animate-spin" />
                    <span className="text-zinc-300">In Progress</span>
                  </>
                ) : state === "completed" ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Done</span>
                  </>
                ) : state === "rejected" ? (
                  <>
                    <XCircle className="w-3 h-3 text-red-400" />
                    <span className="text-red-400">Rejected</span>
                  </>
                ) : state === "failed" ? (
                  <>
                    <XCircle className="w-3 h-3 text-red-400" />
                    <span className="text-red-400">Failed</span>
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                    <span className="text-zinc-600">Pending</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
