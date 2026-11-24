import React from "react";
import { Eye, Lock, Plus, RefreshCw } from "lucide-react";

interface TopNavProps {
  isApiOnline: boolean;
  isCheckingHealth: boolean;
  onRefreshHealth: () => void;
  onOpenSimulateModal: () => void;
  onSelectHome?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  isApiOnline,
  isCheckingHealth,
  onRefreshHealth,
  onOpenSimulateModal,
  onSelectHome,
}) => {
  return (
    <header className="sticky top-0 z-30 h-12 shrink-0 border-b border-zinc-800/90 bg-[#09090b] px-4 flex items-center justify-between">
      {/* Left: Minimal Brand */}
      <button
        type="button"
        onClick={onSelectHome}
        className="flex items-center gap-2 text-left focus:outline-none group"
        title="Return to Incident Workbench"
      >
        <svg
          className="w-4 h-4 text-zinc-100 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="1.5"
            y="1.5"
            width="13"
            height="13"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M8 4.5V11.5M5 8H11"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-sm font-semibold tracking-tight text-zinc-100 group-hover:text-white transition-colors">
          TraceGate
        </span>
      </button>

      {/* Right: Quiet Telemetry Cluster + Primary CTA */}
      <div className="flex items-center gap-3 font-mono text-xs">
        {/* Boundary Readout */}
        <div className="hidden md:flex items-center gap-3 text-zinc-400">
          <span
            className="inline-flex items-center gap-1.5"
            title="Autonomous Read-Only MCP Gateway (:8010)"
          >
            <Eye className="w-3.5 h-3.5 text-zinc-500" />
            <span>RO :8010</span>
          </span>
          <span
            className="inline-flex items-center gap-1.5"
            title="Human-Gated Write Remediation Server (:8004)"
          >
            <Lock className="w-3.5 h-3.5 text-zinc-500" />
            <span>WG :8004</span>
          </span>
        </div>

        <div className="hidden md:block h-4 w-px bg-zinc-800" />

        {/* Live API Status */}
        <button
          type="button"
          onClick={onRefreshHealth}
          title={
            isApiOnline
              ? "FastAPI backend healthy. Click to re-check."
              : "FastAPI backend unreachable. Click to retry."
          }
          className="inline-flex items-center gap-1.5 px-1.5 py-1 rounded text-xs font-mono hover:bg-zinc-900 transition-colors"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isApiOnline ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          <span className={isApiOnline ? "text-emerald-400" : "text-red-400"}>
            {isApiOnline ? "API Online" : "API Offline"}
          </span>
          {isCheckingHealth && (
            <RefreshCw className="w-3 h-3 text-zinc-400 animate-spin ml-0.5" />
          )}
        </button>

        <div className="h-4 w-px bg-zinc-800" />

        {/* Primary CTA */}
        <button
          type="button"
          onClick={onOpenSimulateModal}
          className="h-7 px-3 rounded-md bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-sans font-medium inline-flex items-center gap-1.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Simulate Outage</span>
        </button>
      </div>
    </header>
  );
};
