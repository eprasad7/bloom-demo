"use client";

import { useCallback, useEffect, useState } from "react";
import { ClockIcon, MessageIcon, FolderIcon, ChartIcon } from "@/components/Icons";

interface SessionSummary {
  session_id: string;
  created_at: string;
  care_pathway: string;
  message_count: number;
  journey_count: number;
}

interface SessionDetail {
  session_id: string;
  created_at: string;
  care_pathway: string;
  message_count: number;
  messages: Array<{ role: string; content: string; timestamp: string }>;
  journey: Array<{ timestamp: string; summary: string; care_pathway: string; action: string }>;
}

interface MemoryStats {
  total_sessions: number;
  total_messages: number;
  total_journey_entries: number;
  pathway_distribution: Record<string, number>;
  action_distribution: Record<string, number>;
  last_activity: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const PATHWAY_COLORS: Record<string, string> = {
  maternity: "text-maven-400",
  fertility: "text-teal-400",
  postpartum: "text-maven-300",
  menopause: "text-maven-400",
  pediatrics: "text-teal-500",
  general_womens_health: "text-text-secondary",
  unknown: "text-text-muted",
};

export function MemoryPanel({ currentSessionId }: { currentSessionId: string | null }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [view, setView] = useState<"overview" | "sessions" | "detail">("overview");
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sessRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/sessions`),
        fetch(`${API_BASE}/api/memory/stats`),
      ]);
      if (sessRes.ok) setSessions(await sessRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const viewSession = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${id}`);
      if (res.ok) {
        setSelectedSession(await res.json());
        setView("detail");
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  if (view === "detail" && selectedSession) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setView("sessions"); setSelectedSession(null); }}
          className="text-[11px] text-maven-400 hover:text-maven-300 transition-colors flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to sessions
        </button>

        {/* Session header */}
        <div className="bg-surface-elevated border border-border-subtle rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-text-muted">
              {selectedSession.session_id.slice(0, 12)}...
            </span>
            <span className={`text-[10px] font-medium ${PATHWAY_COLORS[selectedSession.care_pathway] || "text-text-muted"}`}>
              {selectedSession.care_pathway.replace(/_/g, " ")}
            </span>
          </div>
          <div className="flex gap-4 text-[10px] text-text-muted">
            <span>{selectedSession.message_count} messages</span>
            <span>{selectedSession.journey.length} journey entries</span>
            <span>{new Date(selectedSession.created_at).toLocaleDateString()}</span>
          </div>
          {currentSessionId === selectedSession.session_id && (
            <span className="inline-block mt-1.5 text-[9px] px-1.5 py-0.5 rounded bg-status-safe/15 text-status-safe font-medium">
              Active Session
            </span>
          )}
        </div>

        {/* Message history */}
        <div>
          <h4 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Conversation ({selectedSession.messages.length})
          </h4>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {selectedSession.messages.map((msg, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-maven-600/20 text-text-primary ml-4"
                    : "bg-surface-overlay text-text-secondary mr-4"
                }`}
              >
                <span className="text-[9px] text-text-muted font-mono block mb-0.5">
                  {msg.role} · {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
                <span className="line-clamp-3">{msg.content}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (view === "sessions") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setView("overview")}
            className="text-[11px] text-maven-400 hover:text-maven-300 transition-colors flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Overview
          </button>
          <button
            onClick={fetchData}
            className="text-[10px] text-text-muted hover:text-text-secondary transition-colors"
          >
            Refresh
          </button>
        </div>

        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
          All Sessions ({sessions.length})
        </h3>

        {sessions.length === 0 ? (
          <p className="text-xs text-text-muted text-center mt-8">No sessions yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.session_id}
                onClick={() => viewSession(s.session_id)}
                className="w-full text-left bg-surface-elevated border border-border-subtle rounded-lg p-3 hover:border-border-default transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono text-text-muted">
                    {s.session_id.slice(0, 8)}
                  </span>
                  <span className={`text-[9px] font-medium ${PATHWAY_COLORS[s.care_pathway] || "text-text-muted"}`}>
                    {s.care_pathway.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex gap-3 text-[9px] text-text-muted">
                  <span>{s.message_count} msgs</span>
                  <span>{s.journey_count} journey</span>
                  <span>{new Date(s.created_at).toLocaleTimeString()}</span>
                </div>
                {currentSessionId === s.session_id && (
                  <span className="inline-block mt-1 text-[8px] px-1.5 py-0.5 rounded bg-status-safe/15 text-status-safe font-medium">
                    Active
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Overview
  return (
    <div className="space-y-5">
      {/* Stats grid */}
      {stats && (
        <div className="message-enter">
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-3">
            Memory Overview
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              icon={<FolderIcon size={14} />}
              value={stats.total_sessions}
              label="Sessions"
            />
            <StatCard
              icon={<MessageIcon size={14} />}
              value={stats.total_messages}
              label="Messages"
            />
            <StatCard
              icon={<ChartIcon size={14} />}
              value={stats.total_journey_entries}
              label="Journey Entries"
            />
            <StatCard
              icon={<ClockIcon size={14} />}
              value={stats.last_activity ? new Date(stats.last_activity).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "None"}
              label="Last Activity"
            />
          </div>
        </div>
      )}

      {/* Pathway distribution */}
      {stats && Object.keys(stats.pathway_distribution).length > 0 && (
        <div className="message-enter">
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Care Pathways
          </h3>
          <div className="space-y-1.5">
            {Object.entries(stats.pathway_distribution).map(([pathway, count]) => {
              const total = Object.values(stats.pathway_distribution).reduce((a, b) => a + b, 0);
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={pathway} className="flex items-center gap-2">
                  <span className={`text-[10px] w-24 truncate ${PATHWAY_COLORS[pathway] || "text-text-muted"}`}>
                    {pathway.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 h-1.5 bg-surface-primary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-maven-400/60"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-text-muted w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action distribution */}
      {stats && Object.keys(stats.action_distribution).length > 0 && (
        <div className="message-enter">
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Actions
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(stats.action_distribution).map(([action, count]) => (
              <span key={action} className="text-[9px] px-2 py-1 rounded-lg bg-surface-elevated border border-border-subtle text-text-secondary">
                {action} <span className="text-text-muted font-mono">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Browse sessions button */}
      <button
        onClick={() => { fetchData(); setView("sessions"); }}
        disabled={loading}
        className="w-full text-[11px] py-2.5 rounded-lg border border-border-default text-text-secondary hover:text-text-primary hover:border-border-focus transition-colors disabled:opacity-30"
      >
        {loading ? "Loading..." : `Browse all sessions (${sessions.length})`}
      </button>

      {/* DB info */}
      <div className="bg-surface-elevated/50 border border-border-subtle rounded-lg p-3">
        <p className="text-[9px] text-text-muted leading-relaxed">
          Session memory is stored in SQLite with three tables: sessions, messages, and journey entries. Each conversation persists across page reloads using the session ID. In production, this would use PostgreSQL with row-level security for HIPAA compliance.
        </p>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="bg-surface-elevated border border-border-subtle rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1 text-text-muted">
        {icon}
        <span className="text-[9px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-bold text-text-primary leading-none">{value}</p>
    </div>
  );
}
