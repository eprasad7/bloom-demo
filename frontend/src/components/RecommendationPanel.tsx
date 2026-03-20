"use client";

import type { ProviderRecommendation } from "@/lib/types";
import { UserIcon } from "@/components/Icons";

const URGENCY_STYLES: Record<string, { badge: string; dot: string }> = {
  routine: { badge: "bg-status-safe/15 text-status-safe", dot: "bg-status-safe" },
  soon: { badge: "bg-status-caution/15 text-status-caution", dot: "bg-status-caution" },
  urgent: { badge: "bg-status-blocked/15 text-status-blocked", dot: "bg-status-blocked" },
  emergency: { badge: "bg-status-emergency/15 text-status-emergency", dot: "bg-status-emergency" },
};

export function RecommendationPanel({
  providers,
}: {
  providers: ProviderRecommendation[];
}) {
  if (providers.length === 0) return null;

  return (
    <div className="message-enter">
      <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
        Recommended Providers
      </h3>
      <div className="space-y-2">
        {providers.map((p, i) => {
          const style = URGENCY_STYLES[p.urgency] || URGENCY_STYLES.routine;
          const scorePct = Math.round(p.score * 100);

          return (
            <div
              key={i}
              className="bg-surface-elevated border border-border-subtle rounded-lg p-3 hover:border-border-default transition-colors"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-maven-600/15 flex items-center justify-center shrink-0 text-maven-400">
                  <UserIcon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] text-text-primary font-medium leading-tight">
                      {p.title}
                    </p>
                    <span className={`shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-medium ${style.badge}`}>
                      {p.urgency}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5">{p.specialty}</p>
                  <p className="text-[10px] text-text-secondary mt-1 leading-snug">{p.reason}</p>
                  {/* Score bar */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-1 bg-surface-primary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-maven-400/60"
                        style={{ width: `${scorePct}%` }}
                      />
                    </div>
                    <span className="text-[8px] font-mono text-text-muted">{scorePct}%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[8px] text-text-muted mt-2 italic">
        Rule-based scoring with weighted symptom-provider matching. In production: trained on historical patient-provider match outcomes.
      </p>
    </div>
  );
}
