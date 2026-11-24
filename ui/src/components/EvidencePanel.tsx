import React, { useState } from "react";
import {
  Activity,
  BookOpen,
  Check,
  Copy,
  FileText,
  GitCommit,
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
    setTimeout(() => setCopiedIndex(null), 1800);
  };

  const getSourceIcon = (source: string) => {
    switch (source.toLowerCase()) {
      case "telemetry":
        return <Activity className="w-3.5 h-3.5 text-zinc-400" />;
      case "git":
        return <GitCommit className="w-3.5 h-3.5 text-zinc-400" />;
      case "runbook":
        return <BookOpen className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const getSourceBadgeStyle = (source: string) => {
    if (source.toLowerCase() === "runbook") {
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    }
    return "bg-zinc-900 text-zinc-300 border-zinc-800";
  };

  const counts = {
    all: evidence.length,
    telemetry: evidence.filter((e) => e.source.toLowerCase() === "telemetry").length,
    git: evidence.filter((e) => e.source.toLowerCase() === "git").length,
    runbook: evidence.filter((e) => e.source.toLowerCase() === "runbook").length,
  };

  return (
    <div className="rounded-md border border-zinc-800/90 bg-[#111113] overflow-hidden">
      {/* Header & Flush Filter Tabs */}
      <div className="px-5 pt-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/90">
        <div className="pb-3">
          <h3 className="font-semibold text-sm text-zinc-100">
            Grounded Evidence Citations
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tool outputs collected from read-only telemetry, git, and runbooks (:8010).
          </p>
        </div>

        <div className="flex items-center gap-4 self-end">
          {(
            [
              { key: "all", label: "All", count: counts.all },
              { key: "telemetry", label: "Telemetry", count: counts.telemetry },
              { key: "git", label: "Git", count: counts.git },
              { key: "runbook", label: "Runbook", count: counts.runbook },
            ] as const
          ).map((t) => {
            const isActive = filter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={`pb-3 text-xs font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 transition-colors ${
                  isActive
                    ? "border-zinc-100 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <span>{t.label}</span>
                <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Citations List */}
      <div className="p-5 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-zinc-500 text-xs">
            No evidence citations match the selected filter.
          </div>
        ) : (
          filtered.map((item, idx) => (
            <div
              key={idx}
              className="rounded-md bg-[#0e0e11] border border-zinc-800/90 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0 ${getSourceBadgeStyle(
                      item.source
                    )}`}
                  >
                    {getSourceIcon(item.source)}
                    <span>{item.source}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => copyRefId(item.reference_id, idx)}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-200 hover:border-zinc-700 transition-colors min-w-0"
                    title="Copy reference identifier"
                  >
                    <span className="truncate">{item.reference_id}</span>
                    {copiedIndex === idx ? (
                      <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <Copy className="w-3 h-3 text-zinc-500 shrink-0" />
                    )}
                  </button>
                </div>

                <span className="text-[11px] text-zinc-600 font-mono tabular-nums shrink-0">
                  #{idx + 1}
                </span>
              </div>

              <div className="text-xs text-zinc-300 bg-zinc-950 p-2.5 rounded-md border border-zinc-800/80 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {item.excerpt}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
