import React, { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  Shield,
  XCircle,
} from "lucide-react";
import { IncidentDetail, IncidentStatus } from "../types/tracegate";

interface IncidentSidebarProps {
  incidents: Record<string, IncidentDetail | undefined>;
  incidentIds: string[];
  selectedId: string | null;
  onSelectIncident: (id: string) => void;
  onLookupIncident: (id: string) => void;
}

export const IncidentSidebar: React.FC<IncidentSidebarProps> = ({
  incidents,
  incidentIds,
  selectedId,
  onSelectIncident,
  onLookupIncident,
}) => {
  const [filter, setFilter] = useState<"all" | "approval" | "investigating" | "closed">("all");
  const [manualId, setManualId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualId.trim()) {
      onLookupIncident(manualId.trim());
      setManualId("");
    }
  };

  const filteredIds = incidentIds.filter((id) => {
    const inc = incidents[id];
    // Text search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = id.toLowerCase().includes(q);
      const matchService = inc?.alert?.service?.toLowerCase().includes(q) || inc?.triage_report?.service?.toLowerCase().includes(q);
      const matchAlert = inc?.alert?.alertname?.toLowerCase().includes(q);
      if (!matchId && !matchService && !matchAlert) return false;
    }

    if (filter === "all") return true;
    if (filter === "approval") return inc?.status === "awaiting_approval" || inc?.awaiting_human_approval;
    if (filter === "investigating") return inc?.status === "investigating" || inc?.status === "synthesizing";
    if (filter === "closed") return inc?.status === "executed" || inc?.status === "rejected";
    return true;
  });

  const getStatusIcon = (status?: IncidentStatus, awaitingApproval?: boolean) => {
    if (awaitingApproval || status === "awaiting_approval") {
      return (
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span>
        </span>
      );
    }
    if (status === "investigating" || status === "synthesizing") {
      return <Loader2 className="h-3 w-3 text-cyan-400 animate-spin" />;
    }
    if (status === "executed") {
      return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
    }
    if (status === "rejected") {
      return <XCircle className="h-3 w-3 text-rose-400" />;
    }
    return <Clock className="h-3 w-3 text-zinc-500" />;
  };

  const getSeverityBadge = (severity?: string) => {
    const s = severity?.toLowerCase();
    if (s === "critical" || s === "p1") {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60 font-semibold">
          P1
        </span>
      );
    }
    if (s === "warning" || s === "p2") {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 font-semibold">
          P2
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
        P3
      </span>
    );
  };

  return (
    <aside className="w-full lg:w-80 border-r border-white/10 bg-[#09090b]/80 backdrop-blur-md flex flex-col h-[calc(100vh-4rem)]">
      {/* Search & Manual Lookup */}
      <div className="p-3.5 border-b border-zinc-800 space-y-2.5 bg-zinc-950/40">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search service, alert, SHA..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/60"
          />
        </div>

        <form onSubmit={handleManualSubmit} className="flex gap-1.5">
          <input
            type="text"
            placeholder="Manual incident_id lookup..."
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/60"
          />
          <button
            type="submit"
            className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-xs font-mono text-zinc-200 transition"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>

        {/* Filters */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {(
            [
              { key: "all", label: "All" },
              { key: "approval", label: "Approval" },
              { key: "investigating", label: "Active" },
              { key: "closed", label: "Closed" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                filter === item.key
                  ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Incident List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filteredIds.length === 0 ? (
          <div className="text-center py-10 px-4 text-zinc-500 text-xs">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-30 text-zinc-400" />
            <p>No incidents found.</p>
            <p className="text-[11px] text-zinc-600 mt-1">
              Click &quot;Simulate Outage&quot; or dispatch an Alertmanager webhook.
            </p>
          </div>
        ) : (
          filteredIds.map((id) => {
            const inc = incidents[id];
            const isSelected = selectedId === id;
            const isAwaiting = inc?.status === "awaiting_approval" || inc?.awaiting_human_approval;

            return (
              <div
                key={id}
                onClick={() => onSelectIncident(id)}
                className={`group cursor-pointer rounded-lg p-3 border transition-all text-left ${
                  isSelected
                    ? "bg-gradient-to-r from-cyan-950/50 to-zinc-900 border-cyan-500/50 shadow-md shadow-cyan-950/20 ring-1 ring-cyan-500/30"
                    : isAwaiting
                    ? "bg-amber-950/20 border-amber-500/30 hover:border-amber-500/60"
                    : "bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-850/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 truncate">
                    {getStatusIcon(inc?.status, isAwaiting)}
                    <span className="font-semibold text-xs text-zinc-200 truncate">
                      {inc?.alert?.service || inc?.triage_report?.service || "investigating-svc"}
                    </span>
                  </div>
                  {getSeverityBadge(inc?.triage_report?.severity || inc?.alert?.severity)}
                </div>

                <p className="text-[11px] text-zinc-400 line-clamp-1 mb-2">
                  {inc?.alert?.alertname || inc?.alert?.summary || "Active Investigation"}
                </p>

                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span className="truncate max-w-[140px] text-zinc-400 font-semibold">{id}</span>
                  <span
                    className={`uppercase font-medium ${
                      isAwaiting
                        ? "text-amber-400 font-bold"
                        : inc?.status === "executed"
                        ? "text-emerald-400"
                        : inc?.status === "investigating"
                        ? "text-cyan-400"
                        : "text-zinc-500"
                    }`}
                  >
                    {isAwaiting ? "NEEDS SIGN-OFF" : inc?.status || "PENDING"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-zinc-800 text-[11px] font-mono text-zinc-500 bg-zinc-950/60 flex items-center justify-between">
        <span>Tracked: {incidentIds.length}</span>
        <span className="text-zinc-600">Storage: localStorage</span>
      </div>
    </aside>
  );
};
