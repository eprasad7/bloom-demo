"use client";

import type { GuardrailLog, RiskLevel } from "@/lib/types";

const RISK_BADGE: Record<RiskLevel, { label: string; className: string }> = {
  safe: { label: "SAFE", className: "bg-status-safe-bg text-status-safe" },
  caution: {
    label: "CAUTION",
    className: "bg-status-caution-bg text-status-caution",
  },
  blocked: {
    label: "BLOCKED",
    className: "bg-status-blocked-bg text-status-blocked",
  },
  emergency: {
    label: "EMERGENCY",
    className: "bg-status-emergency-bg text-status-emergency rail-triggered",
  },
};

function RailStatus({
  name,
  passed,
  triggered,
}: {
  name: string;
  passed: boolean;
  triggered: string[];
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span
        className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
          passed ? "bg-status-safe" : "bg-status-blocked"
        } ${!passed ? "rail-triggered" : ""}`}
      />
      <div className="min-w-0">
        <span className="text-xs font-medium text-text-primary">{name}</span>
        {triggered.length > 0 && (
          <div className="mt-0.5">
            {triggered.map((t, i) => (
              <p key={i} className="text-xs text-status-blocked font-mono break-all">
                {t}
              </p>
            ))}
          </div>
        )}
        {passed && (
          <p className="text-xs text-text-muted">pass</p>
        )}
      </div>
    </div>
  );
}

export function GuardrailInspector({
  guardrails,
  riskLevel,
}: {
  guardrails: GuardrailLog | null;
  riskLevel: RiskLevel;
}) {
  const badge = RISK_BADGE[riskLevel];

  const inputRails = guardrails?.input_rails;
  const outputRails = guardrails?.output_rails;

  // Categorize input rail triggers
  const emergencyTriggered = inputRails?.rails_triggered.filter((r) =>
    r.startsWith("emergency:")
  ) ?? [];
  const offTopicTriggered = inputRails?.rails_triggered.filter((r) =>
    r.startsWith("off_topic:")
  ) ?? [];
  const jailbreakTriggered = inputRails?.rails_triggered.filter(
    (r) => r === "jailbreak_attempt"
  ) ?? [];

  // Categorize output rail triggers
  const diagnosisTriggered = outputRails?.rails_triggered.filter((r) =>
    r.startsWith("diagnosis_detected:")
  ) ?? [];
  const medTriggered = outputRails?.rails_triggered.filter((r) =>
    r.startsWith("unsafe_medication:")
  ) ?? [];
  const disclaimerTriggered = outputRails?.rails_triggered.filter(
    (r) => r === "missing_disclaimer"
  ) ?? [];

  return (
    <div className="space-y-4">
      {/* Risk Level Badge */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Risk Level
        </h3>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-bold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Input Rails */}
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          Input Rails
        </h3>
        <div className="space-y-0.5">
          <RailStatus
            name="Emergency Detection"
            passed={emergencyTriggered.length === 0}
            triggered={emergencyTriggered}
          />
          <RailStatus
            name="Topic Check"
            passed={offTopicTriggered.length === 0}
            triggered={offTopicTriggered}
          />
          <RailStatus
            name="Jailbreak Check"
            passed={jailbreakTriggered.length === 0}
            triggered={jailbreakTriggered}
          />
        </div>
      </div>

      {/* Output Rails */}
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          Output Rails
        </h3>
        {inputRails?.risk_level === "emergency" ||
        inputRails?.risk_level === "blocked" ? (
          <p className="text-xs text-text-muted italic">
            Bypassed. Input rail pre-empted LLM call
          </p>
        ) : (
          <div className="space-y-0.5">
            <RailStatus
              name="Diagnosis Check"
              passed={diagnosisTriggered.length === 0}
              triggered={diagnosisTriggered}
            />
            <RailStatus
              name="Medication Safety"
              passed={medTriggered.length === 0}
              triggered={medTriggered}
            />
            <RailStatus
              name="Disclaimer Check"
              passed={disclaimerTriggered.length === 0}
              triggered={disclaimerTriggered}
            />
          </div>
        )}
      </div>

      {/* Original vs Modified */}
      {guardrails?.original_llm_response && (
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
            Original LLM Response
          </h3>
          <div className="bg-status-blocked-bg border border-status-blocked/20 rounded-md p-2 text-xs text-text-secondary line-through opacity-70 max-h-32 overflow-y-auto">
            {guardrails.original_llm_response}
          </div>
        </div>
      )}
    </div>
  );
}
