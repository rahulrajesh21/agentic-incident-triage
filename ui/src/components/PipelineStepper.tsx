import React from "react";
import {
  CheckCircle2,
  Lock,
  Search,
  Sparkles,
  UserCheck,
  Zap,
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
  // Steps:
  // 1: Investigate (Read-only :8010)
  // 2: Synthesize (Read-only :8010)
  // [Security Boundary Divider]
  // 3: Human Approval Gate (interrupt)
  // 4: Write Execution (:8004)

  const getStepState = (stepIndex: number) => {
    // 0: investigating
    // 1: synthesizing
    // 2: awaiting_approval
    // 3: executed / rejected
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
      if (stepIndex === 2) return "paused"; // amber pause
      return "pending";
    }
    if (status === "executed") {
      return "completed";
    }
    if (status === "rejected") {
      if (stepIndex <= 2) return "completed";
      return "rejected";
    }
    return "pending";
  };

  const steps = [
    {
      label: "1. Investigate",
      desc: "Telemetry, Git & Runbooks",
      port: ":8010",
      icon: Search,
      isReadOnly: true,
    },
    {
      label: "2. Synthesize",
      desc: "Calibrate Confidence & Plan",
      port: ":8010",
      icon: Sparkles,
      isReadOnly: true,
    },
    {
      label: "3. Approval Gate",
      desc: "Human Operator Review",
      port: "HITL",
      icon: UserCheck,
      isReadOnly: false,
    },
    {
      label: "4. Remediation",
      desc: "Deterministic Write Dispatch",
      port: ":8004",
      icon: Zap,
      isReadOnly: false,
    },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/60 backdrop-blur-md p-4">
      {/* Zone Header Labels */}
      <div className="flex items-center justify-between mb-3 text-[10px] uppercase font-mono tracking-wider">
        <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
          <Search className="h-3 w-3" />
          <span>AUTONOMOUS READ-ONLY INVESTIGATION ZONE (:8010)</span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
          <Lock className="h-3 w-3" />
          <span>WRITE-GATED REMEDIATION ZONE (:8004)</span>
        </div>
      </div>

      {/* Stepper Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 relative">
        {steps.map((step, idx) => {
          const state = getStepState(idx);
          const Icon = step.icon;

          return (
            <div
              key={step.label}
              className={`relative rounded-lg p-3 border transition-all ${
                state === "paused"
                  ? "bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-950/50 ring-1 ring-amber-500 animate-glow-amber"
                  : state === "active"
                  ? "bg-cyan-950/40 border-cyan-500 shadow-md shadow-cyan-950/30 ring-1 ring-cyan-500/50"
                  : state === "completed"
                  ? "bg-zinc-900/80 border-emerald-500/30 text-zinc-300"
                  : state === "rejected"
                  ? "bg-rose-950/40 border-rose-500/50 text-rose-300"
                  : "bg-zinc-950/40 border-zinc-800/80 text-zinc-500"
              }`}
            >
              {/* Top Row: Icon + Port */}
              <div className="flex items-center justify-between mb-1.5">
                <div
                  className={`p-1.5 rounded-md ${
                    state === "paused"
                      ? "bg-amber-500/20 text-amber-300"
                      : state === "active"
                      ? "bg-cyan-500/20 text-cyan-300 animate-pulse"
                      : state === "completed"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : state === "rejected"
                      ? "bg-rose-500/20 text-rose-400"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <div className="flex items-center gap-1">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      step.isReadOnly
                        ? "bg-cyan-950/60 text-cyan-400 border border-cyan-800/50"
                        : "bg-amber-950/60 text-amber-400 border border-amber-800/50"
                    }`}
                  >
                    {step.port}
                  </span>
                  {state === "completed" && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  {state === "paused" && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                  )}
                </div>
              </div>

              {/* Title & Desc */}
              <div className="font-semibold text-xs text-zinc-100 flex items-center gap-1">
                {step.label}
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{step.desc}</p>

              {/* Status footer */}
              <div className="mt-2 text-[10px] font-mono uppercase tracking-wider">
                {state === "paused" ? (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    PAUSED AT APPROVAL
                  </span>
                ) : state === "active" ? (
                  <span className="text-cyan-400 font-bold flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    IN PROGRESS...
                  </span>
                ) : state === "completed" ? (
                  <span className="text-emerald-400">DONE</span>
                ) : state === "rejected" ? (
                  <span className="text-rose-400 font-bold">REJECTED BY HUMAN</span>
                ) : (
                  <span className="text-zinc-600">PENDING</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
