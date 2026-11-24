import React, { useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { TraceData } from "../types/tracegate";

interface TraceTimelineProps {
  trace?: TraceData;
  isLoading?: boolean;
}

export const TraceTimeline: React.FC<TraceTimelineProps> = ({ trace, isLoading }) => {
  const [expandedEventIds, setExpandedEventIds] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const totals = trace?.totals || {
    latency_ms: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: 0,
  };

  const formatLatency = (ms: number) => {
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    return `${Math.round(ms)}ms`;
  };

  const events = trace?.events || [];
  const reasoningSteps = events.filter(
    (e) => e.node === "investigate" || e.node === "synthesize"
  ).length;

  const getStatusClass = (status: string) => {
    const s = status.toLowerCase();
    if (s === "ok" || s === "executed" || s === "success") {
      return "text-emerald-400";
    }
    if (s === "timeout" || s === "degraded") {
      return "text-amber-400";
    }
    return "text-red-400";
  };

  return (
    <div className="rounded-md border border-zinc-800/90 bg-[#111113] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800/90 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-mono text-[11px] uppercase tracking-wider font-semibold text-zinc-300">
            Execution Trace
          </h3>
          {isLoading && <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />}
        </div>
        <span className="font-mono text-[11px] tabular-nums text-zinc-500">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-zinc-800/90 divide-x divide-y sm:divide-y-0 divide-zinc-800/90 bg-[#0e0e11]">
        <div className="px-3 py-2.5">
          <div className="text-[10px] font-mono uppercase text-zinc-500">Latency</div>
          <div className="font-mono text-xs font-medium text-zinc-100 tabular-nums mt-0.5">
            {formatLatency(totals.latency_ms)}
          </div>
        </div>

        <div
          className="px-3 py-2.5"
          title={`Prompt: ${totals.prompt_tokens}, Completion: ${totals.completion_tokens}`}
        >
          <div className="text-[10px] font-mono uppercase text-zinc-500">Tokens</div>
          <div className="font-mono text-xs font-medium text-zinc-100 tabular-nums mt-0.5">
            {totals.prompt_tokens + totals.completion_tokens}
          </div>
        </div>

        <div className="px-3 py-2.5">
          <div className="text-[10px] font-mono uppercase text-zinc-500">Cost</div>
          <div className="font-mono text-xs font-medium text-zinc-100 tabular-nums mt-0.5">
            ${totals.cost_usd.toFixed(4)}
          </div>
        </div>

        <div className="px-3 py-2.5">
          <div className="text-[10px] font-mono uppercase text-zinc-500">Steps</div>
          <div className="font-mono text-xs font-medium text-zinc-100 tabular-nums mt-0.5">
            {reasoningSteps}/6
          </div>
        </div>
      </div>

      {/* Dense Monospace Event Timeline */}
      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto divide-y divide-zinc-800/60">
        {events.length === 0 ? (
          <div className="py-10 px-4 text-center font-mono text-xs text-zinc-500">
            {isLoading ? "Waiting for trace events..." : "No trace events recorded."}
          </div>
        ) : (
          events.map((event, index) => {
            const eventKey = event.id || index;
            const isExpanded = expandedEventIds.has(eventKey);
            const isLlm = event.event_type === "llm_call";
            const totalTokens = event.prompt_tokens + event.completion_tokens;

            return (
              <div key={eventKey} className="text-left">
                <button
                  type="button"
                  onClick={() => toggleExpand(eventKey)}
                  className="w-full px-3 py-2.5 hover:bg-zinc-900/50 transition-colors text-left"
                >
                  {/* Row 1 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      )}
                      <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 shrink-0">
                        {isLlm ? "LLM" : "TOOL"}
                      </span>
                      <span className="font-mono text-xs text-zinc-100 truncate">
                        {event.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] tabular-nums">
                      <span className="text-zinc-400">
                        {formatLatency(event.latency_ms)}
                      </span>
                      <span className={`uppercase font-medium ${getStatusClass(event.status)}`}>
                        {event.status}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: node & token/time details */}
                  <div className="mt-1 pl-5 flex items-center justify-between font-mono text-[11px] text-zinc-500 tabular-nums">
                    <span>node:{event.node}</span>
                    {isLlm ? (
                      <span>
                        {totalTokens} tok · ${event.cost_usd.toFixed(5)}
                      </span>
                    ) : (
                      <span>{event.created_at.slice(11, 19)} UTC</span>
                    )}
                  </div>
                </button>

                {/* Expandable Metadata Drawer */}
                {isExpanded && (
                  <div className="px-3 pb-3 pl-8">
                    {event.metadata && Object.keys(event.metadata).length > 0 ? (
                      <pre className="p-2.5 rounded-md bg-zinc-950 border border-zinc-800/90 text-[11px] font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    ) : (
                      <div className="p-2 rounded-md bg-zinc-950 border border-zinc-800/90 text-[11px] font-mono text-zinc-500">
                        No metadata captured.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
