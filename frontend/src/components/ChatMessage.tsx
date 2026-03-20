"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { EvalScores, Message } from "@/lib/types";
import { CheckIcon, XIcon, BrainIcon } from "@/components/Icons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const RISK_STYLES = {
  safe: "",
  caution: "border-l-2 border-l-status-caution",
  blocked: "border-l-2 border-l-status-blocked",
  emergency: "border-l-2 border-l-status-emergency rail-triggered",
} as const;

export function ChatMessage({
  message,
  onImproved,
  apiKey,
}: {
  message: Message;
  onImproved?: (newContent: string, newEval: EvalScores) => void;
  apiKey?: string;
}) {
  const isUser = message.role === "user";
  const riskLevel = message.risk_level ?? "safe";
  const [showThinking, setShowThinking] = useState(false);
  const [improving, setImproving] = useState(false);
  const [improvedResponse, setImprovedResponse] = useState<string | null>(null);
  const [improvedEval, setImprovedEval] = useState<EvalScores | null>(null);

  if (!isUser && !message.content && !message.thinking) return null;

  const evalScores = message.eval_scores;
  const hasFailed = evalScores &&
    typeof evalScores.faithfulness === "string" &&
    evalScores.faithfulness === "fail";

  const handleImprove = async () => {
    if (improving || !hasFailed) return;
    setImproving(true);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-api-key"] = apiKey;

    try {
      const res = await fetch(`${API_BASE}/api/chat/improve`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: message.original_question || "",
          original_response: message.content,
          faithfulness_reason: evalScores?.faithfulness_reason || "",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setImprovedResponse(data.response);
        setImprovedEval(data.eval);
        if (onImproved) onImproved(data.response, data.eval);
      }
    } catch { /* ignore */ }
    setImproving(false);
  };

  const displayContent = improvedResponse || message.content;
  const displayEval = improvedEval || evalScores;

  return (
    <div
      className={`message-enter flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className={`max-w-[85%] rounded-xl px-4 py-3 ${
          isUser
            ? "bg-maven-600 text-white"
            : `bg-surface-elevated text-text-primary border border-border-subtle ${RISK_STYLES[riskLevel]}`
        }`}
      >
        {!isUser && riskLevel === "emergency" && (
          <div className="flex items-center gap-2 mb-2 text-status-emergency font-semibold text-xs">
            <span className="inline-block w-2 h-2 rounded-full bg-status-emergency animate-pulse" />
            EMERGENCY ESCALATION
          </div>
        )}
        {!isUser && riskLevel === "blocked" && (
          <div className="flex items-center gap-2 mb-2 text-status-blocked font-semibold text-xs">
            <span className="inline-block w-2 h-2 rounded-full bg-status-blocked" />
            GUARDRAIL ACTIVATED
          </div>
        )}

        {/* Thinking */}
        {!isUser && message.thinking && (
          <div className="mb-2">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center gap-1.5 text-[10px] text-maven-400 hover:text-maven-300 font-medium transition-colors"
            >
              <span className={`transition-transform duration-200 ${showThinking ? "rotate-90" : ""}`}>
                &#9654;
              </span>
              View reasoning ({Math.round(message.thinking.length / 4)} tokens)
            </button>
            {showThinking && (
              <div className="mt-2 bg-surface-primary/50 border border-maven-400/20 rounded-lg px-3 py-2 max-h-48 overflow-y-auto">
                <p className="text-[10px] text-text-muted leading-relaxed whitespace-pre-wrap font-mono">
                  {message.thinking}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Improved badge */}
        {improvedResponse && (
          <div className="flex items-center gap-1.5 mb-2 text-[10px] text-status-safe font-medium">
            <CheckIcon size={10} />
            Response improved via auto-eval loop
          </div>
        )}

        {/* Content */}
        {isUser ? (
          <div className="text-[13px] leading-relaxed">{message.content}</div>
        ) : (
          <div className="prose-maven text-[13px] leading-relaxed">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                strong: ({ children }) => (
                  <strong className="font-semibold text-text-primary">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-text-secondary">{children}</em>
                ),
                ul: ({ children }) => (
                  <ul className="mb-2 ml-4 space-y-1 list-disc marker:text-text-muted">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-2 ml-4 space-y-1 list-decimal marker:text-text-muted">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-[13px] leading-relaxed">{children}</li>
                ),
                h1: ({ children }) => (
                  <h3 className="text-sm font-semibold text-text-primary mt-3 mb-1">{children}</h3>
                ),
                h2: ({ children }) => (
                  <h3 className="text-sm font-semibold text-text-primary mt-3 mb-1">{children}</h3>
                ),
                h3: ({ children }) => (
                  <h4 className="text-[13px] font-semibold text-text-primary mt-2 mb-1">{children}</h4>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-maven-400/40 pl-3 my-2 text-text-secondary italic">
                    {children}
                  </blockquote>
                ),
                code: ({ children }) => (
                  <code className="bg-surface-overlay px-1.5 py-0.5 rounded text-[11px] font-mono text-teal-400">
                    {children}
                  </code>
                ),
                a: ({ children, href }) => (
                  <a href={href} className="text-maven-400 underline underline-offset-2 hover:text-maven-300" target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
          </div>
        )}

        {/* Inline eval results + improve button */}
        {!isUser && displayEval && typeof displayEval.faithfulness === "string" && displayEval.faithfulness !== "error" && (
          <div className="mt-3 pt-2 border-t border-border-subtle">
            <div className="flex items-center gap-2 flex-wrap">
              <EvalBadge label="Faithfulness" result={displayEval.faithfulness} />
              <EvalBadge label="Relevance" result={displayEval.relevance} />
              <EvalBadge label="Safety" result={displayEval.safety} />

              {/* Improve button on failure */}
              {hasFailed && !improvedResponse && (
                <button
                  onClick={handleImprove}
                  disabled={improving}
                  className="ml-auto flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg border border-maven-400/30 text-maven-400 hover:bg-maven-600/10 transition-colors disabled:opacity-30"
                >
                  <BrainIcon size={10} />
                  {improving ? "Improving..." : "Improve response"}
                </button>
              )}
            </div>

            {hasFailed && !improvedResponse && displayEval.faithfulness_reason && (
              <p className="text-[9px] text-text-muted mt-1.5 italic leading-snug">
                {displayEval.faithfulness_reason}
              </p>
            )}
          </div>
        )}

        {/* Sources */}
        {!isUser && message.guidelines && message.guidelines.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border-subtle">
            <p className="text-[10px] text-text-muted font-medium mb-1 uppercase tracking-wider">
              Sources
            </p>
            {message.guidelines.map((g, i) => (
              <p key={i} className="text-[11px] text-text-secondary leading-snug">
                <span className="text-teal-400 font-mono">[{i + 1}]</span>{" "}
                {g.source}{" "}
                <span className="text-text-muted">
                  ({Math.round(g.relevance_score * 100)}%)
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EvalBadge({ label, result }: { label: string; result: string }) {
  const isPass = result === "pass";
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded ${
      isPass ? "bg-status-safe/15 text-status-safe" : "bg-status-blocked/15 text-status-blocked"
    }`}>
      {isPass ? <CheckIcon size={8} /> : <XIcon size={8} />}
      {label}
    </span>
  );
}
