import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { api } from "./api/client";
import { ApprovalGateCard } from "./components/ApprovalGateCard";
import { EvidencePanel } from "./components/EvidencePanel";
import { IncidentSidebar } from "./components/IncidentSidebar";
import { OperationsWorkbench } from "./components/OperationsWorkbench";
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
  const [isApiOnline, setIsApiOnline] = useState<boolean>(true);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);

  const [incidentIds, setIncidentIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [incidents, setIncidents] = useState<Record<string, IncidentDetail | undefined>>({});
  const [incidentErrors, setIncidentErrors] = useState<Record<string, string | undefined>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "info" | "warn" | "error" | "success";
  } | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoSelectedRef = useRef<boolean>(false);

  const showToast = (
    message: string,
    type: "info" | "warn" | "error" | "success" = "info"
  ) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  // 1. Health check & Initial Backend Sync
  const checkHealthAndSync = async () => {
    setIsCheckingHealth(true);
    try {
      await api.checkHealth();
      setIsApiOnline(true);

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
      setIncidentErrors((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return detail;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to fetch ${id}`;
      setIncidentErrors((prev) => ({ ...prev, [id]: msg }));
      console.error(`Failed to fetch incident ${id}:`, err);
      return null;
    }
  };

  // 3. Selection & Auto-polling
  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    fetchIncidentDetail(selectedId);

    const poll = async () => {
      if (cancelled) return;
      const detail = await fetchIncidentDetail(selectedId);
      if (
        !cancelled &&
        detail &&
        (detail.status === "investigating" || detail.status === "synthesizing") &&
        !detail.awaiting_human_approval
      ) {
        pollTimerRef.current = setTimeout(poll, 2000);
      }
    };

    pollTimerRef.current = setTimeout(poll, 2000);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [selectedId]);

  // Auto-select top incident once on initial load if queue already exists
  useEffect(() => {
    if (!hasAutoSelectedRef.current && !selectedId && incidentIds.length > 0) {
      hasAutoSelectedRef.current = true;
      setSelectedId(incidentIds[0]);
    }
  }, [incidentIds, selectedId]);

  // Pre-fetch summary metadata for sidebar rows when queue changes
  useEffect(() => {
    incidentIds.forEach((id) => {
      if (id !== selectedId && !incidents[id] && !incidentErrors[id]) {
        fetchIncidentDetail(id);
      }
    });
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
        showToast(
          `Duplicate ignored: incident ${newId} is already active.`,
          "warn"
        );
      } else {
        showToast(`Alert accepted: triage started for ${newId}.`, "success");
      }

      setIncidentIds((prev) => {
        const next = [newId, ...prev.filter((id) => id !== newId)];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });

      hasAutoSelectedRef.current = true;
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
          ? `Remediation executed on :8004 (${res.status})`
          : "Remediation rejected by reviewer.",
        decision.approved ? "success" : "info"
      );
      await fetchIncidentDetail(selectedId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval dispatch failed";
      showToast(msg, "error");
      throw err;
    }
  };

  // 6. Lookup incident by ID from sidebar
  const handleLookupIncident = async (id: string) => {
    if (incidentIds.includes(id)) {
      hasAutoSelectedRef.current = true;
      setSelectedId(id);
      return;
    }
    try {
      const detail = await api.getIncident(id);
      setIncidents((prev) => ({ ...prev, [id]: detail }));
      setIncidentIds((prev) => {
        const next = prev.includes(id) ? prev : [id, ...prev];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      hasAutoSelectedRef.current = true;
      setSelectedId(id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Incident ${id} not found`;
      showToast(msg, "error");
    }
  };

  // 7. Remove single incident or clear all tracked incidents
  const handleRemoveIncident = (id: string) => {
    setIncidentIds((prev) => {
      const next = prev.filter((item) => item !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setIncidentErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  const handleClearIncidents = () => {
    localStorage.removeItem(STORAGE_KEY);
    setIncidentIds([]);
    setIncidents({});
    setIncidentErrors({});
    setSelectedId(null);
  };

  const currentIncident = selectedId ? incidents[selectedId] : undefined;
  const currentError = selectedId ? incidentErrors[selectedId] : undefined;

  return (
    <div className="min-h-screen lg:h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-zinc-700 selection:text-zinc-100 lg:overflow-hidden">
      {/* Top Bar */}
      <TopNav
        isApiOnline={isApiOnline}
        isCheckingHealth={isCheckingHealth}
        onRefreshHealth={checkHealthAndSync}
        onOpenSimulateModal={() => setIsSimulateModalOpen(true)}
        onSelectHome={() => {
          hasAutoSelectedRef.current = true;
          setSelectedId(null);
        }}
      />

      {/* Toast Banner */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50">
          <div
            className={`px-3.5 py-2 rounded-md border text-xs font-mono bg-[#111113] flex items-center gap-2 ${
              toast.type === "success"
                ? "border-emerald-500/40 text-emerald-400"
                : toast.type === "warn"
                ? "border-amber-500/40 text-amber-400"
                : toast.type === "error"
                ? "border-red-500/40 text-red-400"
                : "border-zinc-700 text-zinc-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                toast.type === "success"
                  ? "bg-emerald-500"
                  : toast.type === "warn"
                  ? "bg-amber-500"
                  : toast.type === "error"
                  ? "bg-red-500"
                  : "bg-zinc-400"
              }`}
            />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Workspace Shell: Sidebar + Main Area */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <IncidentSidebar
          incidents={incidents}
          incidentIds={incidentIds}
          selectedId={selectedId}
          onSelectIncident={(id) => {
            hasAutoSelectedRef.current = true;
            setSelectedId(id);
          }}
          onLookupIncident={handleLookupIncident}
          onClearIncidents={handleClearIncidents}
        />

        <main className="flex-1 overflow-y-auto bg-[#09090b]">
          {!selectedId ? (
            <OperationsWorkbench
              apiBaseUrl={api.baseUrl}
              isApiOnline={isApiOnline}
              isCheckingHealth={isCheckingHealth}
              onRetryHealth={checkHealthAndSync}
              onTriggerScenario={handleSimulateOutage}
              onOpenCustomModal={() => setIsSimulateModalOpen(true)}
            />
          ) : !currentIncident ? (
            <div className="max-w-4xl mx-auto px-6 py-8">
              <button
                type="button"
                onClick={() => {
                  hasAutoSelectedRef.current = true;
                  setSelectedId(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-100 mb-6 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Workbench</span>
              </button>

              {currentError ? (
                <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="font-mono text-red-400 font-medium">
                      Unable to load {selectedId}
                    </div>
                    <div className="text-zinc-400">{currentError}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fetchIncidentDetail(selectedId)}
                      className="h-7 px-2.5 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Retry</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveIncident(selectedId)}
                      className="h-7 px-2.5 rounded-md border border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-zinc-800/90 bg-[#111113] p-6 flex items-center gap-3 text-xs font-mono text-zinc-400">
                  <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                  <span>Loading incident {selectedId}...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 lg:p-6 space-y-5">
              {/* Incident Context Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/90">
                <div className="flex items-center gap-2.5 min-w-0 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      hasAutoSelectedRef.current = true;
                      setSelectedId(null);
                    }}
                    className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-100 font-mono transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Workbench</span>
                  </button>
                  <span className="text-zinc-700">/</span>
                  <span className="font-mono text-zinc-100 font-medium truncate">
                    {currentIncident.incident_id}
                  </span>
                  {currentIncident.alert?.alertname && (
                    <>
                      <span className="text-zinc-700 hidden sm:inline">·</span>
                      <span className="text-zinc-400 truncate hidden sm:inline">
                        {currentIncident.alert.alertname}
                      </span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => fetchIncidentDetail(currentIncident.incident_id)}
                  className="h-7 px-2.5 rounded-md border border-zinc-800 bg-[#111113] hover:bg-zinc-900 text-xs font-mono text-zinc-400 hover:text-zinc-100 inline-flex items-center gap-1.5 transition-colors"
                  title="Refresh incident state"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh</span>
                </button>
              </div>

              {/* 2-Column Incident Detail Workspace */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* Left/Center Column */}
                <div className="xl:col-span-8 space-y-4">
                  <PipelineStepper
                    status={currentIncident.status}
                    awaitingApproval={currentIncident.awaiting_human_approval}
                  />

                  {currentIncident.degraded_sources &&
                    currentIncident.degraded_sources.length > 0 && (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/[0.04] px-3.5 py-2.5 text-xs flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-mono font-medium text-amber-400 uppercase text-[11px]">
                            Degraded MCP Sources: {currentIncident.degraded_sources.join(", ")}
                          </span>
                          <p className="mt-0.5 text-zinc-300">
                            Returned <code className="font-mono text-amber-300">TOOL_UNAVAILABLE</code> during read-only investigation. Confidence score calibrated accordingly.
                          </p>
                        </div>
                      </div>
                    )}

                  <ApprovalGateCard
                    incident={currentIncident}
                    onApprove={handleApproveDecision}
                  />

                  {currentIncident.triage_report ? (
                    <TriageReportPanel report={currentIncident.triage_report} />
                  ) : (
                    <div className="rounded-md border border-zinc-800/90 bg-[#111113] p-6 flex items-center gap-3 text-xs text-zinc-400">
                      <Loader2 className="w-4 h-4 text-zinc-400 animate-spin shrink-0" />
                      <div>
                        <div className="font-mono text-zinc-200">
                          Read-only investigation loop running (:8010)
                        </div>
                        <div className="text-zinc-500 mt-0.5">
                          Collecting telemetry, git commit diffs, and matching runbooks prior to report synthesis.
                        </div>
                      </div>
                    </div>
                  )}

                  {currentIncident.triage_report?.evidence && (
                    <EvidencePanel evidence={currentIncident.triage_report.evidence} />
                  )}
                </div>

                {/* Right Column: Live Execution Trace */}
                <div className="xl:col-span-4 xl:sticky xl:top-6">
                  <TraceTimeline
                    trace={currentIncident.trace}
                    isLoading={
                      currentIncident.status === "investigating" ||
                      currentIncident.status === "synthesizing"
                    }
                  />
                </div>
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
