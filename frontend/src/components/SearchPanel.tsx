"use client";

import { useCallback, useState } from "react";
import { SearchIcon } from "@/components/Icons";
import type { RetrievedGuideline } from "@/lib/types";
import { API_BASE, getAuthHeaders } from "@/lib/api";

const SAMPLE_SEARCHES = [
  "preeclampsia warning signs",
  "gestational diabetes management",
  "postpartum depression screening",
  "IVF success rates",
  "menopause hormone therapy",
  "safe medications during pregnancy",
  "breastfeeding latching problems",
  "prenatal genetic screening options",
];

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RetrievedGuideline[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (q?: string) => {
    const searchQuery = q || query;
    if (!searchQuery.trim() || loading) return;
    setLoading(true);
    setQuery(searchQuery);
    try {
      const res = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ query: searchQuery, n_results: 10 }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
      }
    } catch { /* ignore */ }
    setSearched(true);
    setLoading(false);
  }, [query, loading]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Search 137 clinical documents..."
              className="w-full bg-surface-primary border border-border-default rounded-xl pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
            />
          </div>
          <button
            onClick={() => search()}
            disabled={loading}
            className="shrink-0 bg-maven-600 text-white px-4 rounded-xl text-xs font-semibold hover:bg-maven-500 disabled:opacity-30 transition-colors"
          >
            {loading ? "..." : "Search"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SAMPLE_SEARCHES.map((s) => (
            <button
              key={s}
              onClick={() => search(s)}
              className="text-[9px] px-2 py-0.5 rounded-full border border-border-subtle text-text-muted hover:text-text-secondary hover:border-border-default transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {searched && (
        <p className="text-[10px] text-text-muted">
          {results.length} results for &quot;{query}&quot;
        </p>
      )}

      <div className="space-y-2">
        {results.map((r, i) => {
          const pct = Math.round(r.relevance_score * 100);
          const barColor = r.relevance_score >= 0.5 ? "bg-status-safe" : r.relevance_score >= 0.3 ? "bg-status-caution" : "bg-status-blocked";
          return (
            <div key={i} className="message-enter bg-surface-elevated border border-border-subtle rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-[11px] text-text-primary font-medium leading-tight">{r.source}</span>
                <span className="shrink-0 text-[9px] font-mono text-text-muted">{pct}%</span>
              </div>
              <div className="h-1 bg-surface-primary rounded-full overflow-hidden mb-2">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-text-secondary leading-snug line-clamp-4">
                {r.content.slice(0, 300)}{r.content.length > 300 ? "..." : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
