"use client";

import { useCallback, useEffect, useState } from "react";
import { ClockIcon, MessageIcon, FolderIcon, ChartIcon, BrainIcon, ShieldIcon, SearchIcon, HospitalIcon, AlertIcon } from "@/components/Icons";
import type { AuditEvent, CarePathway, EvalScores, ICD10Code, JourneyEntry, Message, PatientContext, PatientMemory, RetrievedGuideline, UrgencyPrediction } from "@/lib/types";

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

import { API_BASE, getAuthHeaders } from "@/lib/api";

const PATHWAY_COLORS: Record<string, string> = {
  maternity: "text-maven-400",
  fertility: "text-teal-400",
  postpartum: "text-maven-300",
  menopause: "text-maven-400",
  pediatrics: "text-teal-500",
  general_womens_health: "text-text-secondary",
  unknown: "text-text-muted",
};

interface LiveSessionData {
  messages: Message[];
  journey: JourneyEntry[];
  icd10Codes: ICD10Code[];
  urgency: UrgencyPrediction | null;
  evalScores: EvalScores | null;
  guidelines: RetrievedGuideline[];
  auditEvents: AuditEvent[];
  carePathway: CarePathway | null;
  patientMemories: PatientMemory[];
  patientContext: PatientContext | null;
}

export function MemoryPanel({
  currentSessionId,
  liveData,
}: {
  currentSessionId: string | null;
  liveData: LiveSessionData;
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [view, setView] = useState<"live" | "overview" | "sessions" | "detail">("live");
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sessRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/sessions`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/api/memory/stats`, { headers: getAuthHeaders() }),
      ]);
      if (sessRes.ok) setSessions(await sessRes.json());
      if (statsRes.ok) {
        const s = await statsRes.json();
        setStats(s);
        // If we have stats but no live data, show overview instead of empty live view
        if (s.total_sessions > 0 && liveData.messages.length === 0) {
          setView("overview");
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [liveData.messages.length]);

  useEffect(() => { fetchData(); }, [fetchData]);
  // Refresh when messages arrive
  useEffect(() => { if (liveData.messages.length > 0) { setView("live"); fetchData(); } }, [liveData.messages.length, fetchData]);

  const viewSession = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        setSelectedSession(await res.json());
        setView("detail");
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  // ── Detail view ──
  if (view === "detail" && selectedSession) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setView("sessions"); setSelectedSession(null); }}
          className="text-[11px] text-maven-400 hover:text-maven-300 transition-colors flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div className="bg-surface-elevated border border-border-subtle rounded-lg p-3">
          <span className="text-[10px] font-mono text-text-muted">{selectedSession.session_id.slice(0, 12)}...</span>
          <div className="flex gap-3 text-[10px] text-text-muted mt-1">
            <span>{selectedSession.message_count} messages</span>
            <span className={PATHWAY_COLORS[selectedSession.care_pathway] || "text-text-muted"}>
              {selectedSession.care_pathway.replace(/_/g, " ")}
            </span>
          </div>
        </div>
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
    );
  }

  // ── Sessions list view ──
  if (view === "sessions") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setView("live")}
            className="text-[11px] text-maven-400 hover:text-maven-300 transition-colors flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Live view
          </button>
          <button onClick={fetchData} className="text-[10px] text-text-muted hover:text-text-secondary">Refresh</button>
        </div>
        {sessions.map((s) => (
          <button
            key={s.session_id}
            onClick={() => viewSession(s.session_id)}
            className="w-full text-left bg-surface-elevated border border-border-subtle rounded-lg p-3 hover:border-border-default transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-text-muted">{s.session_id.slice(0, 8)}</span>
              <span className={`text-[9px] ${PATHWAY_COLORS[s.care_pathway] || "text-text-muted"}`}>
                {s.care_pathway.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex gap-3 text-[9px] text-text-muted">
              <span>{s.message_count} msgs</span>
              <span>{s.journey_count} journey</span>
            </div>
            {currentSessionId === s.session_id && (
              <span className="inline-block mt-1 text-[8px] px-1.5 py-0.5 rounded bg-status-safe/15 text-status-safe font-medium">Active</span>
            )}
          </button>
        ))}
      </div>
    );
  }

  // ── Overview view ──
  if (view === "overview") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setView("live")}
          className="text-[11px] text-maven-400 hover:text-maven-300 transition-colors flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Live view
        </button>
        {stats && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <StatCard icon={<FolderIcon size={14} />} value={stats.total_sessions} label="Sessions" />
              <StatCard icon={<MessageIcon size={14} />} value={stats.total_messages} label="Messages" />
              <StatCard icon={<ChartIcon size={14} />} value={stats.total_journey_entries} label="Journey" />
              <StatCard icon={<ClockIcon size={14} />} value={stats.last_activity ? new Date(stats.last_activity).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "None"} label="Last Active" />
            </div>
            {Object.keys(stats.pathway_distribution).length > 0 && (
              <div>
                <h4 className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-2">Pathway Distribution</h4>
                {Object.entries(stats.pathway_distribution).map(([pw, count]) => {
                  const total = Object.values(stats.pathway_distribution).reduce((a, b) => a + b, 0);
                  return (
                    <div key={pw} className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] w-20 truncate ${PATHWAY_COLORS[pw] || "text-text-muted"}`}>{pw.replace(/_/g, " ")}</span>
                      <div className="flex-1 h-1 bg-surface-primary rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-maven-400/60" style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                      <span className="text-[8px] font-mono text-text-muted w-4 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        <button onClick={() => { fetchData(); setView("sessions"); }} className="w-full text-[11px] py-2 rounded-lg border border-border-default text-text-secondary hover:text-text-primary transition-colors">
          Browse sessions ({sessions.length})
        </button>
      </div>
    );
  }

  // ── Live session view (default) ──
  const userMsgs = liveData.messages.filter(m => m.role === "user");
  const assistantMsgs = liveData.messages.filter(m => m.role === "assistant" && m.content);
  const hasData = liveData.messages.length > 0 || (stats !== null && stats.total_sessions > 0);

  return (
    <div className="space-y-4">
      {/* Session header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
          Live Session Memory
        </h3>
        <div className="flex gap-2">
          <button onClick={() => { fetchData(); setView("overview"); }} className="text-[9px] text-text-muted hover:text-maven-400 transition-colors">Stats</button>
          <button onClick={() => { fetchData(); setView("sessions"); }} className="text-[9px] text-text-muted hover:text-maven-400 transition-colors">History</button>
        </div>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <BrainIcon size={20} className="text-text-muted mb-2" />
          <p className="text-text-muted text-xs">Memory builds up as you interact.</p>
          <p className="text-text-muted text-[10px] mt-1">Send a message to see live memory tracking.</p>
        </div>
      ) : (
        <>
          {/* Session ID + pathway */}
          <div className="bg-surface-elevated border border-border-subtle rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-status-safe animate-pulse" />
                <span className="text-[10px] font-mono text-text-muted">
                  {currentSessionId?.slice(0, 8) || "unknown"}
                </span>
              </div>
              {liveData.carePathway && (
                <span className={`text-[10px] font-medium ${PATHWAY_COLORS[liveData.carePathway] || "text-text-muted"}`}>
                  {liveData.carePathway.replace(/_/g, " ")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-center">
              <div>
                <p className="text-base font-bold text-text-primary">{userMsgs.length}</p>
                <p className="text-[8px] text-text-muted">Questions</p>
              </div>
              <div>
                <p className="text-base font-bold text-text-primary">{assistantMsgs.length}</p>
                <p className="text-[8px] text-text-muted">Responses</p>
              </div>
              <div>
                <p className="text-base font-bold text-text-primary">{liveData.journey.length}</p>
                <p className="text-[8px] text-text-muted">Journey</p>
              </div>
            </div>
          </div>

          {/* Memory architecture */}
          <div className="space-y-3">
            <h4 className="text-[9px] font-semibold text-text-muted uppercase tracking-wider">
              Agent Memory Architecture
            </h4>

            {/* 1. Episodic Memory - extracted patient facts */}
            <MemorySection
              title="Episodic Memory"
              subtitle="Facts extracted from conversation"
              color="text-teal-400"
              icon={<BrainIcon size={12} />}
            >
              {liveData.patientContext ? (
                <div className="space-y-1.5">
                  {Object.values(liveData.patientContext.pregnancy).length > 0 && (
                    <FactGroup label="Pregnancy" items={Object.values(liveData.patientContext.pregnancy)} color="bg-maven-400" />
                  )}
                  {Object.values(liveData.patientContext.demographics).length > 0 && (
                    <FactGroup label="Demographics" items={Object.values(liveData.patientContext.demographics)} color="bg-teal-400" />
                  )}
                  {liveData.patientContext.symptoms.length > 0 && (
                    <FactGroup label="Symptoms" items={liveData.patientContext.symptoms} color="bg-status-caution" />
                  )}
                  {liveData.patientContext.conditions.length > 0 && (
                    <FactGroup label="Conditions" items={liveData.patientContext.conditions} color="bg-status-blocked" />
                  )}
                  {liveData.patientContext.medications.length > 0 && (
                    <FactGroup label="Medications" items={liveData.patientContext.medications} color="bg-teal-500" />
                  )}
                  {Object.values(liveData.patientContext.care_context).length > 0 && (
                    <FactGroup label="Care Context" items={Object.values(liveData.patientContext.care_context)} color="bg-maven-300" />
                  )}
                  {liveData.patientContext.total_facts === 0 && (
                    <p className="text-[9px] text-text-muted italic">No facts extracted yet</p>
                  )}
                </div>
              ) : (
                <p className="text-[9px] text-text-muted italic">Waiting for conversation...</p>
              )}
            </MemorySection>

            {/* 2. Semantic Memory - RAG knowledge base */}
            <MemorySection
              title="Semantic Memory"
              subtitle="Retrieved clinical knowledge"
              color="text-teal-500"
              icon={<SearchIcon size={12} />}
            >
              {liveData.guidelines.length > 0 ? (
                <div className="space-y-0.5">
                  {liveData.guidelines.map((g, i) => (
                    <p key={i} className="text-[9px] text-text-secondary truncate">
                      [{i + 1}] {g.source} ({Math.round(g.relevance_score * 100)}%)
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-[9px] text-text-muted italic">137 docs in vector store, 0 retrieved</p>
              )}
            </MemorySection>

            {/* 3. Working Memory - current context */}
            <MemorySection
              title="Working Memory"
              subtitle="Active conversation context"
              color="text-maven-300"
              icon={<MessageIcon size={12} />}
            >
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <MiniStat value={userMsgs.length} label="Queries" />
                <MiniStat value={assistantMsgs.length} label="Responses" />
                <MiniStat value={liveData.journey.length} label="Journey" />
              </div>
            </MemorySection>

            {/* 4. Procedural Memory - guardrails + evals */}
            <MemorySection
              title="Procedural Memory"
              subtitle="Safety rules and evaluation"
              color="text-status-caution"
              icon={<ShieldIcon size={12} />}
            >
              <div className="space-y-1">
                {liveData.auditEvents
                  .filter(e => e.event_type === "input_rail" || e.event_type === "output_rail")
                  .map((e, i) => (
                    <p key={i} className="text-[9px] text-text-secondary truncate">{e.detail}</p>
                  ))}
                {liveData.urgency && (
                  <p className="text-[9px] text-text-secondary">
                    Urgency: {liveData.urgency.urgency_label} ({Math.round(liveData.urgency.confidence * 100)}%)
                  </p>
                )}
                {liveData.evalScores && typeof liveData.evalScores.faithfulness === "string" && liveData.evalScores.faithfulness !== "error" && (
                  <p className="text-[9px] text-text-secondary">
                    Eval: F={String(liveData.evalScores.faithfulness).toUpperCase()} R={String(liveData.evalScores.relevance).toUpperCase()} S={String(liveData.evalScores.safety ?? "?").toUpperCase()}
                  </p>
                )}
                {liveData.auditEvents.length === 0 && !liveData.urgency && (
                  <p className="text-[9px] text-text-muted italic">5 input/output rails active</p>
                )}
              </div>
            </MemorySection>
          </div>

          {/* DB note */}
          <div className="bg-surface-elevated/50 border border-border-subtle rounded-lg p-2.5">
            <p className="text-[8px] text-text-muted leading-relaxed">
              SQLite: sessions, messages, journey_entries tables. In production: PostgreSQL with row-level security for HIPAA.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function MemorySlot({
  icon,
  label,
  color,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  items: string[];
}) {
  return (
    <div className="message-enter bg-surface-elevated border border-border-subtle rounded-lg p-2.5">
      <div className={`flex items-center gap-1.5 mb-1.5 ${color}`}>
        {icon}
        <span className="text-[9px] font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-[8px] text-text-muted ml-auto">{items.length}</span>
      </div>
      <div className="space-y-0.5">
        {items.slice(0, 5).map((item, i) => (
          <p key={i} className="text-[10px] text-text-secondary leading-snug truncate">{item}</p>
        ))}
        {items.length > 5 && (
          <p className="text-[9px] text-text-muted">+{items.length - 5} more</p>
        )}
      </div>
    </div>
  );
}

function MemorySection({
  title,
  subtitle,
  color,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  color: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="message-enter bg-surface-elevated border border-border-subtle rounded-lg p-3">
      <div className={`flex items-center gap-1.5 mb-0.5 ${color}`}>
        {icon}
        <span className="text-[10px] font-semibold">{title}</span>
      </div>
      <p className="text-[8px] text-text-muted mb-2">{subtitle}</p>
      {children}
    </div>
  );
}

function FactGroup({ label, items, color }: { label: string; items: string[]; color: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[8px] text-text-muted w-16 shrink-0 pt-0.5">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => (
          <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${color}/15 text-text-primary font-medium`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-surface-primary rounded p-1.5">
      <p className="text-sm font-bold text-text-primary">{value}</p>
      <p className="text-[7px] text-text-muted uppercase">{label}</p>
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
