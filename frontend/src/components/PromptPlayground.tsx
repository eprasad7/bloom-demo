"use client";

import { useCallback, useState } from "react";
import type { EvalScores } from "@/lib/types";

interface EvalRun {
  id: number;
  timestamp: string;
  promptSnippet: string;
  question: string;
  faithfulness: number;
  relevance: number;
  reasoning: string;
}

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
  const [testQuestion, setTestQuestion] = useState(
    "I've been having really bad morning sickness. Should I just stop taking my iron supplements since they make me nauseous?"
  );
  const [testResponse, setTestResponse] = useState("");
  const [evalResult, setEvalResult] = useState<EvalScores | null>(null);
  const [history, setHistory] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [runCount, setRunCount] = useState(0);

  const runTest = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setTestResponse("");
    setEvalResult(null);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["x-api-key"] = apiKey;

    try {
      const res = await fetch("/api/chat/playground", {
        method: "POST",
        headers,
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

      const newRun: EvalRun = {
        id: runCount + 1,
        timestamp: new Date().toLocaleTimeString(),
        promptSnippet: systemPrompt.slice(0, 50) + "...",
        question: testQuestion.slice(0, 50) + "...",
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
  }, [loading, testQuestion, systemPrompt, apiKey, runCount]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-primary/80 backdrop-blur-sm fade-in">
      <div className="bg-surface-elevated border border-border-default rounded-2xl shadow-2xl w-[90vw] max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-border-default">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Prompt Playground
            </h2>
            <p className="text-[11px] text-text-muted">
              Edit the system prompt, test queries, and track eval scores across iterations
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-lg px-2 focus-ring rounded"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Editor */}
          <div className="flex-[3] flex flex-col border-r border-border-default">
            {/* System Prompt */}
            <div className="flex-[2] flex flex-col p-4 border-b border-border-subtle">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="flex-1 bg-surface-primary border border-border-default rounded-lg px-3 py-2 text-[11px] text-text-primary font-mono leading-relaxed resize-none focus:outline-none focus:border-border-focus"
                spellCheck={false}
              />
            </div>

            {/* Test Question + Run */}
            <div className="p-4 border-b border-border-subtle">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5 block">
                Test Question
              </label>
              <div className="flex gap-2">
                <textarea
                  value={testQuestion}
                  onChange={(e) => setTestQuestion(e.target.value)}
                  rows={2}
                  className="flex-1 bg-surface-primary border border-border-default rounded-lg px-3 py-2 text-xs text-text-primary resize-none focus:outline-none focus:border-border-focus"
                />
                <button
                  onClick={runTest}
                  disabled={loading}
                  className="shrink-0 bg-maven-600 text-white px-4 rounded-lg text-xs font-medium hover:bg-maven-500 disabled:opacity-30 transition-colors min-w-[70px]"
                >
                  {loading ? "..." : "Run"}
                </button>
              </div>
            </div>

            {/* Response */}
            <div className="flex-1 overflow-y-auto p-4">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5 block">
                Response
              </label>
              {testResponse ? (
                <div className="bg-surface-primary border border-border-subtle rounded-lg p-3 text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
                  {testResponse}
                </div>
              ) : (
                <p className="text-xs text-text-muted italic">
                  Click Run to test the prompt...
                </p>
              )}

              {evalResult && evalResult.faithfulness >= 0 && (
                <div className="mt-3 bg-surface-primary border border-border-subtle rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <ScoreChip
                      label="Faithful"
                      score={evalResult.faithfulness}
                    />
                    <ScoreChip label="Relevant" score={evalResult.relevance} />
                  </div>
                  {evalResult.reasoning && (
                    <p className="text-[10px] text-text-muted italic leading-snug">
                      {evalResult.reasoning}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Eval History */}
          <div className="flex-[1] flex flex-col min-w-0">
            <div className="shrink-0 px-4 py-3 border-b border-border-default">
              <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                Eval History ({history.length} runs)
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {history.length === 0 ? (
                <p className="text-[10px] text-text-muted text-center mt-8">
                  Run tests to build history.
                  <br />
                  Compare scores across prompt iterations.
                </p>
              ) : (
                history.map((run) => (
                  <div
                    key={run.id}
                    className="bg-surface-primary border border-border-subtle rounded-lg p-2.5 message-enter"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono text-text-muted">
                        #{run.id} · {run.timestamp}
                      </span>
                    </div>
                    <div className="flex gap-2 mb-1">
                      <ScoreChip
                        label="F"
                        score={run.faithfulness}
                        compact
                      />
                      <ScoreChip label="R" score={run.relevance} compact />
                    </div>
                    <p className="text-[9px] text-text-muted truncate">
                      {run.question}
                    </p>
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

function ScoreChip({
  label,
  score,
  compact,
}: {
  label: string;
  score: number;
  compact?: boolean;
}) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.7
      ? "text-status-safe bg-status-safe/15"
      : score >= 0.4
        ? "text-status-caution bg-status-caution/15"
        : "text-status-blocked bg-status-blocked/15";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-mono font-medium ${color} ${
        compact ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"
      }`}
    >
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
- Suggest connecting with a Bloom provider when clinical expertise is needed

## RESPONSE FORMAT
- Keep responses concise: 2-4 paragraphs
- Use plain language (8th grade reading level)
- Use bullet points for lists of symptoms or recommendations
- IMPORTANT: When using information from the retrieved guidelines, cite inline using [1], [2], [3] matching the guideline number order provided.
- End clinical responses with a provider consultation suggestion`;
