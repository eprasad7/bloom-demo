"use client";

import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { EvalScores, RetrievedGuideline } from "@/lib/types";
import { BrainIcon, ChartIcon, SearchIcon } from "@/components/Icons";

interface EvalRun {
  id: number;
  timestamp: string;
  question: string;
  faithfulness: number;
  relevance: number;
  reasoning: string;
}

const SAMPLE_QUESTIONS = [
  "Should I stop taking my iron supplements since they make me nauseous?",
  "I'm 34 weeks pregnant with severe headaches and blurred vision",
  "What prenatal screenings should I expect in my third trimester?",
  "I have irregular periods, weight gain, and acne. Do I have PCOS?",
  "How much caffeine is safe during pregnancy?",
  "What are the signs of postpartum depression?",
  "Is it safe to exercise during pregnancy?",
  "When should I be screened for gestational diabetes?",
];

export function PromptPlayground({
  isOpen,
  onClose,
  apiKey,
}: {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
}) {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [testQuestion, setTestQuestion] = useState(SAMPLE_QUESTIONS[0]);
  const [testResponse, setTestResponse] = useState("");
  const [guidelines, setGuidelines] = useState<RetrievedGuideline[]>([]);
  const [evalResult, setEvalResult] = useState<EvalScores | null>(null);
  const [history, setHistory] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [evolving, setEvolving] = useState(false);
  const [evolveResult, setEvolveResult] = useState<{
    iterations: Array<{
      iteration: number;
      faithfulness: number;
      relevance: number;
      reasoning: string;
      response: string;
    }>;
    final_prompt: string;
    target_met: boolean;
    final_faithfulness: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"response" | "sources">("response");
  const [runCount, setRunCount] = useState(0);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) h["x-api-key"] = apiKey;
    return h;
  }, [apiKey]);

  const runTest = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setTestResponse("");
    setEvalResult(null);
    setGuidelines([]);
    setSuggestion("");

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
    try {
      const res = await fetch(`${apiBase}/api/chat/playground`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          message: testQuestion,
          system_prompt: systemPrompt,
        }),
      });

      if (!res.ok) {
        setTestResponse(`Error: ${res.status} ${res.statusText}`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setTestResponse(data.response);
      setEvalResult(data.eval_scores);
      setGuidelines(data.guidelines ?? []);

      const newRun: EvalRun = {
        id: runCount + 1,
        timestamp: new Date().toLocaleTimeString(),
        question: testQuestion.slice(0, 60) + (testQuestion.length > 60 ? "..." : ""),
        faithfulness: data.eval_scores?.faithfulness ?? -1,
        relevance: data.eval_scores?.relevance ?? -1,
        reasoning: data.eval_scores?.reasoning ?? "",
      };
      setHistory((prev) => [newRun, ...prev]);
      setRunCount((c) => c + 1);
    } catch (e) {
      setTestResponse(`Failed: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [loading, testQuestion, systemPrompt, headers, runCount]);

  const autoEvolve = useCallback(async () => {
    if (evolving) return;
    setEvolving(true);
    setEvolveResult(null);

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
    try {
      const res = await fetch(`${apiBase}/api/chat/auto-evolve`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          message: testQuestion,
          system_prompt: systemPrompt,
          target_faithfulness: 0.75,
          max_iterations: 3,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setEvolveResult(data);

        // Add each iteration to history
        for (const iter of data.iterations) {
          const newRun: EvalRun = {
            id: runCount + iter.iteration,
            timestamp: new Date().toLocaleTimeString(),
            question: `[Auto #${iter.iteration}] ${testQuestion.slice(0, 40)}...`,
            faithfulness: iter.faithfulness,
            relevance: iter.relevance,
            reasoning: iter.reasoning,
          };
          setHistory((prev) => [newRun, ...prev]);
        }
        setRunCount((c) => c + data.iterations.length);
      }
    } catch (e) {
      console.error("Auto-evolve failed:", e);
    } finally {
      setEvolving(false);
    }
  }, [evolving, testQuestion, systemPrompt, headers, runCount]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-primary/80 backdrop-blur-sm fade-in">
      <div className="bg-surface-elevated border border-border-default rounded-2xl shadow-2xl w-[92vw] max-w-6xl h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-default">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-maven-600/20 flex items-center justify-center text-maven-400">
              <BrainIcon size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Prompt Playground
              </h2>
              <p className="text-[11px] text-text-muted">
                Edit prompts, test queries, get AI suggestions, track eval scores
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-overlay flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Left column */}
          <div className="flex-[3] flex flex-col min-h-0 border-r border-border-default">
            {/* System Prompt */}
            <div className="flex-[2] flex flex-col p-4 min-h-0">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  System Prompt
                </label>
                <span className="text-[9px] text-text-muted font-mono">
                  ~{Math.round(systemPrompt.split(/\s+/).length * 1.3)} tokens
                </span>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="flex-1 bg-surface-primary border border-border-default rounded-xl px-4 py-3 text-[11px] text-text-primary font-mono leading-relaxed resize-none focus:outline-none focus:border-border-focus min-h-0"
                spellCheck={false}
              />
            </div>

            {/* Test Question */}
            <div className="shrink-0 px-4 pb-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  Test Question
                </label>
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) setTestQuestion(e.target.value); }}
                  className="text-[10px] bg-surface-overlay border border-border-subtle rounded-lg px-2 py-1 text-text-secondary focus:outline-none cursor-pointer"
                >
                  <option value="">Sample questions...</option>
                  {SAMPLE_QUESTIONS.map((q, i) => (
                    <option key={i} value={q}>{q.slice(0, 50)}...</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <textarea
                  value={testQuestion}
                  onChange={(e) => setTestQuestion(e.target.value)}
                  rows={2}
                  className="flex-1 bg-surface-primary border border-border-default rounded-xl px-4 py-2.5 text-xs text-text-primary resize-none focus:outline-none focus:border-border-focus"
                />
                <button
                  onClick={runTest}
                  disabled={loading}
                  className="shrink-0 bg-maven-600 text-white px-5 rounded-xl text-xs font-semibold hover:bg-maven-500 disabled:opacity-30 transition-all min-w-[72px] hover:-translate-y-px"
                >
                  {loading ? (
                    <span className="flex gap-1 justify-center">
                      <span className="w-1 h-1 rounded-full bg-white animate-bounce" />
                      <span className="w-1 h-1 rounded-full bg-white animate-bounce" style={{animationDelay: "0.1s"}} />
                      <span className="w-1 h-1 rounded-full bg-white animate-bounce" style={{animationDelay: "0.2s"}} />
                    </span>
                  ) : "Run"}
                </button>
              </div>
            </div>

            {/* Response area */}
            <div className="flex-[2] flex flex-col min-h-0 border-t border-border-subtle">
              {/* Tabs */}
              <div className="shrink-0 flex border-b border-border-subtle">
                {(["response", "sources"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                      activeTab === tab
                        ? "text-maven-400 border-b-2 border-maven-400"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {tab === "response" ? "Response" : `Sources (${guidelines.length})`}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === "response" ? (
                  <>
                    {testResponse ? (
                      <div className="bg-surface-primary border border-border-subtle rounded-xl p-4 text-[13px] text-text-primary leading-relaxed">
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
                            ul: ({ children }) => <ul className="mb-2 ml-4 space-y-1 list-disc marker:text-text-muted">{children}</ul>,
                            ol: ({ children }) => <ol className="mb-2 ml-4 space-y-1 list-decimal marker:text-text-muted">{children}</ol>,
                            li: ({ children }) => <li className="text-[13px]">{children}</li>,
                          }}
                        >
                          {testResponse}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted italic text-center mt-8">
                        Click Run to test the current prompt...
                      </p>
                    )}

                    {/* Eval scores */}
                    {evalResult && evalResult.faithfulness >= 0 && (
                      <div className="mt-4 bg-surface-primary border border-border-subtle rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <ChartIcon size={14} className="text-text-muted" />
                          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                            Eval Results
                          </span>
                        </div>
                        <div className="flex gap-3 mb-3">
                          <ScoreChip label="Faithfulness" score={evalResult.faithfulness} />
                          <ScoreChip label="Relevance" score={evalResult.relevance} />
                        </div>
                        {evalResult.reasoning && (
                          <p className="text-[11px] text-text-secondary leading-relaxed italic">
                            {evalResult.reasoning}
                          </p>
                        )}

                        {/* Auto-evolve button */}
                        <button
                          onClick={autoEvolve}
                          disabled={evolving}
                          className="mt-3 w-full text-[11px] py-2.5 rounded-lg border border-maven-400/30 text-maven-400 hover:bg-maven-600/10 transition-colors disabled:opacity-30 flex items-center justify-center gap-2"
                        >
                          <BrainIcon size={12} />
                          {evolving ? "Evolving prompt (up to 3 iterations)..." : "Auto-evolve prompt to 75% faithfulness"}
                        </button>

                        {evolveResult && (
                          <div className="mt-3 bg-maven-600/5 border border-maven-400/20 rounded-xl p-4 message-enter">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[10px] font-semibold text-maven-400">
                                Auto-Evolution Results
                              </p>
                              <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${
                                evolveResult.target_met
                                  ? "bg-status-safe/15 text-status-safe"
                                  : "bg-status-caution/15 text-status-caution"
                              }`}>
                                {evolveResult.target_met ? "Target met" : "Target not met"}
                              </span>
                            </div>

                            {/* Iteration progress */}
                            <div className="space-y-2 mb-3">
                              {evolveResult.iterations.map((iter) => (
                                <div key={iter.iteration} className="flex items-center gap-3">
                                  <span className="text-[9px] font-mono text-text-muted w-4">
                                    #{iter.iteration}
                                  </span>
                                  <div className="flex-1 h-1.5 bg-surface-primary rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        iter.faithfulness >= 0.75
                                          ? "bg-status-safe"
                                          : iter.faithfulness >= 0.5
                                            ? "bg-status-caution"
                                            : "bg-status-blocked"
                                      }`}
                                      style={{ width: `${iter.faithfulness * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] font-mono text-text-secondary w-8 text-right">
                                    {Math.round(iter.faithfulness * 100)}%
                                  </span>
                                </div>
                              ))}
                            </div>

                            <p className="text-[10px] text-text-muted italic mb-3">
                              {evolveResult.iterations[evolveResult.iterations.length - 1]?.reasoning}
                            </p>

                            <button
                              onClick={() => {
                                setSystemPrompt(evolveResult.final_prompt);
                                setEvolveResult(null);
                              }}
                              className="w-full text-[11px] py-2 rounded-lg bg-maven-600 text-white hover:bg-maven-500 transition-colors"
                            >
                              Apply evolved prompt
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    {guidelines.length === 0 ? (
                      <p className="text-xs text-text-muted italic text-center mt-8">
                        Run a test to see retrieved sources...
                      </p>
                    ) : (
                      guidelines.map((g, i) => (
                        <div key={i} className="bg-surface-primary border border-border-subtle rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <SearchIcon size={12} className="text-teal-400" />
                            <span className="text-[11px] text-text-primary font-medium">{g.source}</span>
                            <span className="text-[9px] font-mono text-text-muted ml-auto">
                              {Math.round(g.relevance_score * 100)}%
                            </span>
                          </div>
                          <p className="text-[10px] text-text-secondary leading-snug line-clamp-3">
                            {g.content.slice(0, 250)}...
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Eval History */}
          <div className="flex-[1] flex flex-col min-w-0 min-h-0">
            <div className="shrink-0 px-4 py-3 border-b border-border-default">
              <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                Eval History
              </h3>
              <p className="text-[9px] text-text-muted mt-0.5">
                {history.length} {history.length === 1 ? "run" : "runs"}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <ChartIcon size={20} className="text-text-muted mb-2" />
                  <p className="text-[10px] text-text-muted">
                    Run tests to build history.
                  </p>
                  <p className="text-[9px] text-text-muted mt-1">
                    Compare scores across prompt iterations.
                  </p>
                </div>
              ) : (
                history.map((run) => (
                  <div
                    key={run.id}
                    className="bg-surface-primary border border-border-subtle rounded-lg p-3 message-enter hover:border-border-default transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-text-muted">
                        #{run.id}
                      </span>
                      <span className="text-[9px] text-text-muted">
                        {run.timestamp}
                      </span>
                    </div>
                    <div className="flex gap-2 mb-2">
                      <MiniScore label="F" score={run.faithfulness} />
                      <MiniScore label="R" score={run.relevance} />
                    </div>
                    <p className="text-[9px] text-text-muted truncate">
                      {run.question}
                    </p>
                    {run.reasoning && (
                      <p className="text-[8px] text-text-muted mt-1 line-clamp-2 italic">
                        {run.reasoning}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreChip({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.7
    ? "text-status-safe border-status-safe/30 bg-status-safe/10"
    : score >= 0.4
      ? "text-status-caution border-status-caution/30 bg-status-caution/10"
      : "text-status-blocked border-status-blocked/30 bg-status-blocked/10";

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${color}`}>
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-[11px] font-mono font-bold">{pct}%</span>
    </div>
  );
}

function MiniScore({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.7
    ? "text-status-safe bg-status-safe/15"
    : score >= 0.4
      ? "text-status-caution bg-status-caution/15"
      : "text-status-blocked bg-status-blocked/15";

  return (
    <span className={`text-[9px] font-mono font-medium px-1.5 py-0.5 rounded ${color}`}>
      {label}: {pct}%
    </span>
  );
}

const DEFAULT_PROMPT = `You are Bloom Care's AI health assistant specializing in women's and family health. You are part of Bloom Care, an AI-powered care navigation system built on clinical guidelines from ACOG, WHO, and CDC.

## YOUR SCOPE
You ONLY discuss topics within:
- Women's health (reproductive, gynecologic)
- Fertility and family planning
- Pregnancy and prenatal care
- Postpartum and recovery
- Pediatrics (ages 0-5)
- Menopause and perimenopause

For ANY topic outside this scope, politely redirect.

## ABSOLUTE RULES (NEVER VIOLATE)
1. NEVER provide specific diagnoses ("You have X condition")
2. NEVER recommend starting, stopping, or changing medications
3. NEVER interpret lab results with clinical conclusions
4. NEVER provide emergency medical advice. Always direct to 911
5. NEVER contradict standard ACOG/WHO/CDC guidelines
6. NEVER engage with non-health topics

## ALWAYS DO
- Recommend consulting a healthcare provider for personalized advice
- Include a brief note about consulting their provider when sharing health info
- Ask clarifying questions when the situation is ambiguous
- Flag urgency when symptoms could indicate serious conditions
- Use empathetic, supportive, non-judgmental language
- Reference clinical guidelines when relevant (cite source)
- Suggest connecting with your provider when clinical expertise is needed

## RESPONSE FORMAT
- Keep responses concise: 2-3 paragraphs max
- Use plain language (8th grade reading level)
- Format lists using markdown bullet points (- item) with each item on its own line
- Use **bold** for key terms and important warnings
- NEVER use em dashes (the long dash character). Use commas, periods, or "and" instead
- Write in a warm, conversational tone. Sound like a caring nurse, not a textbook
- When citing retrieved guidelines, use inline references like [1], [2] matching the guideline order
- End with a short, encouraging note about consulting their provider`;
