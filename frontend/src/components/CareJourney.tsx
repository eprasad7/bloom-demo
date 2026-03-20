"use client";

import type { JourneyEntry } from "@/lib/types";
import type { ReactNode } from "react";
import { MessageIcon, AlertIcon, UserIcon, FileIcon } from "@/components/Icons";

const ACTION_ICONS: Record<string, ReactNode> = {
  guidance: <MessageIcon size={14} className="text-maven-400" />,
  escalation: <AlertIcon size={14} className="text-status-emergency" />,
  referral: <UserIcon size={14} className="text-teal-400" />,
  screening_reminder: <FileIcon size={14} className="text-status-caution" />,
};

const PATHWAY_COLORS: Record<string, string> = {
  maternity: "bg-maven-200 text-maven-800",
  fertility: "bg-teal-400/20 text-teal-600",
  postpartum: "bg-maven-100 text-maven-700",
  menopause: "bg-maven-300/30 text-maven-700",
  pediatrics: "bg-teal-400/10 text-teal-500",
  general_womens_health: "bg-surface-secondary text-text-secondary",
  unknown: "bg-surface-secondary text-text-muted",
};

export function CareJourney({ entries }: { entries: JourneyEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <p className="text-text-muted text-sm">
          Care journey will build up as you interact with the assistant.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => {
        const time = new Date(entry.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const icon = ACTION_ICONS[entry.action] ?? <MessageIcon size={14} className="text-text-muted" />;
        const pathwayStyle =
          PATHWAY_COLORS[entry.care_pathway] ?? PATHWAY_COLORS.unknown;

        return (
          <div key={i} className="message-enter flex gap-3">
            <div className="flex flex-col items-center">
              <div className="mt-0.5">{icon}</div>
              {i < entries.length - 1 && (
                <div className="w-px flex-1 bg-border-default mt-1" />
              )}
            </div>
            <div className="flex-1 min-w-0 pb-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs text-text-muted">{time}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pathwayStyle}`}
                >
                  {entry.care_pathway.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-xs text-text-primary truncate">
                {entry.summary}
              </p>
              {entry.details && (
                <p className="text-xs text-text-muted mt-0.5">
                  {entry.details}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
