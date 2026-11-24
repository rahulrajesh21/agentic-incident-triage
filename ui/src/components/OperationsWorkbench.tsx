import React, { useState } from "react";
import { Check, Copy, Loader2, Play, RefreshCw } from "lucide-react";
import { PRESET_SCENARIOS } from "../data/scenarios";
import { AlertPayload } from "../types/tracegate";

interface OperationsWorkbenchProps {
  apiBaseUrl: string;
  isApiOnline: boolean;
  isCheckingHealth: boolean;
  onRetryHealth: () => void;
  onTriggerScenario: (alert: AlertPayload) => Promise<unknown>;
  onOpenCustomModal: () => void;
}

export const OperationsWorkbench: React.FC<OperationsWorkbenchProps> = ({
  apiBaseUrl,
  isApiOnline,
  isCheckingHealth,
  onRetryHealth,
  onTriggerScenario,
  onOpenCustomModal,
}) => {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const quickScenarios = PRESET_SCENARIOS.slice(0, 5);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleRunScenario = async (scenarioId: string, payload: AlertPayload) => {
    setRunningId(scenarioId);
    try {
      await onTriggerScenario({
        ...payload,
        startsAt: new Date().toISOString(),
      });
    } catch {
      // Toast error handled by parent
    } finally {
      setRunningId(null);
    }
  };

  const curlSnippet = `curl -X POST ${apiBaseUrl}/webhooks/alertmanager \\
  -H "Content-Type: application/json" \\
  -d '{
    "alertname": "CheckoutHigh5xxRate",
    "service": "checkout-api",
    "severity": "critical",
    "startsAt": "${new Date().toISOString().slice(0, 19)}Z",
    "summary": "checkout-api 5xx error rate spiked to 18.4% with p95 latency > 4.8s"
  }'`;

  const pipelineStages = [
    { step: "01 INGEST", target: "POST /webhooks/alertmanager" },
    { step: "02 INVESTIGATE", target: "Read-Only MCP :8010" },
    { step: "03 APPROVAL GATE", target: "LangGraph interrupt()" },
    { step: "04 REMEDIATE", target: "Write MCP :8004" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 sm:px-8 py-8 space-y-6">
      {/* Compact Offline Notice */}
      {!isApiOnline && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-red-400 font-medium">
              FastAPI backend unreachable at{" "}
              <code className="font-mono text-zinc-200">{apiBaseUrl}</code>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyText("uvicorn api.main:app --port 8000", "start-cmd")}
              className="h-7 px-2.5 rounded-md border border-zinc-800 bg-zinc-950 hover:border-zinc-700 font-mono text-[11px] text-zinc-300 inline-flex items-center gap-1.5 transition-colors"
              title="Copy backend start command"
            >
              <span>uvicorn api.main:app --port 8000</span>
              {copiedKey === "start-cmd" ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3 text-zinc-500" />
              )}
            </button>

            <button
              type="button"
              onClick={onRetryHealth}
              disabled={isCheckingHealth}
              className="h-7 px-2.5 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-zinc-400 ${
                  isCheckingHealth ? "animate-spin" : ""
                }`}
              />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}

      {/* Header Row */}
      <div className="space-y-1">
        <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
          INCIDENT WORKBENCH
        </div>
        <p className="text-sm text-zinc-300">
          Select an incident from the queue or trigger a sandbox scenario to observe read-only triage (:8010) and human-gated remediation (:8004).
        </p>
      </div>

      {/* Architecture Pipeline Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 border border-zinc-800/90 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/90 bg-[#111113]">
        {pipelineStages.map((stage) => (
          <div key={stage.step} className="px-4 py-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              {stage.step}
            </div>
            <div className="text-xs font-mono text-zinc-200 mt-1 truncate">
              {stage.target}
            </div>
          </div>
        ))}
      </div>

      {/* Quick-Trigger Scenarios Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            Sandbox Scenarios
          </div>
          <button
            type="button"
            onClick={onOpenCustomModal}
            className="text-xs text-zinc-400 hover:text-zinc-100 font-mono transition-colors"
          >
            Custom JSON / All presets →
          </button>
        </div>

        <div className="border border-zinc-800/90 rounded-md bg-[#111113] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/90 bg-[#0e0e11] text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 px-3.5 font-medium">Service</th>
                  <th className="py-2.5 px-3.5 font-medium">Alert / Symptom</th>
                  <th className="py-2.5 px-3.5 font-medium">Expected Gate</th>
                  <th className="py-2.5 px-3.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-xs">
                {quickScenarios.map((scenario) => {
                  const isRunning = runningId === scenario.id;
                  const isCritical = scenario.severity === "critical";
                  const isRollback = scenario.expectedAction === "rollback";

                  return (
                    <tr
                      key={scenario.id}
                      className="hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="py-2.5 px-3.5 whitespace-nowrap align-top">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-zinc-100">
                            {scenario.service}
                          </span>
                          <span
                            className={`font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded border ${
                              isCritical
                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            }`}
                          >
                            {isCritical ? "P1" : "P2"}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 align-top">
                        <div className="font-mono text-zinc-200 text-xs">
                          {scenario.payload.alertname}
                        </div>
                        <div className="text-zinc-400 text-xs mt-0.5 line-clamp-1">
                          {scenario.description}
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 whitespace-nowrap align-top">
                        <span
                          className={`inline-block font-mono text-[11px] px-1.5 py-0.5 rounded border ${
                            isRollback
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {scenario.expectedAction}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 whitespace-nowrap text-right align-top">
                        <button
                          type="button"
                          onClick={() => handleRunScenario(scenario.id, scenario.payload)}
                          disabled={runningId !== null}
                          className="h-7 px-2.5 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-100 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          {isRunning ? (
                            <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3 text-zinc-400" />
                          )}
                          <span>{isRunning ? "Running" : "Run"}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Webhook Integration Snippet */}
      <div className="border border-zinc-800/90 rounded-md bg-[#111113] overflow-hidden">
        <div className="px-3.5 py-2 border-b border-zinc-800/90 bg-[#0e0e11] flex items-center justify-between">
          <span className="text-[11px] font-mono text-zinc-400">
            WEBHOOK INGESTION · POST /webhooks/alertmanager
          </span>
          <button
            type="button"
            onClick={() => copyText(curlSnippet, "curl-snippet")}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Copy cURL snippet"
            aria-label="Copy webhook cURL command"
          >
            {copiedKey === "curl-snippet" ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <pre className="p-3.5 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed">
          {curlSnippet}
        </pre>
      </div>
    </div>
  );
};
