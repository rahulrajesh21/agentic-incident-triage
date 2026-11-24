import React, { useState } from "react";
import { AlertCircle, Clock, Code2, Layers, Send, X } from "lucide-react";
import { PRESET_SCENARIOS } from "../data/scenarios";
import { AlertPayload } from "../types/tracegate";

interface SimulateOutageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitAlert: (
    alert: AlertPayload
  ) => Promise<{ incidentId: string; status: string } | null>;
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

  const selectedScenario = PRESET_SCENARIOS.find((s) => s.id === selectedPresetId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="relative w-full max-w-3xl rounded-md bg-[#111113] border border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/90 bg-[#0e0e11]">
          <div>
            <h2 className="font-semibold text-sm text-zinc-100">
              Simulate Service Outage
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Dispatch a sandbox scenario or custom Alertmanager payload to <code className="font-mono text-zinc-300">POST /webhooks/alertmanager</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Flush Tab Toggle + Fresh Timestamp Option */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 border-b border-zinc-800/90 bg-[#111113]">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setTab("presets")}
              className={`py-2.5 text-xs font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 transition-colors ${
                tab === "presets"
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-zinc-400" />
              <span>Preset Scenarios</span>
              <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                {PRESET_SCENARIOS.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTab("custom")}
              className={`py-2.5 text-xs font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 transition-colors ${
                tab === "custom"
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Custom Alert JSON</span>
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs font-mono text-zinc-400 cursor-pointer select-none py-2">
            <input
              type="checkbox"
              checked={bypassDedupe}
              onChange={(e) => setBypassDedupe(e.target.checked)}
              className="rounded bg-zinc-950 border-zinc-700 accent-zinc-100"
            />
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>Fresh timestamp (bypass dedupe)</span>
            </span>
          </label>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs bg-red-500/5 border border-red-500/30 text-red-400 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {tab === "presets" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {PRESET_SCENARIOS.map((scenario) => {
                const isSelected = selectedPresetId === scenario.id;
                const isRollback = scenario.expectedAction === "rollback";

                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => setSelectedPresetId(scenario.id)}
                    className={`rounded-md p-3.5 border text-left flex flex-col justify-between transition-colors ${
                      isSelected
                        ? "bg-zinc-900 border-zinc-400"
                        : "bg-[#0e0e11] border-zinc-800/90 hover:border-zinc-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-medium text-xs text-zinc-100">
                          {scenario.name}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                            isRollback
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {scenario.expectedAction}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 line-clamp-2 mb-2.5">
                        {scenario.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-2 border-t border-zinc-800/80 w-full">
                      <span className="text-zinc-300">{scenario.service}</span>
                      <span>{scenario.category}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Alertmanager Webhook Payload (JSON)</span>
                <span className="font-mono text-[11px] text-zinc-500">
                  POST /webhooks/alertmanager
                </span>
              </div>
              <textarea
                value={customJson}
                onChange={(e) => setCustomJson(e.target.value)}
                rows={12}
                className="w-full bg-zinc-950 font-mono text-xs text-zinc-200 border border-zinc-800/90 rounded-md p-3 focus:border-zinc-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-zinc-800/90 bg-[#0e0e11]">
          <div className="text-xs font-mono text-zinc-400">
            {tab === "presets" ? (
              <span>
                target: <span className="text-zinc-200">{selectedScenario?.service}</span>
              </span>
            ) : (
              <span>target: custom webhook payload</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-8 px-3 rounded-md border border-zinc-800 hover:bg-zinc-900 text-xs text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="h-8 px-4 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? "Dispatching..." : "Fire Alert Webhook"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
