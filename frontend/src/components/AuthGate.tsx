"use client";

import { useState } from "react";
import Image from "next/image";
import { ShieldIcon, SearchIcon, BrainIcon, ChartIcon, AlertIcon } from "@/components/Icons";

const VALID_CODES = ["edgetech-2026"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("bloom_auth") === "true";
  });
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (VALID_CODES.includes(code.trim().toLowerCase())) {
      sessionStorage.setItem("bloom_auth", "true");
      setAuthenticated(true);
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  if (authenticated) return <>{children}</>;

  return (
    <div className="min-h-screen bg-surface-primary flex">
      {/* ── Left: Hero ── */}
      <div className="hidden lg:flex flex-[3] flex-col justify-center px-16 xl:px-24 relative overflow-hidden">
        {/* Animated background orbs */}
        <div className="absolute top-[8%] left-[2%] w-[600px] h-[600px] rounded-full bg-maven-600/12 blur-[150px] glow-animate" />
        <div className="absolute bottom-[5%] right-[8%] w-[500px] h-[500px] rounded-full bg-teal-500/8 blur-[130px] glow-animate" style={{ animationDelay: "2s" }} />
        <div className="absolute top-[50%] left-[40%] w-[300px] h-[300px] rounded-full bg-maven-400/6 blur-[100px] glow-animate" style={{ animationDelay: "3s" }} />

        <div className="relative z-10 max-w-2xl">
          {/* Logo */}
          <div className="hero-animate hero-delay-1 flex items-center gap-3 mb-14">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-maven-500 to-maven-700 flex items-center justify-center shadow-lg shadow-maven-600/25">
              <span className="text-white text-lg font-bold">B</span>
            </div>
            <span className="text-base font-semibold text-text-primary tracking-tight">
              Bloom Care
            </span>
          </div>

          {/* Headline */}
          <div className="hero-animate hero-delay-2">
            <h1 className="text-5xl xl:text-[3.5rem] font-bold text-text-primary leading-[1.08] tracking-tight mb-6">
              AI-Powered
              <br />
              Care Navigation
              <br />
              <span className="shimmer-text">
                with Clinical Guardrails
              </span>
            </h1>
          </div>

          <p className="hero-animate hero-delay-3 text-lg text-text-secondary leading-relaxed mb-14 max-w-xl">
            A working prototype of a care navigation system inspired by Maven Clinic,
            grounded in ACOG, WHO, and CDC guidelines with real-time safety rails
            and evidence-based retrieval.
          </p>

          {/* Pipeline — floating cards */}
          <div className="hero-animate hero-delay-4 flex items-start gap-2 mb-14">
            {[
              { icon: <ShieldIcon size={20} />, label: "Input Rails", sub: "3 safety checks", color: "border-status-blocked/20 text-status-blocked", floatClass: "float-slow" },
              { icon: <SearchIcon size={20} />, label: "RAG Retrieval", sub: "137 clinical docs", color: "border-teal-500/20 text-teal-400", floatClass: "float-medium" },
              { icon: <AlertIcon size={20} />, label: "ML Urgency", sub: "TF-IDF + GBM", color: "border-status-caution/20 text-status-caution", floatClass: "float-slow" },
              { icon: <BrainIcon size={20} />, label: "Claude + Think", sub: "Reasoning visible", color: "border-maven-400/20 text-maven-400", floatClass: "float-medium" },
              { icon: <ShieldIcon size={20} />, label: "Output Rails", sub: "Med + Dx safety", color: "border-status-blocked/20 text-status-blocked", floatClass: "float-slow" },
              { icon: <ChartIcon size={20} />, label: "Eval + Evolve", sub: "Pass/fail + auto-fix", color: "border-status-safe/20 text-status-safe", floatClass: "float-medium" },
            ].map((step, i) => (
              <div key={step.label} className="flex items-start gap-2">
                <div className={`flex flex-col items-center text-center w-[4.5rem] ${step.floatClass}`}>
                  <div className={`w-12 h-12 rounded-2xl bg-surface-elevated/80 backdrop-blur border ${step.color} flex items-center justify-center mb-2 shadow-sm`}>
                    {step.icon}
                  </div>
                  <span className="text-[11px] text-text-primary font-medium leading-tight">
                    {step.label}
                  </span>
                  <span className="text-[9px] text-text-muted leading-tight mt-0.5">
                    {step.sub}
                  </span>
                </div>
                {i < 5 && (
                  <div className="flex items-center mt-4">
                    <div className="w-3 h-px bg-border-default" />
                    <div className="w-0 h-0 border-t-[2.5px] border-t-transparent border-b-[2.5px] border-b-transparent border-l-[4px] border-l-border-default" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="hero-animate hero-delay-5 flex gap-12">
            {[
              { value: "137", label: "Clinical Documents", sub: "4 live data sources" },
              { value: "10", label: "Agent Steps", sub: "Autonomous pipeline" },
              { value: "7", label: "Models Orchestrated", sub: "ML + LLM + rules" },
              { value: "4", label: "Memory Types", sub: "Episodic to procedural" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-4xl font-bold text-maven-400 leading-none mb-1.5">{stat.value}</p>
                <p className="text-sm text-text-primary font-medium">{stat.label}</p>
                <p className="text-[11px] text-text-muted mt-0.5">{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: Auth + Builder Info ── */}
      <div className="flex-[1.5] flex flex-col items-center justify-center px-8 border-l border-border-subtle bg-surface-secondary/20 overflow-y-auto">
        <div className="w-full max-w-sm py-10">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-maven-500 to-maven-700 flex items-center justify-center mb-4 shadow-lg">
              <span className="text-white text-xl font-bold">B</span>
            </div>
            <h1 className="text-xl font-bold text-text-primary">Bloom Care</h1>
          </div>

          {/* Builder card */}
          <div className="hero-animate hero-delay-2 flex items-center gap-3.5 mb-8">
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-maven-500/30 shadow-lg shadow-maven-600/10 shrink-0">
              <Image
                src="/headshot.jpg"
                alt="Ish Prasad"
                width={48}
                height={48}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary leading-tight">Ish Prasad</p>
              <p className="text-xs text-text-muted leading-tight">Staff SWE, AI/ML</p>
            </div>
          </div>

          {/* Auth form */}
          <div className="hero-animate hero-delay-3">
            <h2 className="text-2xl font-bold text-text-primary mb-1.5">Welcome</h2>
            <p className="text-sm text-text-secondary mb-6">
              Enter your access code to explore the demo.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <input
                  type="password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Access code..."
                  autoFocus
                  className={`w-full bg-surface-primary border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted font-mono focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus/50 transition-all ${
                    error ? "border-status-blocked shake" : "border-border-default"
                  }`}
                />
                {error && (
                  <p className="text-xs text-status-blocked mt-1.5">Invalid code.</p>
                )}
              </div>
              <button
                type="submit"
                className="w-full bg-maven-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-maven-500 active:bg-maven-700 transition-all min-h-[44px] shadow-lg shadow-maven-600/20 hover:shadow-maven-500/30 hover:-translate-y-px"
              >
                Enter Demo
              </button>
            </form>
          </div>

          {/* Interview Answers */}
          <div className="hero-animate hero-delay-4 mt-8 pt-6 border-t border-border-subtle">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-4">
              From the Builder
            </p>

            <div className="space-y-4">
              <div className="bg-surface-elevated/50 border border-border-subtle rounded-xl p-3.5">
                <p className="text-[11px] text-maven-400 font-semibold mb-1.5 leading-tight">
                  Walk me through a recent AI/ML product you shipped 0 to 1?
                </p>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  This demo is the answer. Bloom Care AI is a full-stack care
                  navigation system with a 10-step autonomous agent orchestrating
                  7 models. Every response gets binary pass/fail eval on faithfulness,
                  relevance, and safety. When faithfulness fails, a one-click
                  &quot;Improve response&quot; button re-generates with stricter grounding.
                  The Prompt Playground takes this further with an autonomous
                  auto-evolve loop (inspired by Karpathy&apos;s autoresearch) that
                  iterates through strategies, keeps improvements, discards
                  regressions, and tests across multiple questions until all
                  faithfulness checks pass.
                </p>
              </div>

              <div className="bg-surface-elevated/50 border border-border-subtle rounded-xl p-3.5">
                <p className="text-[11px] text-maven-400 font-semibold mb-1.5 leading-tight">
                  Describe your experience building with LLMs in production?
                </p>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  At Exmplr, I built a clinical trial matching system processing
                  562K trials with 19.8M RAG vectors using multi-agent orchestration
                  at scale. This demo applies those patterns: multi-model orchestration
                  (Sonnet for generation, Haiku for routing and eval, sklearn for
                  classification, ChromaDB for retrieval), guardrails as a separate
                  validation layer, episodic memory extraction, and binary pass/fail
                  evals following best practices from Hamel Husain and Arize AI
                  research. The eval loop is the key differentiator: it
                  doesn&apos;t just score, it autonomously improves.
                </p>
              </div>
            </div>
          </div>

          {/* Scenarios preview */}
          <div className="hero-animate hero-delay-5 mt-6 pt-6 border-t border-border-subtle">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">
              Try These Scenarios
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["Agent Assessment", "Semantic Search", "Guardrails", "RAG + Citations", "Provider Matching", "Inline Eval + Improve", "Auto-Evolve Loop", "Memory"].map((s) => (
                <span key={s} className="text-[10px] px-2.5 py-1 rounded-full border border-border-default text-text-muted">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="hero-animate hero-delay-6 text-center mt-8 space-y-2">
            <p className="text-[11px] text-text-muted">
              Built with <span className="text-status-blocked">&#9829;</span> by Ish Prasad
              <span className="mx-1.5 opacity-30">|</span>
              Powered by claude-code
            </p>
            <a
              href="https://github.com/eprasad7/bloom-demo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-text-muted hover:text-maven-400 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              View source code
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
