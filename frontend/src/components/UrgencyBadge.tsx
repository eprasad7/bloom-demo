"use client";

import type { UrgencyPrediction } from "@/lib/types";
import { AlertIcon } from "@/components/Icons";

const URGENCY_STYLES: Record<string, { bg: string; text: string; bar: string }> = {
  routine: { bg: "bg-status-safe/10", text: "text-status-safe", bar: "bg-status-safe" },
  soon: { bg: "bg-status-caution/10", text: "text-status-caution", bar: "bg-status-caution" },
  urgent: { bg: "bg-status-blocked/10", text: "text-status-blocked", bar: "bg-status-blocked" },
  emergency: { bg: "bg-status-emergency/10", text: "text-status-emergency", bar: "bg-status-emergency" },
};

export function UrgencyBadge({ prediction }: { prediction: UrgencyPrediction }) {
  const style = URGENCY_STYLES[prediction.urgency_label] ?? URGENCY_STYLES.routine;

  return (
    <div className="message-enter">
      <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
        ML Urgency Classification
      </h3>
      <div className={`rounded-lg border border-border-subtle p-3 ${style.bg}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertIcon size={14} className={style.text} />
            <span className={`text-sm font-semibold uppercase ${style.text}`}>
              {prediction.urgency_label}
            </span>
          </div>
          <span className="text-xs font-mono text-text-secondary">
            {Math.round(prediction.confidence * 100)}% confidence
          </span>
        </div>

        {/* Probability bars */}
        <div className="space-y-1 mt-2">
          {Object.entries(prediction.probabilities).map(([label, prob]) => {
            const isActive = label === prediction.urgency_label;
            const barStyle = URGENCY_STYLES[label] ?? URGENCY_STYLES.routine;
            return (
              <div key={label} className="flex items-center gap-2">
                <span className={`text-[9px] w-16 text-right ${isActive ? "text-text-primary font-medium" : "text-text-muted"}`}>
                  {label}
                </span>
                <div className="flex-1 h-1.5 bg-surface-primary/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isActive ? barStyle.bar : "bg-text-muted/20"}`}
                    style={{ width: `${prob * 100}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-text-muted w-8 text-right">
                  {Math.round(prob * 100)}%
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-[9px] text-text-muted mt-2 italic">
          TF-IDF + Gradient Boosting classifier trained on 85 clinical vignettes
        </p>
      </div>
    </div>
  );
}
