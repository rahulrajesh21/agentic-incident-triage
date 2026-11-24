import React, { useState } from "react";
import {
  Activity,
  BookOpen,
  Check,
  Copy,
  FileText,
  GitCommit,
  Layers,
} from "lucide-react";
import { EvidenceCitation } from "../types/tracegate";

interface EvidencePanelProps {
  evidence: EvidenceCitation[];
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({ evidence }) => {
  const [filter, setFilter] = useState<"all" | "telemetry" | "git" | "runbook">("all");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const filtered = evidence.filter((item) => {
    if (filter === "all") return true;
    return item.source.toLowerCase() === filter;
  });

  const copyRefId = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getSourceIcon = (source: string) => {
    switch (source.toLowerCase()) {
      case "telemetry":
        return <Activity className="h-3.5 w-3.5 text-cyan-400" />;
      case "git":
        return <GitCommit className="h-3.5 w-3.5 text-indigo-400" />;
      case "runbook":
        return <BookOpen className="h-3.5 w-3.5 text-emerald-400" />;
      default:
        return <FileText className="h-3.5 w-3.5 text-zinc-400" />;
    }
  };

  const getSourceBadgeColor = (source: string) => {
    switch (source.toLowerCase()) {
      case "telemetry":
        return "bg-cyan-950/60 text-cyan-300 border-cyan-800/60";
      case "git":
        return "bg-indigo-950/60 text-indigo-300 border-indigo-800/60";
      case "runbook":
        return "bg-emerald-950/60 text-emerald-300 border-emerald-800/60";
      default:
        return "bg-zinc-800 text-zinc-400 border-zinc-700";
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/70 backdrop-blur-md p-5 space-y-4">
      {/* Header & Source Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div>
          <h3 className="font-semibold text-sm text-white flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400" />
            <span>Grounded Evidence Citations ({evidence.length})</span>
          </h3>
          <p className="text-[11px] text-zinc-400">
            Verified tool outputs from read-only telemetry, git history, and runbooks.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-zinc-950/60 p-1 rounded-lg border border-zinc-800">
          {(
            [
              { key: "all", label: `All (${evidence.length})` },
              {
                key: "telemetry",
                label: `Telemetry (${evidence.filter((e) => e.source === "telemetry").length})`,
              },
              {
                key: "git",
                label: `Git (${evidence.filter((e) => e.source === "git").length})`,
              },
              {
                key: "runbook",
                label: `Runbook (${evidence.filter((e) => e.source === "runbook").length})`,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                filter === t.key
                  ? "bg-zinc-800 text-cyan-300 border border-zinc-700 shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Citations Grid */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-zinc-500 text-xs italic">
            No evidence citations match the selected source filter.
          </div>
        ) : (
          filtered.map((item, idx) => (
            <div
              key={idx}
              className="rounded-lg bg-zinc-950/70 border border-zinc-800/80 p-3 hover:border-zinc-700 transition space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${getSourceBadgeColor(
                      item.source
                    )}`}
                  >
                    {getSourceIcon(item.source)}
                    <span>{item.source}</span>
                  </span>

                  <button
                    onClick={() => copyRefId(item.reference_id, idx)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 hover:text-white hover:border-zinc-700 transition group"
                    title="Click to copy identifier"
                  >
                    <span>{item.reference_id}</span>
                    {copiedIndex === idx ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3 text-zinc-500 group-hover:text-zinc-300" />
                    )}
                  </button>
                </div>

                <span className="text-[10px] text-zinc-600 font-mono">
                  citation #{idx + 1}
                </span>
              </div>

              {/* Excerpt */}
              <div className="text-xs text-zinc-300 bg-zinc-900/60 p-2.5 rounded border border-white/5 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {item.excerpt}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
