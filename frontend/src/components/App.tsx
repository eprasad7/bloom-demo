"use client";

import { useCallback, useRef, useState } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { GuardrailInspector } from "@/components/GuardrailInspector";
import { CareJourney } from "@/components/CareJourney";
import { ScenarioBar } from "@/components/ScenarioBar";
import { AuditLog } from "@/components/AuditLog";
import { ICD10Panel } from "@/components/ICD10Panel";
import { ShieldIcon } from "@/components/Icons";
import { PromptPlayground } from "@/components/PromptPlayground";
import { MemoryPanel } from "@/components/MemoryPanel";
import { RAGVisualizer } from "@/components/RAGVisualizer";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { sendMessageStream } from "@/lib/api";
import type {
  AuditEvent,
  EvalScores,
  PatientContext,
  PatientMemory,
  UrgencyPrediction,
  GuardrailLog,
  GuardrailResult,
  ICD10Code,
  JourneyEntry,
  Message,
  RAGContext,
  RetrievedGuideline,
  RiskLevel,
} from "@/lib/types";

type RightPanel = "guardrails" | "rag" | "journey" | "memory" | "audit";

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeGuardrails, setActiveGuardrails] = useState<GuardrailLog | null>(null);
  const [activeRisk, setActiveRisk] = useState<RiskLevel>("safe");
  const [journey, setJourney] = useState<JourneyEntry[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [icd10Codes, setIcd10Codes] = useState<ICD10Code[]>([]);
  const [urgency, setUrgency] = useState<UrgencyPrediction | null>(null);
  const [patientMemories, setPatientMemories] = useState<PatientMemory[]>([]);
  const [patientContext, setPatientContext] = useState<PatientContext | null>(null);
  const [ragGuidelines, setRagGuidelines] = useState<RetrievedGuideline[]>([]);
  const [ragContext, setRagContext] = useState<RAGContext | null>(null);
  const [evalScores, setEvalScores] = useState<EvalScores | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>("guardrails");
  const [apiKey, setApiKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [showPlayground, setShowPlayground] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const streamingTextRef = useRef("");
  const streamingThinkingRef = useRef("");
  const streamingGuidelinesRef = useRef<RetrievedGuideline[]>([]);

  const scrollToBottom = useCallback(() => {
    setTimeout(
      () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      100
    );
  }, []);

  const handleSend = useCallback(
    async (messageText?: string) => {
      const text = (messageText ?? input).trim();
      if (!text || loading) return;

      const userMessage: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setLoading(true);
      streamingTextRef.current = "";
      streamingThinkingRef.current = "";
      streamingGuidelinesRef.current = [];
      scrollToBottom();

      const assistantIdx = messages.length + 1;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", risk_level: "safe" },
      ]);

      let inputRailResult: GuardrailResult | null = null;
      let outputRailResult: GuardrailResult | null = null;
      let originalLlmResponse: string | null = null;

      try {
        await sendMessageStream(text, sessionId, {
          onSession: (id) => setSessionId(id),

          onInputRails: (result) => {
            inputRailResult = result;
            setActiveRisk(result.risk_level);
            setActiveGuardrails({
              input_rails: result,
              output_rails: null,
              original_llm_response: null,
            });
          },

          onICD10: (codes) => setIcd10Codes(codes),

          onMemory: (newMems, ctx) => {
            setPatientMemories((prev) => [...prev, ...newMems]);
            setPatientContext(ctx);
          },

          onUrgency: (pred) => setUrgency(pred),

          onRAG: (guidelines) => {
            streamingGuidelinesRef.current = guidelines;
            setRagGuidelines(guidelines);
          },

          onRAGContext: (context) => {
            setRagContext(context);
          },

          onThinking: (text) => {
            if (text) {
              streamingThinkingRef.current += text;
              const currentThinking = streamingThinkingRef.current;
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIdx] = {
                  ...updated[assistantIdx],
                  thinking: currentThinking,
                };
                return updated;
              });
            }
          },

          onThinkingComplete: (fullText) => {
            streamingThinkingRef.current = fullText;
            setMessages((prev) => {
              const updated = [...prev];
              updated[assistantIdx] = {
                ...updated[assistantIdx],
                thinking: fullText,
              };
              return updated;
            });
          },

          onToken: (text) => {
            streamingTextRef.current += text;
            const currentText = streamingTextRef.current;
            setMessages((prev) => {
              const updated = [...prev];
              updated[assistantIdx] = {
                ...updated[assistantIdx],
                content: currentText,
              };
              return updated;
            });
            scrollToBottom();
          },

          onOutputRails: (result) => {
            outputRailResult = result;
            if (result.risk_level !== "safe") setActiveRisk(result.risk_level);
            setActiveGuardrails((prev) => ({
              input_rails: prev?.input_rails ?? inputRailResult!,
              output_rails: result,
              original_llm_response: null,
            }));
          },

          onResponseReplaced: (original, replacement) => {
            originalLlmResponse = original;
            streamingTextRef.current = replacement;
            setMessages((prev) => {
              const updated = [...prev];
              updated[assistantIdx] = {
                ...updated[assistantIdx],
                content: replacement,
                risk_level: "blocked",
              };
              return updated;
            });
            setActiveGuardrails((prev) => ({
              input_rails: prev?.input_rails ?? inputRailResult!,
              output_rails: prev?.output_rails ?? outputRailResult,
              original_llm_response: original,
            }));
          },

          onPathway: (pathway) => {
            setMessages((prev) => {
              const updated = [...prev];
              updated[assistantIdx] = {
                ...updated[assistantIdx],
                care_pathway: pathway,
              };
              return updated;
            });
          },

          onJourney: (entries) => setJourney(entries),
          onEval: (scores) => setEvalScores(scores),
          onAudit: (events) => setAuditEvents(events),

          onDone: () => {
            const finalRisk: RiskLevel =
              inputRailResult?.risk_level !== "safe"
                ? inputRailResult!.risk_level
                : outputRailResult?.risk_level ?? "safe";

            setMessages((prev) => {
              const updated = [...prev];
              updated[assistantIdx] = {
                ...updated[assistantIdx],
                content: streamingTextRef.current,
                thinking: streamingThinkingRef.current || undefined,
                risk_level: finalRisk,
                guidelines: streamingGuidelinesRef.current,
                guardrails: {
                  input_rails: inputRailResult!,
                  output_rails: outputRailResult,
                  original_llm_response: originalLlmResponse,
                },
              };
              return updated;
            });
            setActiveRisk(finalRisk);
            setLoading(false);
            inputRef.current?.focus();
          },

          onError: (msg) => {
            setMessages((prev) => {
              const updated = [...prev];
              updated[assistantIdx] = {
                role: "assistant",
                content: `Connection error: ${msg}`,
                risk_level: "blocked",
              };
              return updated;
            });
            setLoading(false);
          },
        }, apiKey || null);
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIdx] = {
            role: "assistant",
            content: "Unable to connect to the server. Please try again.",
            risk_level: "blocked",
          };
          return updated;
        });
        setLoading(false);
      }
    },
    [input, loading, sessionId, messages.length, scrollToBottom, apiKey]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const tabs = [
    { key: "guardrails" as const, label: "Guards" },
    { key: "rag" as const, label: "RAG" },
    { key: "journey" as const, label: "Journey" },
    { key: "memory" as const, label: "Memory" },
    { key: "audit" as const, label: "Audit" },
  ];

  return (
    <div className="h-screen flex flex-col bg-surface-primary">
      {/* ── Header ── */}
      <header className="shrink-0 border-b border-border-default bg-surface-elevated">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-maven-500 to-maven-700 flex items-center justify-center shadow-sm">
              <span className="text-white text-sm font-bold tracking-tight">
                B
              </span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-text-primary leading-tight">
                Bloom Care AI
              </h1>
              <p className="text-[11px] text-text-muted leading-tight">
                Care Navigation &middot; Clinical Guardrails &middot; RAG
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {icd10Codes.length > 0 && (
              <span className="text-[10px] px-2 py-1 rounded-md bg-teal-500/15 text-teal-400 font-mono font-medium">
                {icd10Codes.length} ICD-10
              </span>
            )}
            <button
              onClick={() => setShowPlayground(true)}
              className="text-[11px] px-2.5 py-1 rounded-md border border-maven-400/30 text-maven-400 hover:bg-maven-600 hover:text-white hover:border-maven-600 transition-colors focus-ring"
            >
              Playground
            </button>
            {/* API Key — session-only, never persisted */}
            <div className="relative">
              <button
                onClick={() => setShowKeyInput(!showKeyInput)}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors focus-ring ${
                  apiKey
                    ? "border-status-safe/30 text-status-safe bg-status-safe/10"
                    : "border-border-default text-text-muted hover:text-text-secondary"
                }`}
              >
                {apiKey ? "Key Active" : "API Key"}
              </button>
              {showKeyInput && (
                <div className="absolute right-0 top-full mt-2 z-50 bg-surface-elevated border border-border-default rounded-xl shadow-lg p-4 w-80 fade-in">
                  <label className="block text-[11px] text-text-secondary mb-1.5 font-medium">
                    Anthropic API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    autoComplete="off"
                    className="w-full bg-surface-secondary border border-border-default rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted font-mono focus:outline-none focus:border-border-focus"
                  />
                  <p className="text-[10px] text-text-muted mt-2 leading-snug">
                    Optional. Only needed if no server-side key is configured.
                    Held in memory for this session only. Cleared on page close.
                    Sent via header to the backend for API calls.
                  </p>
                  <div className="flex gap-2 mt-3">
                    {apiKey && (
                      <button
                        onClick={() => setApiKey("")}
                        className="flex-1 text-[11px] py-1.5 rounded-lg border border-border-default text-text-secondary hover:text-text-primary transition-colors"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      onClick={() => setShowKeyInput(false)}
                      className="flex-1 text-[11px] py-1.5 rounded-lg bg-maven-600 text-white hover:bg-maven-500 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <span
                className={`w-1.5 h-1.5 rounded-full ${sessionId ? "bg-status-safe" : "bg-text-muted"}`}
              />
              {sessionId ? sessionId.slice(0, 8) : "no session"}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <div className="flex-1 flex min-h-0">
        {/* ── Chat Panel ── */}
        <div className="flex-[3] flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-maven-500/20 to-maven-700/20 flex items-center justify-center mb-5 border border-maven-500/20">
                  <span className="text-maven-400 text-xl font-bold">B</span>
                </div>
                <h2 className="text-base font-semibold text-text-primary mb-1.5">
                  Bloom Care
                </h2>
                <p className="text-sm text-text-secondary max-w-sm leading-relaxed mb-1">
                  AI-powered care navigation for women&apos;s and family health.
                </p>
                <p className="text-xs text-text-muted max-w-sm">
                  Backed by ACOG, WHO, and CDC clinical guidelines with
                  real-time safety guardrails.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-md">
                  {[
                    "Pregnancy",
                    "Fertility",
                    "Postpartum",
                    "Menopause",
                    "Pediatrics",
                  ].map((topic) => (
                    <span
                      key={topic}
                      className="text-[10px] px-2.5 py-1 rounded-full border border-border-default text-text-muted"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <ChatMessage key={i} message={msg} />
            ))}
            {loading && messages[messages.length - 1]?.content === "" && (
              <div className="flex justify-start mb-3">
                <div className="bg-surface-elevated rounded-xl px-4 py-3 border border-border-subtle">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-maven-400 animate-bounce" />
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-maven-400 animate-bounce"
                      style={{ animationDelay: "0.15s" }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-maven-400 animate-bounce"
                      style={{ animationDelay: "0.3s" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Scenario Bar */}
          <ScenarioBar onSelect={(msg) => handleSend(msg)} disabled={loading} />

          {/* Input */}
          <div className="shrink-0 border-t border-border-default bg-surface-elevated px-5 py-3">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your symptoms or ask a health question..."
                rows={1}
                className="flex-1 resize-none bg-surface-secondary border border-border-default rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus/50 transition-colors"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="shrink-0 bg-maven-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-maven-500 active:bg-maven-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] focus-ring"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="flex-[2] flex flex-col min-w-0 border-l border-border-default bg-surface-secondary">
          {/* Tabs */}
          <div className="shrink-0 flex border-b border-border-default bg-surface-elevated/50">
            {tabs.map((tab) => {
              const count =
                tab.key === "rag"
                  ? ragGuidelines.length
                  : tab.key === "journey"
                    ? journey.length
                    : tab.key === "audit"
                      ? auditEvents.length
                      : 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => setRightPanel(tab.key)}
                  className={`flex-1 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors focus-ring ${
                    rightPanel === tab.key
                      ? "text-maven-400 border-b-2 border-maven-400"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className="ml-1.5 text-[9px] bg-maven-600/30 text-maven-300 px-1.5 py-0.5 rounded-full">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {rightPanel === "guardrails" ? (
              <div className="space-y-5">
                {activeGuardrails ? (
                  <GuardrailInspector
                    guardrails={activeGuardrails}
                    riskLevel={activeRisk}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-center">
                    <div className="w-10 h-10 rounded-lg bg-surface-overlay flex items-center justify-center mb-3 text-text-muted">
                      <ShieldIcon size={20} />
                    </div>
                    <p className="text-text-muted text-xs">
                      Guardrail analysis appears here
                    </p>
                    <p className="text-text-muted text-[10px] mt-1">
                      Input &amp; output rails run on every message
                    </p>
                  </div>
                )}
                {urgency && <UrgencyBadge prediction={urgency} />}
                {icd10Codes.length > 0 && <ICD10Panel codes={icd10Codes} />}
              </div>
            ) : rightPanel === "rag" ? (
              <RAGVisualizer
                guidelines={ragGuidelines}
                ragContext={ragContext}
                evalScores={evalScores}
              />
            ) : rightPanel === "journey" ? (
              <CareJourney entries={journey} />
            ) : rightPanel === "memory" ? (
              <MemoryPanel
                currentSessionId={sessionId}
                liveData={{
                  messages,
                  journey,
                  icd10Codes,
                  urgency,
                  evalScores,
                  guidelines: ragGuidelines,
                  auditEvents,
                  carePathway: messages.findLast(m => m.care_pathway)?.care_pathway ?? null,
                  patientMemories,
                  patientContext,
                }}
              />
            ) : (
              <AuditLog events={auditEvents} />
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-4 py-2 border-t border-border-subtle">
            <p className="text-[9px] text-text-muted text-center leading-snug">
              <span className="opacity-60">Demo only. Not medical advice.</span>
              <br />
              Built with <span className="text-status-blocked">&#9829;</span> by Ish Prasad
              <span className="mx-1 opacity-40">|</span>
              Powered by claude-code
            </p>
          </div>
        </div>
      </div>

      {/* Prompt Playground Modal */}
      <PromptPlayground
        isOpen={showPlayground}
        onClose={() => setShowPlayground(false)}
        apiKey={apiKey}
      />
    </div>
  );
}
