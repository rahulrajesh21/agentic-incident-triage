import React, { useState } from "react";
import {
  AlertCircle,
  Clock,
  Code2,
  Flame,
  Layers,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { PRESET_SCENARIOS } from "../data/scenarios";
import { AlertPayload } from "../types/tracegate";

interface SimulateOutageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitAlert: (alert: AlertPayload) => Promise<{ incidentId: string; status: string } | null>;
}

export const SimulateOutageModal: React.FC<SimulateOutageModalProps> = ({
  isOpen,
  onClose,
  onSubmitAlert,
}) => {
  const [tab, setTab] = useState<"presets" | "custom">("presets");
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESET_SCENARIOS[0].id);
  const [bypassDedupe, setBypassDedupe] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [customJson, setCustomJson] = useState<string>(
    JSON.stringify(
      {
        alertname: "CustomServiceOutage",
        service: "order-service",
        severity: "critical",
        startsAt: new Date().toISOString(),
        summary: "order-service responding with 500 Internal Server Errors across all routes",
      },
      null,
      2
    )
  );

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      let payloadToSubmit: AlertPayload;

      if (tab === "presets") {
        const scenario = PRESET_SCENARIOS.find((s) => s.id === selectedPresetId);
        if (!scenario) throw new Error("Please select a scenario.");
        payloadToSubmit = { ...scenario.payload };
      } else {
        try {
          payloadToSubmit = JSON.parse(customJson);
        } catch {
          throw new Error("Invalid JSON in alert payload.");
        }
      }

      if (bypassDedupe) {
        payloadToSubmit.startsAt = new Date().toISOString();
      }

      const res = await onSubmitAlert(payloadToSubmit);
      if (res) {
        onClose();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to simulate outage");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-xl bg-zinc-900 border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-800/40 text-cyan-400">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-white">Simulate Service Outage</h2>
              <p className="text-xs text-zinc-400">
                Trigger mock incident alerts to verify autonomous read-only triage and HITL gating.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab("presets")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                tab === "presets"
                  ? "bg-zinc-800 text-cyan-400 border border-cyan-500/20 shadow-sm"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Preset Scenarios ({PRESET_SCENARIOS.length})</span>
            </button>
            <button
              onClick={() => setTab("custom")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                tab === "custom"
                  ? "bg-zinc-800 text-cyan-400 border border-cyan-500/20 shadow-sm"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Custom Alert JSON</span>
            </button>
          </div>

          {/* Fresh Timestamp Toggle */}
          <label className="flex items-center gap-2 text-xs font-mono text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bypassDedupe}
              onChange={(e) => setBypassDedupe(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-cyan-500 focus:ring-cyan-500/40"
            />
            <span className="flex items-center gap-1 text-zinc-400">
              <Clock className="h-3 w-3 text-cyan-400" />
              Fresh timestamp (bypass dedupe)
            </span>
          </label>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 text-xs bg-rose-950/60 border border-rose-800/60 text-rose-300 rounded-lg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {tab === "presets" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PRESET_SCENARIOS.map((scenario) => {
                const isSelected = selectedPresetId === scenario.id;
                return (
                  <div
                    key={scenario.id}
                    onClick={() => setSelectedPresetId(scenario.id)}
                    className={`cursor-pointer rounded-lg p-3.5 border transition-all text-left flex flex-col justify-between ${
                      isSelected
                        ? "bg-gradient-to-br from-cyan-950/40 to-zinc-900 border-cyan-500/60 shadow-lg shadow-cyan-950/30 ring-1 ring-cyan-500/40"
                        : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/40"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-medium text-sm text-zinc-100 flex items-center gap-1.5">
                          {isSelected && <Sparkles className="h-3.5 w-3.5 text-cyan-400" />}
                          {scenario.name}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded font-semibold ${
                            scenario.expectedAction === "rollback"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                              : "bg-amber-950 text-amber-400 border border-amber-800/60"
                          }`}
                        >
                          Expected: {scenario.expectedAction}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 line-clamp-2 mb-2">
                        {scenario.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-2 border-t border-zinc-800/60">
                      <span>svc: <span className="text-zinc-300">{scenario.service}</span></span>
                      <span className="text-zinc-400 text-[10px]">{scenario.category}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Alertmanager Webhook Payload (JSON):</span>
                <span className="font-mono text-[11px] text-zinc-500">POST /webhooks/alertmanager</span>
              </div>
              <textarea
                value={customJson}
                onChange={(e) => setCustomJson(e.target.value)}
                rows={12}
                className="w-full bg-zinc-950 font-mono text-xs text-zinc-200 border border-zinc-800 rounded-lg p-3.5 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/60">
          <div className="text-xs text-zinc-400">
            {tab === "presets" ? (
              <span>Target: <span className="font-mono text-cyan-300">{PRESET_SCENARIOS.find(s => s.id === selectedPresetId)?.service}</span></span>
            ) : (
              <span>Custom payload will be dispatched to triage queue</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-xs text-zinc-300 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shadow-md shadow-cyan-600/30 border border-cyan-400/30 transition active:scale-95 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Dispatching..." : "Fire Alert Webhook"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
