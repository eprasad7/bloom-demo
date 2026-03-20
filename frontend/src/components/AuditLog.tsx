"use client";

import type { AuditEvent } from "@/lib/types";
import { ShieldIcon, SearchIcon, BrainIcon, HospitalIcon, FolderIcon, ChartIcon, AlertIcon, PinIcon } from "@/components/Icons";
import type { ReactNode } from "react";

const EVENT_ICONS: Record<string, ReactNode> = {
  input_rail: <ShieldIcon size={12} />,
  rag_retrieval: <SearchIcon size={12} />,
  llm_call: <BrainIcon size={12} />,
  output_rail: <ShieldIcon size={12} />,
  icd10_lookup: <HospitalIcon size={12} />,
  pathway_classification: <FolderIcon size={12} />,
  eval: <ChartIcon size={12} />,
  urgency_ml: <AlertIcon size={12} />,
};

const RISK_DOT: Record<string, string> = {
  safe: "bg-status-safe",
  caution: "bg-status-caution",
  blocked: "bg-status-blocked",
  emergency: "bg-status-emergency",
};

export function AuditLog({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <p className="text-text-muted text-sm">
          Audit events will appear here as the pipeline processes each message.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 font-mono text-[11px]">
      {events.map((event, i) => {
        const time = new Date(event.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        const icon = EVENT_ICONS[event.event_type] ?? <PinIcon size={12} />;
        const dotClass = RISK_DOT[event.risk_level] ?? RISK_DOT.safe;

        return (
          <div
            key={i}
            className="message-enter flex items-start gap-2 py-1 px-2 rounded hover:bg-surface-elevated transition-colors"
          >
            <span
              className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`}
            />
            <span className="text-text-muted shrink-0">{time}</span>
            <span className="shrink-0 text-text-muted">{icon}</span>
            <span className="text-text-secondary break-all">
              <span className="text-text-primary font-medium">
                {event.event_type}
              </span>{" "}
              {event.detail}
              {event.latency_ms > 0 && (
                <span className="text-text-muted ml-1">
                  ({event.latency_ms}ms)
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
