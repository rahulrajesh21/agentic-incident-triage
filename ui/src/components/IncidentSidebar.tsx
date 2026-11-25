import React, { useState } from "react";
import { Search, X } from "lucide-react";
import { IncidentDetail, IncidentStatus } from "../types/tracegate";

interface IncidentSidebarProps {
  incidents: Record<string, IncidentDetail | undefined>;
  incidentIds: string[];
  selectedId: string | null;
  onSelectIncident: (id: string) => void;
  onLookupIncident: (id: string) => void;
  onClearIncidents: () => void;
}

export const IncidentSidebar: React.FC<IncidentSidebarProps> = ({
  incidents,
  incidentIds,
  selectedId,
  onSelectIncident,
  onLookupIncident,
  onClearIncidents,
}) => {
  const [filter, setFilter] = useState<"all" | "approval" | "investigating" | "closed">("all");
  const [query, setQuery] = useState<string>("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const trimmed = query.trim();
      if (!trimmed) return;
      if (/^inc-/i.test(trimmed)) {
        e.preventDefault();
        onLookupIncident(trimmed);
        setQuery("");
      } else if (filteredIds.length === 1) {
        e.preventDefault();
        onSelectIncident(filteredIds[0]);
      }
    }
  };

  const matchesSearch = (id: string) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const inc = incidents[id];
    return (
      id.toLowerCase().includes(q) ||
      Boolean(inc?.alert?.service?.toLowerCase().includes(q)) ||
      Boolean(inc?.triage_report?.service?.toLowerCase().includes(q)) ||
      Boolean(inc?.alert?.alertname?.toLowerCase().includes(q))
    );
  };

  const matchesTab = (id: string, tab: typeof filter) => {
    const inc = incidents[id];
    if (tab === "all") return true;
    if (tab === "approval") {
      return inc?.status === "awaiting_approval" || Boolean(inc?.awaiting_human_approval);
    }
    if (tab === "investigating") {
      return inc?.status === "investigating" || inc?.status === "synthesizing";
    }
    if (tab === "closed") {
      return inc?.status === "executed" || inc?.status === "rejected" || inc?.status === "failed";
    }
    return true;
  };

  const tabCounts = {
    all: incidentIds.length,
    approval: incidentIds.filter((id) => matchesTab(id, "approval")).length,
    investigating: incidentIds.filter((id) => matchesTab(id, "investigating")).length,
    closed: incidentIds.filter((id) => matchesTab(id, "closed")).length,
  };

  const filteredIds = incidentIds.filter((id) => matchesSearch(id) && matchesTab(id, filter));

  const getStatusDotClass = (status?: IncidentStatus, awaitingApproval?: boolean) => {
    if (awaitingApproval || status === "awaiting_approval") {
      return "bg-amber-500";
    }
    if (status === "executed") {
      return "bg-emerald-500";
    }
    if (status === "rejected" || status === "failed") {
      return "bg-red-500";
    }
    if (status === "investigating" || status === "synthesizing") {
      return "bg-zinc-300 animate-pulse";
    }
    return "bg-zinc-600";
  };

  const getSeverityTag = (severity?: string) => {
    const s = severity?.toLowerCase();
    if (s === "critical" || s === "p1") {
      return (
        <span className="font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
          P1
        </span>
      );
    }
    if (s === "warning" || s === "p2") {
      return (
        <span className="font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
          P2
        </span>
      );
    }
    return (
      <span className="font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 shrink-0">
        P3
      </span>
    );
  };

  const formatShortId = (id: string) => {
    if (id.length <= 12) return id;
    return `${id.slice(0, 12)}`;
  };

  return (
    <aside className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-zinc-800/90 bg-[#0e0e11] flex flex-col lg:h-[calc(100vh-3rem)]">
      {/* Unified Search / Lookup Input */}
      <div className="p-2.5 border-b border-zinc-800/90">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter or paste inc-... (↵)"
            className="w-full h-8 bg-zinc-950 border border-zinc-800/90 rounded-md pl-8 pr-7 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              aria-label="Clear filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Flush Underline Filter Tabs */}
      <div className="flex items-center border-b border-zinc-800/90 px-3 gap-4 overflow-x-auto">
        {(
          [
            { key: "all", label: "All", count: tabCounts.all },
            { key: "approval", label: "Approval", count: tabCounts.approval },
            { key: "investigating", label: "Active", count: tabCounts.investigating },
            { key: "closed", label: "Closed", count: tabCounts.closed },
          ] as const
        ).map((item) => {
          const isActive = filter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                isActive
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span>{item.label}</span>
              <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Incident Queue Rows */}
      <div className="flex-1 overflow-y-auto">
        {filteredIds.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-zinc-500">
            {incidentIds.length === 0
              ? "No incidents tracked."
              : "No incidents match current filter."}
          </div>
        ) : (
          filteredIds.map((id) => {
            const inc = incidents[id];
            const isSelected = selectedId === id;
            const isAwaiting =
              inc?.status === "awaiting_approval" || Boolean(inc?.awaiting_human_approval);
            const serviceName =
              inc?.alert?.service || inc?.triage_report?.service || "pending-triage";
            const alertTitle =
              inc?.alert?.alertname || inc?.alert?.summary || "Fetching incident state...";

            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectIncident(id)}
                className={`w-full px-3 py-2.5 border-b border-zinc-800/60 text-left transition-colors block ${
                  isSelected
                    ? "bg-zinc-900"
                    : "hover:bg-zinc-900/50"
                }`}
              >
                {/* Line 1: Status dot + service + severity */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${getStatusDotClass(
                        inc?.status,
                        isAwaiting
                      )}`}
                    />
                    <span className="font-medium text-zinc-100 text-xs truncate">
                      {serviceName}
                    </span>
                  </div>
                  {getSeverityTag(inc?.triage_report?.severity || inc?.alert?.severity)}
                </div>

                {/* Line 2: Alertname truncated + short incident_id */}
                <div className="flex items-center justify-between gap-2 mt-1 pl-3.5">
                  <span className="text-xs text-zinc-400 truncate">
                    {alertTitle}
                  </span>
                  <span
                    className="font-mono text-[11px] text-zinc-500 shrink-0 tabular-nums"
                    title={id}
                  >
                    {formatShortId(id)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Minimal Sidebar Footer */}
      <div className="h-9 shrink-0 px-3 border-t border-zinc-800/90 flex items-center justify-between text-[11px] font-mono text-zinc-500 bg-[#0e0e11]">
        <span className="tabular-nums">
          {incidentIds.length} tracked {incidentIds.length === 1 ? "incident" : "incidents"}
        </span>
        {incidentIds.length > 0 && (
          <button
            type="button"
            onClick={onClearIncidents}
            className="text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </aside>
  );
};
