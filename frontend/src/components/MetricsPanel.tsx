"use client";

import type { AuditEvent, EvalScores } from "@/lib/types";
import { ChartIcon, ClockIcon, ShieldIcon, BrainIcon } from "@/components/Icons";

interface MetricsData {
  auditEvents: AuditEvent[];
  evalHistory: EvalScores[];
  messageCount: number;
  guardrailTriggers: number;
  totalMessages: number;
}

export function MetricsPanel({ data }: { data: MetricsData }) {
  // ── Compute latency by step ──
  const latencyByStep: Record<string, number[]> = {};
  for (const event of data.auditEvents) {
    if (event.latency_ms > 0) {
      if (!latencyByStep[event.event_type]) latencyByStep[event.event_type] = [];
      latencyByStep[event.event_type].push(event.latency_ms);
    }
  }

  const avgLatencies = Object.entries(latencyByStep)
    .map(([step, times]) => ({
      step,
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      max: Math.max(...times),
      count: times.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  const maxLatency = Math.max(...avgLatencies.map(l => l.avg), 1);

  // ── Guardrail stats ──
  const railEvents = data.auditEvents.filter(
    e => e.event_type === "input_rail" || e.event_type === "output_rail"
  );
  const triggered = railEvents.filter(e => e.risk_level !== "safe");
  const triggerRate = railEvents.length > 0
    ? (triggered.length / railEvents.length) * 100
    : 0;

  // ── Risk distribution ──
  const riskCounts: Record<string, number> = { safe: 0, caution: 0, blocked: 0, emergency: 0 };
  for (const event of data.auditEvents) {
    if (event.risk_level in riskCounts) {
      riskCounts[event.risk_level]++;
    }
  }
  const totalRisk = Object.values(riskCounts).reduce((a, b) => a + b, 0);

  // ── Token estimates ──
  const llmEvents = data.auditEvents.filter(e => e.event_type === "llm_call");
  const totalChars = llmEvents.reduce((sum, e) => {
    const match = e.detail.match(/Generated (\d+) chars/);
    return sum + (match ? parseInt(match[1]) : 0);
  }, 0);
  const thinkingChars = llmEvents.reduce((sum, e) => {
    const match = e.detail.match(/(\d+) thinking chars/);
    return sum + (match ? parseInt(match[1]) : 0);
  }, 0);

  // ── Total pipeline time ──
  const totalPipelineMs = data.auditEvents.reduce((sum, e) => sum + e.latency_ms, 0);

  const hasData = data.auditEvents.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <ChartIcon size={20} className="text-text-muted mb-2" />
        <p className="text-text-muted text-xs">Pipeline metrics will appear here.</p>
        <p className="text-text-muted text-[10px] mt-1">Send a message to start collecting telemetry.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <MiniCard
          icon={<ClockIcon size={12} />}
          value={`${Math.round(totalPipelineMs)}ms`}
          label="Total Pipeline"
          color="text-maven-400"
        />
        <MiniCard
          icon={<ShieldIcon size={12} />}
          value={`${Math.round(triggerRate)}%`}
          label="Guard Trigger Rate"
          color={triggerRate > 0 ? "text-status-blocked" : "text-status-safe"}
        />
        <MiniCard
          icon={<BrainIcon size={12} />}
          value={`~${Math.round((totalChars + thinkingChars) / 4)}`}
          label="Tokens Generated"
          color="text-teal-400"
        />
        <MiniCard
          icon={<ChartIcon size={12} />}
          value={`${data.auditEvents.length}`}
          label="Pipeline Events"
          color="text-text-secondary"
        />
      </div>

      {/* Latency by step */}
      {avgLatencies.length > 0 && (
        <div>
          <h3 className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Latency by Step
          </h3>
          <div className="space-y-1.5">
            {avgLatencies.map(({ step, avg, max }) => (
              <div key={step} className="flex items-center gap-2">
                <span className="text-[9px] text-text-secondary w-24 truncate font-mono">
                  {step}
                </span>
                <div className="flex-1 h-2 bg-surface-primary rounded-full overflow-hidden relative">
                  {/* Max bar (faded) */}
                  <div
                    className="absolute inset-y-0 left-0 bg-maven-400/15 rounded-full"
                    style={{ width: `${(max / maxLatency) * 100}%` }}
                  />
                  {/* Avg bar */}
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full ${
                      avg > 5000 ? "bg-status-blocked" : avg > 1000 ? "bg-status-caution" : "bg-maven-400"
                    }`}
                    style={{ width: `${(avg / maxLatency) * 100}%` }}
                  />
                </div>
                <span className="text-[8px] font-mono text-text-muted w-14 text-right">
                  {avg >= 1000 ? `${(avg / 1000).toFixed(1)}s` : `${Math.round(avg)}ms`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk distribution */}
      {totalRisk > 0 && (
        <div>
          <h3 className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Risk Distribution
          </h3>
          {/* Stacked bar */}
          <div className="flex h-3 rounded-full overflow-hidden bg-surface-primary mb-2">
            {riskCounts.safe > 0 && (
              <div className="bg-status-safe" style={{ width: `${(riskCounts.safe / totalRisk) * 100}%` }} />
            )}
            {riskCounts.caution > 0 && (
              <div className="bg-status-caution" style={{ width: `${(riskCounts.caution / totalRisk) * 100}%` }} />
            )}
            {riskCounts.blocked > 0 && (
              <div className="bg-status-blocked" style={{ width: `${(riskCounts.blocked / totalRisk) * 100}%` }} />
            )}
            {riskCounts.emergency > 0 && (
              <div className="bg-status-emergency" style={{ width: `${(riskCounts.emergency / totalRisk) * 100}%` }} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(riskCounts).filter(([, v]) => v > 0).map(([level, count]) => (
              <span key={level} className="flex items-center gap-1 text-[8px] text-text-muted">
                <span className={`w-1.5 h-1.5 rounded-full bg-status-${level}`} />
                {level} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Token breakdown */}
      {(totalChars > 0 || thinkingChars > 0) && (
        <div>
          <h3 className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Token Breakdown
          </h3>
          <div className="flex h-3 rounded-full overflow-hidden bg-surface-primary mb-2">
            {thinkingChars > 0 && (
              <div
                className="bg-maven-400/40"
                style={{ width: `${(thinkingChars / (totalChars + thinkingChars)) * 100}%` }}
                title="Thinking"
              />
            )}
            <div
              className="bg-teal-400/60"
              style={{ width: `${(totalChars / (totalChars + thinkingChars)) * 100}%` }}
              title="Response"
            />
          </div>
          <div className="flex gap-3 text-[8px] text-text-muted">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-maven-400/40" />
              Thinking (~{Math.round(thinkingChars / 4)} tokens)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400/60" />
              Response (~{Math.round(totalChars / 4)} tokens)
            </span>
          </div>
        </div>
      )}

      {/* Eval trend (pass/fail) */}
      {data.evalHistory.length > 0 && (
        <div>
          <h3 className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Eval Results
          </h3>
          <div className="space-y-1">
            {data.evalHistory.map((ev, i) => (
              <div key={i} className="flex items-center gap-2 text-[9px]">
                <span className="text-text-muted font-mono w-4">#{i + 1}</span>
                <EvalDot result={ev.faithfulness} label="F" />
                <EvalDot result={ev.relevance} label="R" />
                <EvalDot result={ev.safety} label="S" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-[8px] text-text-muted mt-2">
            <span>F = Faithfulness</span>
            <span>R = Relevance</span>
            <span>S = Safety</span>
          </div>
        </div>
      )}

      {/* Production note */}
      <div className="bg-surface-elevated/50 border border-border-subtle rounded-lg p-2.5">
        <p className="text-[8px] text-text-muted leading-relaxed">
          In production: OpenTelemetry traces exported to Datadog/Grafana, with alerts on latency spikes, guardrail trigger rate changes, and eval score degradation.
        </p>
      </div>
    </div>
  );
}

function EvalDot({ result, label }: { result: string; label: string }) {
  const isPass = result === "pass";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-medium ${
      isPass ? "bg-status-safe/15 text-status-safe" : result === "fail" ? "bg-status-blocked/15 text-status-blocked" : "bg-surface-overlay text-text-muted"
    }`}>
      {label}: {isPass ? "PASS" : result === "fail" ? "FAIL" : "?"}
    </span>
  );
}

function MiniCard({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="bg-surface-elevated border border-border-subtle rounded-lg p-2.5">
      <div className={`flex items-center gap-1.5 mb-1 ${color}`}>
        {icon}
        <span className="text-[8px] text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-base font-bold text-text-primary leading-none">{value}</p>
    </div>
  );
}
