import React from "react";
import {
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";

interface TopNavProps {
  isApiOnline: boolean;
  isCheckingHealth: boolean;
  onRefreshHealth: () => void;
  onOpenSimulateModal: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  isApiOnline,
  isCheckingHealth,
  onRefreshHealth,
  onOpenSimulateModal,
}) => {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-white/10 bg-[#09090b]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between">
      {/* Brand & Title */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
            <ShieldAlert className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                TraceGate
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold tracking-wider">
                v1.0.0
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">
              Autonomous SRE Incident Triage & Human-in-the-Loop Gateway
            </p>
          </div>
        </div>

        {/* Security Boundary Badges */}
        <div className="hidden md:flex items-center gap-2 pl-4 border-l border-zinc-800">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-cyan-950/40 border border-cyan-500/20 text-cyan-300">
            <Search className="h-3 w-3 text-cyan-400" />
            <span className="text-zinc-400">READ-ONLY:</span>
            <span className="font-semibold text-cyan-300">8010</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-amber-950/40 border border-amber-500/20 text-amber-300">
            <Lock className="h-3 w-3 text-amber-400" />
            <span className="text-zinc-400">WRITE-GATE:</span>
            <span className="font-semibold text-amber-300">8004</span>
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Health Status Indicator */}
        <button
          onClick={onRefreshHealth}
          title="Click to check backend health"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-white/5 bg-zinc-900/60 hover:bg-zinc-800/60 transition text-xs font-mono"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isApiOnline
                ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"
                : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
            }`}
          />
          <span className={isApiOnline ? "text-emerald-400" : "text-rose-400"}>
            {isApiOnline ? "API Online" : "API Offline"}
          </span>
          <RefreshCw
            className={`h-3 w-3 text-zinc-500 ${isCheckingHealth ? "animate-spin text-cyan-400" : ""}`}
          />
        </button>

        {/* Simulate Outage Trigger */}
        <button
          onClick={onOpenSimulateModal}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-medium shadow-md shadow-cyan-600/25 border border-cyan-400/20 transition-all active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Simulate Outage</span>
        </button>
      </div>
    </header>
  );
};
