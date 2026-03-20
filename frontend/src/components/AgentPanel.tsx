"use client";

import { useCallback, useState } from "react";
import { BrainIcon, ShieldIcon, SearchIcon, AlertIcon, ChartIcon, UserIcon, HospitalIcon, FolderIcon, ClockIcon, CheckIcon } from "@/components/Icons";
import type { ReactNode } from "react";
import { API_BASE, getAuthHeaders } from "@/lib/api";

interface AgentStep {
  step: number;
  name: string;
  model: string;
  output: Record<string, unknown>;
  latency_ms: number;
}

interface AgentResult {
  message: string;
  response: string;
  thinking: string;
  steps: AgentStep[];
  total_steps: number;
  total_latency_ms: number;
  models_used: Record<string, { calls: number; total_ms: number }>;
  care_plan: Record<string, unknown>;
}

const STEP_ICONS: Record<string, ReactNode> = {
  "Safety Check (Input Rails)": <ShieldIcon size={14} />,
  "Extract Patient Context": <BrainIcon size={14} />,
  "Classify Urgency": <AlertIcon size={14} />,
  "ICD-10 Code Mapping": <HospitalIcon size={14} />,
  "Retrieve Clinical Guidelines": <SearchIcon size={14} />,
  "Generate Clinical Assessment": <BrainIcon size={14} />,
  "Safety Check (Output Rails)": <ShieldIcon size={14} />,
  "Classify Care Pathway": <FolderIcon size={14} />,
  "Evaluate Response Quality": <ChartIcon size={14} />,
  "Recommend Providers": <UserIcon size={14} />,
};

const SAMPLE_CASES = [
  "I'm 32 weeks pregnant with severe headaches, blurred vision, and swollen feet",
  "I've been trying to conceive for 14 months with irregular periods and weight gain",
  "I'm 6 weeks postpartum and can't stop crying, I feel disconnected from my baby",
  "I'm 28 weeks pregnant, what screenings should I expect in my third trimester?",
];

export function AgentPanel({ apiKey }: { apiKey: string }) {
  const [query, setQuery] = useState(SAMPLE_CASES[0]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const runAgent = useCallback(async (q?: string) => {
    const message = q || query;
    if (!message.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setQuery(message);

    const headers = getAuthHeaders(apiKey);

    try {
      const res = await fetch(`${API_BASE}/api/agent/assess`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message }),
      });
      if (res.ok) setResult(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [query, loading, apiKey]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-1">Care Assessment Agent</h3>
        <p className="text-[11px] text-text-muted">
          Multi-step autonomous agent that orchestrates 10 pipeline steps across 5 models to produce a complete care assessment.
        </p>
      </div>

      {/* Input */}
      <div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={2}
          className="w-full bg-surface-primary border border-border-default rounded-xl px-4 py-2.5 text-xs text-text-primary resize-none focus:outline-none focus:border-border-focus"
        />
        <div className="flex items-center justify-between mt-2">
          <div className="flex flex-wrap gap-1">
            {SAMPLE_CASES.map((c, i) => (
              <button
                key={i}
                onClick={() => runAgent(c)}
                className="text-[8px] px-2 py-0.5 rounded-full border border-border-subtle text-text-muted hover:text-text-secondary hover:border-border-default transition-colors"
              >
                Case {i + 1}
              </button>
            ))}
          </div>
          <button
            onClick={() => runAgent()}
            disabled={loading}
            className="bg-maven-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-maven-500 disabled:opacity-30 transition-colors"
          >
            {loading ? "Running agent..." : "Run Assessment"}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-text-muted text-xs animate-pulse">
          <BrainIcon size={14} />
          Executing 10-step agent pipeline...
        </div>
      )}

      {result && (
        <>
          {/* Model orchestration summary */}
          <div className="bg-surface-elevated border border-border-subtle rounded-xl p-3">
            <h4 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
              Model Orchestration
            </h4>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-text-secondary">
                {result.total_steps} steps completed
              </span>
              <span className="text-[11px] font-mono text-text-muted flex items-center gap-1">
                <ClockIcon size={10} />
                {result.total_latency_ms >= 1000
                  ? `${(result.total_latency_ms / 1000).toFixed(1)}s`
                  : `${Math.round(result.total_latency_ms)}ms`}
              </span>
            </div>
            <div className="space-y-1">
              {Object.entries(result.models_used).map(([model, info]) => (
                <div key={model} className="flex items-center gap-2 text-[9px]">
                  <span className="w-2 h-2 rounded-full bg-maven-400 shrink-0" />
                  <span className="text-text-primary font-medium flex-1 truncate">{model}</span>
                  <span className="text-text-muted font-mono">{info.calls}x</span>
                  <span className="text-text-muted font-mono w-14 text-right">
                    {info.total_ms >= 1000 ? `${(info.total_ms / 1000).toFixed(1)}s` : `${Math.round(info.total_ms)}ms`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Step-by-step execution */}
          <div>
            <h4 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
              Execution Trace
            </h4>
            <div className="space-y-1">
              {result.steps.map((step) => {
                const isExpanded = expandedStep === step.step;
                const icon = STEP_ICONS[step.name] || <CheckIcon size={14} />;
                return (
                  <div key={step.step} className="message-enter">
                    <button
                      onClick={() => setExpandedStep(isExpanded ? null : step.step)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg bg-surface-elevated border border-border-subtle hover:border-border-default transition-colors text-left"
                    >
                      <span className="text-[9px] font-mono text-text-muted w-4">{step.step}</span>
                      <span className="text-maven-400 shrink-0">{icon}</span>
                      <span className="text-[10px] text-text-primary font-medium flex-1 truncate">{step.name}</span>
                      <span className="text-[8px] text-text-muted font-mono shrink-0">
                        {step.latency_ms >= 1000 ? `${(step.latency_ms / 1000).toFixed(1)}s` : `${Math.round(step.latency_ms)}ms`}
                      </span>
                      <span className="text-[9px] text-text-muted">
                        {isExpanded ? "−" : "+"}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="mt-1 ml-6 p-2 bg-surface-primary rounded-lg border border-border-subtle">
                        <p className="text-[8px] text-text-muted font-mono mb-1">{step.model}</p>
                        <pre className="text-[9px] text-text-secondary leading-relaxed whitespace-pre-wrap break-all">
                          {JSON.stringify(step.output, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
