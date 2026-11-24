import React, { useState } from "react";
import {
  Activity,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  Layers,
  Wrench,
} from "lucide-react";
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

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/70 backdrop-blur-md p-4 flex flex-col h-full space-y-4">
      {/* Title & KPI Strip */}
      <div className="pb-3 border-b border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <span>Execution Trace & Telemetry</span>
          </h3>
          <span className="text-[11px] font-mono text-zinc-400">
            {events.length} {events.length === 1 ? "Event" : "Events"}
          </span>
        </div>

        {/* 4 KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Latency */}
          <div className="rounded-lg bg-zinc-950/70 border border-white/5 p-2 text-left">
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono uppercase">
              <Clock className="h-3 w-3 text-cyan-400" />
              <span>Latency</span>
            </div>
            <div className="font-mono text-xs font-bold text-zinc-100 mt-0.5">
              {formatLatency(totals.latency_ms)}
            </div>
          </div>

          {/* Tokens */}
          <div className="rounded-lg bg-zinc-950/70 border border-white/5 p-2 text-left">
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono uppercase">
              <Cpu className="h-3 w-3 text-indigo-400" />
              <span>Tokens</span>
            </div>
            <div className="font-mono text-xs font-bold text-zinc-100 mt-0.5">
              {totals.prompt_tokens + totals.completion_tokens}
              <span className="text-[10px] font-normal text-zinc-500 ml-1">
                ({totals.prompt_tokens}/{totals.completion_tokens})
              </span>
            </div>
          </div>

          {/* Est Cost */}
          <div className="rounded-lg bg-zinc-950/70 border border-white/5 p-2 text-left">
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono uppercase">
              <Coins className="h-3 w-3 text-amber-400" />
              <span>Est. Cost</span>
            </div>
            <div className="font-mono text-xs font-bold text-emerald-400 mt-0.5">
              ${totals.cost_usd.toFixed(4)}
            </div>
          </div>

          {/* Steps */}
          <div className="rounded-lg bg-zinc-950/70 border border-white/5 p-2 text-left">
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono uppercase">
              <Layers className="h-3 w-3 text-emerald-400" />
              <span>Steps</span>
            </div>
            <div className="font-mono text-xs font-bold text-zinc-100 mt-0.5">
              {events.filter((e) => e.node === "investigate" || e.node === "synthesize").length} / 6
            </div>
          </div>
        </div>
      </div>

      {/* Events Timeline */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {events.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs italic">
            {isLoading ? "Recording live execution events..." : "No trace events captured yet."}
          </div>
        ) : (
          events.map((event, index) => {
            const isExpanded = expandedEventIds.has(event.id);
            const isLlm = event.event_type === "llm_call";

            return (
              <div
                key={event.id || index}
                className="rounded-lg bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 transition overflow-hidden text-left"
              >
                {/* Event Summary Row */}
                <div
                  onClick={() => toggleExpand(event.id)}
                  className="p-2.5 flex items-center justify-between gap-2 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2 truncate">
                    <button className="text-zinc-500 hover:text-white transition">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                        isLlm
                          ? "bg-indigo-950 text-indigo-300 border-indigo-800"
                          : "bg-cyan-950 text-cyan-300 border-cyan-800"
                      }`}
                    >
                      {isLlm ? <Bot className="h-2.5 w-2.5" /> : <Wrench className="h-2.5 w-2.5" />}
                      <span>{isLlm ? "LLM" : "TOOL"}</span>
                    </span>

                    <span className="text-xs font-mono font-semibold text-zinc-200 truncate">
                      {event.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
                    <span className="text-zinc-500">{formatLatency(event.latency_ms)}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${
                        event.status === "ok" || event.status === "executed"
                          ? "text-emerald-400 bg-emerald-950/60 border border-emerald-800/60"
                          : event.status === "timeout"
                          ? "text-amber-400 bg-amber-950/60 border border-amber-800/60"
                          : "text-rose-400 bg-rose-950/60 border border-rose-800/60"
                      }`}
                    >
                      {event.status}
                    </span>
                  </div>
                </div>

                {/* Node info & meta header */}
                <div className="px-3 pb-2 flex items-center justify-between text-[10px] font-mono text-zinc-500 border-t border-zinc-900 pt-1">
                  <span>node: <span className="text-zinc-300">{event.node}</span></span>
                  {isLlm ? (
                    <span>tokens: {event.prompt_tokens + event.completion_tokens} (${event.cost_usd.toFixed(5)})</span>
                  ) : (
                    <span>{event.created_at.slice(11, 19)} UTC</span>
                  )}
                </div>

                {/* Expanded Drawer */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 p-3 bg-zinc-950 space-y-2 text-xs font-mono">
                    {/* Metadata Drawer */}
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block mb-1">
                          Metadata & Arguments:
                        </span>
                        <pre className="p-2.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
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
