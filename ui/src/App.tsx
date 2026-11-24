import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Plus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { api } from "./api/client";
import { ApprovalGateCard } from "./components/ApprovalGateCard";
import { EvidencePanel } from "./components/EvidencePanel";
import { IncidentSidebar } from "./components/IncidentSidebar";
import { PipelineStepper } from "./components/PipelineStepper";
import { SimulateOutageModal } from "./components/SimulateOutageModal";
import { TopNav } from "./components/TopNav";
import { TraceTimeline } from "./components/TraceTimeline";
import { TriageReportPanel } from "./components/TriageReportPanel";
import {
  AlertPayload,
  ApprovalDecision,
  IncidentDetail,
} from "./types/tracegate";

const STORAGE_KEY = "tracegate_incidents";

export const App: React.FC = () => {
  // Connection state
  const [isApiOnline, setIsApiOnline] = useState<boolean>(true);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);

  // Incident queue state
  const [incidentIds, setIncidentIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [incidents, setIncidents] = useState<Record<string, IncidentDetail | undefined>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: "info" | "warn" | "error" | "success" } | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: "info" | "warn" | "error" | "success" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Health check & Initial Backend Sync
  const checkHealthAndSync = async () => {
    setIsCheckingHealth(true);
    try {
      await api.checkHealth();
      setIsApiOnline(true);

      // Attempt to load known incidents from server
      try {
        const res = await api.listIncidents();
        if (res.incidents && res.incidents.length > 0) {
          setIncidentIds((prev) => {
            const merged = Array.from(new Set([...res.incidents, ...prev]));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            return merged;
          });
        }
      } catch {
        // Backend list endpoint optional
      }
    } catch {
      setIsApiOnline(false);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  useEffect(() => {
    checkHealthAndSync();
    const interval = setInterval(checkHealthAndSync, 15000);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch single incident detail
  const fetchIncidentDetail = async (id: string) => {
    try {
      const detail = await api.getIncident(id);
      setIncidents((prev) => ({ ...prev, [id]: detail }));
      return detail;
    } catch (err: unknown) {
      console.error(`Failed to fetch incident ${id}:`, err);
      return null;
    }
  };

  // 3. Selection & Auto-polling
  useEffect(() => {
    if (!selectedId) return;

    // Immediately fetch
    fetchIncidentDetail(selectedId);

    // Auto-poll if in active investigation states
    const poll = async () => {
      const detail = await fetchIncidentDetail(selectedId);
      if (
        detail &&
        (detail.status === "investigating" || detail.status === "synthesizing") &&
        !detail.awaiting_human_approval
      ) {
        pollTimerRef.current = setTimeout(poll, 2000);
      }
    };

    pollTimerRef.current = setTimeout(poll, 2000);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [selectedId]);

  // Ensure first tracked incident is auto-selected if none selected
  useEffect(() => {
    if (!selectedId && incidentIds.length > 0) {
      setSelectedId(incidentIds[0]);
    }
  }, [incidentIds, selectedId]);

  // 4. Fire simulated outage
  const handleSimulateOutage = async (alertPayload: AlertPayload) => {
    try {
      const res = await api.sendAlert(alertPayload);
      const first = res.accepted?.[0];

      if (!first) {
        throw new Error("No acceptance response from Alertmanager webhook.");
      }

      const newId = first.incident_id;
      if (first.status === "duplicate_ignored") {
        showToast(`Alert duplicate ignored: incident '${newId}' is already tracked or in flight.`, "warn");
      } else {
        showToast(`Outage alert accepted: incident '${newId}' started triage!`, "success");
      }

      // Add to tracked queue
      setIncidentIds((prev) => {
        const next = [newId, ...prev.filter((id) => id !== newId)];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });

      setSelectedId(newId);
      return { incidentId: newId, status: first.status };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to simulate alert";
      showToast(msg, "error");
      throw err;
    }
  };

  // 5. Submit Human Approval Decision
  const handleApproveDecision = async (decision: ApprovalDecision) => {
    if (!selectedId) return;

    try {
      const res = await api.approveIncident(selectedId, decision);
      showToast(
        decision.approved
          ? `Remediation executed on :8004! Target status: ${res.status}`
          : "Remediation rejected by human reviewer.",
        decision.approved ? "success" : "info"
      );
      // Refresh detail immediately
      await fetchIncidentDetail(selectedId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval dispatch failed";
      showToast(msg, "error");
      throw err;
    }
  };

  const currentIncident = selectedId ? incidents[selectedId] : undefined;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Telemetry Strip */}
      <TopNav
        isApiOnline={isApiOnline}
        isCheckingHealth={isCheckingHealth}
        onRefreshHealth={checkHealthAndSync}
        onOpenSimulateModal={() => setIsSimulateModalOpen(true)}
      />

      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed top-18 right-6 z-50 animate-bounce">
          <div
            className={`px-4 py-2.5 rounded-lg border text-xs font-mono shadow-2xl flex items-center gap-2 ${
              toast.type === "success"
                ? "bg-emerald-950/90 border-emerald-500/60 text-emerald-200"
                : toast.type === "warn"
                ? "bg-amber-950/90 border-amber-500/60 text-amber-200"
                : toast.type === "error"
                ? "bg-rose-950/90 border-rose-500/60 text-rose-200"
                : "bg-cyan-950/90 border-cyan-500/60 text-cyan-200"
            }`}
          >
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Body: Sidebar + Detail Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Rail: Incident Queue */}
        <IncidentSidebar
          incidents={incidents}
          incidentIds={incidentIds}
          selectedId={selectedId}
          onSelectIncident={(id) => setSelectedId(id)}
          onLookupIncident={(id) => {
            if (!incidentIds.includes(id)) {
              setIncidentIds((prev) => [id, ...prev]);
            }
            setSelectedId(id);
          }}
        />

        {/* Main Center & Right Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
          {!selectedId || !currentIncident ? (
            /* Empty State */
            <div className="h-full flex items-center justify-center min-h-[500px]">
              <div className="max-w-lg text-center p-8 rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-md space-y-4 shadow-2xl">
                <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500/20 to-indigo-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <ShieldAlert className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Welcome to TraceGate Console
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Autonomous SRE incident triage platform. TraceGate autonomously gathers telemetry,
                  inspects git diffs, searches active runbooks, and strictly halts at a human approval gate
                  before dispatching any remediation to port :8004.
                </p>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => setIsSimulateModalOpen(true)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/25 border border-cyan-400/30 transition active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Simulate an Outage</span>
                  </button>

                  {!isApiOnline && (
                    <button
                      onClick={checkHealthAndSync}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-rose-600/60 bg-rose-950/40 text-rose-300 text-xs font-mono hover:bg-rose-900/40 transition flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Retry Backend Connection</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Active Incident Workspace (2-Column Grid) */
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Left/Center Column (8 Cols): Stepper, Warnings, Action Gate, Triage Report, Evidence */}
              <div className="xl:col-span-8 space-y-5">
                {/* 1. LangGraph Pipeline Stepper */}
                <PipelineStepper
                  status={currentIncident.status}
                  awaitingApproval={currentIncident.awaiting_human_approval}
                />

                {/* 2. Degraded Sources Warning Banner */}
                {currentIncident.degraded_sources && currentIncident.degraded_sources.length > 0 && (
                  <div className="rounded-xl border border-amber-500/50 bg-amber-950/40 p-3.5 text-xs text-amber-200 flex items-start gap-3 shadow-lg shadow-amber-950/30">
                    <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-300 font-mono uppercase text-[11px] block">
                        Degraded Read-Only Sources Detected:
                      </span>
                      <p className="mt-0.5 text-zinc-300">
                        {currentIncident.degraded_sources.join(", ")} returned <code className="font-mono text-amber-300">TOOL_UNAVAILABLE</code> during investigation. Confidence has been calibrated accordingly.
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. Human-in-the-Loop Write Gate (Hero Card) */}
                <ApprovalGateCard
                  incident={currentIncident}
                  onApprove={handleApproveDecision}
                />

                {/* 4. Triage Report (when synthesized) */}
                {currentIncident.triage_report ? (
                  <TriageReportPanel report={currentIncident.triage_report} />
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-8 text-center text-xs text-zinc-500 space-y-2">
                    <RefreshCw className="h-6 w-6 mx-auto animate-spin text-cyan-400/60" />
                    <p className="font-mono text-zinc-400">
                      Reasoning loop active: evaluating logs, metrics, git diffs & runbooks...
                    </p>
                    <p className="text-[11px] text-zinc-600">
                      Synthesis report will appear automatically once the 6-step loop completes.
                    </p>
                  </div>
                )}

                {/* 5. Grounded Citations Panel */}
                {currentIncident.triage_report?.evidence && (
                  <EvidencePanel evidence={currentIncident.triage_report.evidence} />
                )}
              </div>

              {/* Right Column (4 Cols): Live Execution Trace */}
              <div className="xl:col-span-4 sticky top-20">
                <TraceTimeline
                  trace={currentIncident.trace}
                  isLoading={currentIncident.status === "investigating" || currentIncident.status === "synthesizing"}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Simulate Outage Modal */}
      <SimulateOutageModal
        isOpen={isSimulateModalOpen}
        onClose={() => setIsSimulateModalOpen(false)}
        onSubmitAlert={handleSimulateOutage}
      />
    </div>
  );
};

export default App;
