"use client";

import type { EvalScores, RAGContext, RetrievedGuideline } from "@/lib/types";
import { SearchIcon, CheckIcon, XIcon } from "@/components/Icons";

function PassFailBadge({ result, label, reason }: { result: string; label: string; reason: string }) {
  const isPass = result === "pass";
  return (
    <div className={`flex items-start gap-2 p-2 rounded-lg border ${
      isPass ? "border-status-safe/20 bg-status-safe/5" : "border-status-blocked/20 bg-status-blocked/5"
    }`}>
      <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
        isPass ? "bg-status-safe/20 text-status-safe" : "bg-status-blocked/20 text-status-blocked"
      }`}>
        {isPass ? <CheckIcon size={10} /> : <XIcon size={10} />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-text-primary">{label}</span>
          <span className={`text-[9px] font-bold uppercase ${isPass ? "text-status-safe" : "text-status-blocked"}`}>
            {result}
          </span>
        </div>
        {reason && (
          <p className="text-[9px] text-text-muted leading-snug mt-0.5">{reason}</p>
        )}
      </div>
    </div>
  );
}

export function RAGVisualizer({
  guidelines,
  ragContext,
  evalScores,
}: {
  guidelines: RetrievedGuideline[];
  ragContext: RAGContext | null;
  evalScores: EvalScores | null;
}) {
  return (
    <div className="space-y-5">
      {/* ── Eval Results (Pass/Fail) ── */}
      {evalScores && evalScores.faithfulness !== "error" && (
        <div className="message-enter">
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Eval Results (Binary)
          </h3>
          <div className="space-y-1.5">
            <PassFailBadge result={evalScores.faithfulness} label="Faithfulness" reason={evalScores.faithfulness_reason} />
            <PassFailBadge result={evalScores.relevance} label="Relevance" reason={evalScores.relevance_reason} />
            <PassFailBadge result={evalScores.safety} label="Safety" reason={evalScores.safety_reason} />
          </div>
        </div>
      )}

      {/* ── Context Assembly ── */}
      {ragContext && (
        <div className="message-enter">
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Context Window
          </h3>
          <div className="bg-surface-elevated border border-border-subtle rounded-lg p-3">
            {/* Token usage bar */}
            <div className="flex h-3 rounded-full overflow-hidden bg-surface-primary mb-2">
              <div
                className="bg-text-muted/30"
                style={{
                  width: `${(ragContext.system_prompt_tokens / (ragContext.total_context_tokens + ragContext.max_tokens)) * 100}%`,
                }}
                title="System prompt"
              />
              <div
                className="bg-teal-500/60"
                style={{
                  width: `${(ragContext.context_tokens / (ragContext.total_context_tokens + ragContext.max_tokens)) * 100}%`,
                }}
                title="Retrieved context"
              />
              <div
                className="bg-maven-400/60"
                style={{
                  width: `${(ragContext.query_tokens / (ragContext.total_context_tokens + ragContext.max_tokens)) * 100}%`,
                }}
                title="Query"
              />
              <div
                className="bg-surface-overlay"
                style={{
                  width: `${(ragContext.max_tokens / (ragContext.total_context_tokens + ragContext.max_tokens)) * 100}%`,
                }}
                title="Response budget"
              />
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-text-muted/30" />
                <span className="text-text-muted">
                  System ({ragContext.system_prompt_tokens}t)
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-teal-500/60" />
                <span className="text-text-muted">
                  RAG ({ragContext.context_tokens}t)
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-maven-400/60" />
                <span className="text-text-muted">
                  Query ({ragContext.query_tokens}t)
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-surface-overlay" />
                <span className="text-text-muted">
                  Response ({ragContext.max_tokens}t)
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Retrieved Chunks ── */}
      <div>
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
          Retrieved Chunks ({guidelines.length})
        </h3>
        {guidelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <div className="w-10 h-10 rounded-lg bg-surface-overlay flex items-center justify-center mb-3 text-text-muted">
              <SearchIcon size={20} />
            </div>
            <p className="text-text-muted text-xs">
              Retrieved documents appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {guidelines.map((g, i) => {
              const pct = Math.round(g.relevance_score * 100);
              const barColor =
                g.relevance_score >= 0.6
                  ? "bg-status-safe"
                  : g.relevance_score >= 0.35
                    ? "bg-status-caution"
                    : "bg-status-blocked";

              return (
                <div
                  key={i}
                  className="message-enter bg-surface-elevated border border-border-subtle rounded-lg p-3"
                >
                  {/* Header: citation number + source + score */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="shrink-0 w-5 h-5 rounded bg-teal-500/20 text-teal-400 text-[10px] font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="text-[11px] text-text-primary font-medium leading-tight">
                        {g.source}
                      </span>
                    </div>
                    <span className="shrink-0 text-[10px] font-mono text-text-secondary">
                      {pct}%
                    </span>
                  </div>

                  {/* Score bar */}
                  <div className="h-1 bg-surface-primary rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Content preview */}
                  <p className="text-[10px] text-text-secondary leading-snug line-clamp-3">
                    {g.content.slice(0, 200)}
                    {g.content.length > 200 ? "..." : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
