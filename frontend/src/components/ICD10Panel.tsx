"use client";

import type { ICD10Code } from "@/lib/types";

export function ICD10Panel({ codes }: { codes: ICD10Code[] }) {
  if (codes.length === 0) {
    return null;
  }

  return (
    <div className="message-enter">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
        ICD-10 Codes Detected
      </h3>
      <div className="space-y-2">
        {codes.map((code, i) => (
          <div
            key={i}
            className="flex items-start gap-2 p-2 rounded-md bg-surface-elevated border border-border-subtle"
          >
            <span className="shrink-0 px-1.5 py-0.5 rounded bg-teal-400/20 text-teal-600 text-[10px] font-bold font-mono">
              {code.code}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-text-primary leading-snug">
                {code.description}
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">
                Matched: {code.matched_terms.join(", ")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
