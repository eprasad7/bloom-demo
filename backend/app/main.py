"""Bloom Care AI — FastAPI application."""

import os
from contextlib import asynccontextmanager

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from pydantic import BaseModel

from app.models import ChatRequest, ChatResponse
from app.services.sessions import init_db

load_dotenv()

DEFAULT_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")


def _get_client(api_key_header: str | None = None) -> anthropic.AsyncAnthropic:
    """Create an Anthropic client using the provided key or fallback to env."""
    key = api_key_header or DEFAULT_API_KEY
    if not key:
        raise HTTPException(
            status_code=400,
            detail="No API key provided. Set ANTHROPIC_API_KEY or pass x-api-key header.",
        )
    return anthropic.AsyncAnthropic(api_key=key)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    await init_db()
    yield


app = FastAPI(
    title="Bloom Care AI",
    description="AI-Powered Women's Health Care Navigation with Clinical Guardrails",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://bloom-demo.up.railway.app",
        "https://bloom.ish.dev",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    x_api_key: str | None = Header(None),
) -> ChatResponse:
    """Process a chat message through the full guardrailed pipeline (non-streaming)."""
    from app.services.chat import process_message

    client = _get_client(x_api_key)
    return await process_message(
        message=request.message,
        session_id=request.session_id,
        client=client,
    )


@app.post("/api/chat/stream")
async def chat_stream(
    request: ChatRequest,
    x_api_key: str | None = Header(None),
) -> StreamingResponse:
    """Process a chat message with SSE streaming.

    Streams pipeline events as Server-Sent Events:
      session, input_rails, icd10, rag, token, output_rails,
      pathway, journey, audit, done, error
    """
    from app.services.chat import process_message_stream

    client = _get_client(x_api_key)
    return StreamingResponse(
        process_message_stream(
            message=request.message,
            session_id=request.session_id,
            client=client,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/journey/{session_id}")
async def get_journey(session_id: str) -> list[dict]:
    """Get the care journey timeline for a session."""
    from app.services.sessions import get_journey

    return await get_journey(session_id)


class PlaygroundRequest(BaseModel):
    message: str
    system_prompt: str


class AutoEvolveRequest(BaseModel):
    message: str
    system_prompt: str
    target_faithfulness: float = 0.75
    max_iterations: int = 5
    test_questions: list[str] | None = None


@app.post("/api/chat/playground")
async def chat_playground(
    request: PlaygroundRequest,
    x_api_key: str | None = Header(None),
) -> dict:
    """Test a message with a custom system prompt and get eval scores."""
    from app.services.eval import evaluate_response
    from app.services.rag import format_guidelines_for_prompt, retrieve_guidelines
    from app.services.prompts import RAG_CONTEXT_TEMPLATE

    client = _get_client(x_api_key)

    # RAG retrieval
    guidelines = retrieve_guidelines(request.message, n_results=3)
    guidelines_text = format_guidelines_for_prompt(guidelines)

    system = request.system_prompt
    if guidelines_text:
        system += "\n\n" + RAG_CONTEXT_TEMPLATE.format(guidelines=guidelines_text)

    # LLM call
    llm_response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": request.message}],
    )
    response_text = llm_response.content[0].text

    # Eval
    eval_scores = await evaluate_response(
        question=request.message,
        answer=response_text,
        retrieved_guidelines=guidelines,
        client=client,
    )

    return {
        "response": response_text,
        "guidelines": [g.model_dump() for g in guidelines],
        "eval_scores": eval_scores,
    }


@app.post("/api/chat/auto-evolve")
async def auto_evolve(
    request: AutoEvolveRequest,
    x_api_key: str | None = Header(None),
) -> StreamingResponse:
    """Autonomous prompt evolution agent (inspired by Karpathy's autoresearch).

    Streams SSE events as the agent iterates:
      1. Generate response with current prompt
      2. Eval faithfulness + relevance (fixed eval function, agent can't touch it)
      3. If below target, agent proposes a strategy and rewrites the prompt
      4. Keep if improved, discard if regressed
      5. Test against multiple questions for robustness
      6. Repeat until target met or max_iterations reached

    The eval function is the "read-only ground truth" (like evaluate_bpb in autoresearch).
    The agent can only modify the system prompt (like train.py in autoresearch).
    """
    import json

    from app.services.eval import evaluate_response
    from app.services.rag import format_guidelines_for_prompt, retrieve_guidelines
    from app.services.prompts import RAG_CONTEXT_TEMPLATE

    client = _get_client(x_api_key)

    test_questions = request.test_questions or [
        request.message,
        "What are the warning signs of preeclampsia?",
        "Is it safe to exercise during pregnancy?",
    ]

    # Strategies the agent cycles through
    strategies = [
        "Add an explicit rule: 'ONLY state facts that appear in the retrieved guidelines. If the guidelines do not cover a topic, say you do not have enough information rather than adding general knowledge.'",
        "Add to response format: 'Every factual claim must have an inline citation [1], [2], etc. If you cannot cite a specific guideline for a claim, do not include it.'",
        "Restructure: separate the response into two clearly labeled sections: (1) 'Based on clinical guidelines' with only cited information, and (2) 'General guidance' for any additional context, clearly marked as not from guidelines.",
        "Add: 'Before responding, mentally check each sentence. If it contains medical information not directly from the retrieved guidelines, remove it. Err on the side of shorter, fully grounded responses.'",
        "Simplify: 'Respond in 2-3 sentences maximum. Only include the most directly relevant information from the retrieved guidelines. Cite every fact.'",
    ]

    async def stream():
        def sse(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data)}\n\n"

        current_prompt = request.system_prompt
        best_prompt = current_prompt
        best_score = 0.0
        iterations = []

        yield sse("start", {
            "max_iterations": request.max_iterations,
            "target": request.target_faithfulness,
            "test_questions": len(test_questions),
            "strategies": len(strategies),
        })

        for i in range(request.max_iterations):
            strategy_used = strategies[i % len(strategies)] if i > 0 else "baseline (no modification)"

            yield sse("iteration_start", {
                "iteration": i + 1,
                "strategy": strategy_used[:80] + "..." if len(strategy_used) > 80 else strategy_used,
            })

            # Eval across all test questions
            question_scores = []
            for qi, question in enumerate(test_questions):
                guidelines = retrieve_guidelines(question, n_results=3)
                guidelines_text = format_guidelines_for_prompt(guidelines)

                system = current_prompt
                if guidelines_text:
                    system += "\n\n" + RAG_CONTEXT_TEMPLATE.format(guidelines=guidelines_text)

                llm_response = await client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=1024,
                    system=system,
                    messages=[{"role": "user", "content": question}],
                )
                response_text = llm_response.content[0].text

                eval_scores = await evaluate_response(
                    question=question,
                    answer=response_text,
                    retrieved_guidelines=guidelines,
                    client=client,
                )

                question_scores.append({
                    "question": question[:50] + "..." if len(question) > 50 else question,
                    "faithfulness": eval_scores["faithfulness"],
                    "relevance": eval_scores["relevance"],
                    "reasoning": eval_scores["reasoning"],
                })

                yield sse("question_eval", {
                    "iteration": i + 1,
                    "question_index": qi + 1,
                    "total_questions": len(test_questions),
                    "faithfulness": eval_scores["faithfulness"],
                    "relevance": eval_scores["relevance"],
                })

            # Count pass/fail across all questions
            faith_passes = sum(1 for q in question_scores if q["faithfulness"] == "pass")
            rel_passes = sum(1 for q in question_scores if q["relevance"] == "pass")
            safety_passes = sum(1 for q in question_scores if q.get("safety") == "pass")
            total_q = len(question_scores)
            pass_rate = faith_passes / total_q if total_q > 0 else 0

            # Keep or discard (autoresearch pattern)
            status = "baseline"
            if i > 0:
                if pass_rate > best_score:
                    status = "keep"
                    best_score = pass_rate
                    best_prompt = current_prompt
                else:
                    status = "discard"
                    current_prompt = best_prompt  # rollback
            else:
                best_score = pass_rate
                best_prompt = current_prompt

            iteration_result = {
                "iteration": i + 1,
                "strategy": strategy_used,
                "faithfulness_pass_rate": f"{faith_passes}/{total_q}",
                "relevance_pass_rate": f"{rel_passes}/{total_q}",
                "safety_pass_rate": f"{safety_passes}/{total_q}",
                "status": status,
                "question_scores": question_scores,
                "prompt_length": len(current_prompt),
            }
            iterations.append(iteration_result)

            yield sse("iteration_complete", iteration_result)

            # Check if all faithfulness checks pass
            if faith_passes == total_q:
                yield sse("target_met", {
                    "iteration": i + 1,
                    "pass_rate": f"{faith_passes}/{total_q}",
                })
                break

            # Agent proposes next modification
            if i < request.max_iterations - 1:
                next_strategy = strategies[(i + 1) % len(strategies)]

                improve_response = await client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=2048,
                    messages=[{
                        "role": "user",
                        "content": f"""You are an autonomous prompt optimization agent. Your goal is to get all faithfulness checks to PASS (currently {faith_passes}/{total_q} passing).

Eval feedback from {len(question_scores)} test questions:
{chr(10).join(f"- Q: {q['question']} | Faithfulness: {q['faithfulness'].upper()} | {q['faithfulness_reason']}" for q in question_scores)}

Strategy to apply: {next_strategy}

Current system prompt:
---
{current_prompt}
---

Apply the strategy above to the system prompt. Return ONLY the complete rewritten system prompt.""",
                    }],
                )
                current_prompt = improve_response.content[0].text.strip()

                yield sse("prompt_rewritten", {
                    "iteration": i + 1,
                    "new_prompt_length": len(current_prompt),
                    "strategy_applied": next_strategy[:80],
                })

        yield sse("complete", {
            "total_iterations": len(iterations),
            "best_pass_rate": round(best_score, 3),
            "target_met": best_score >= 1.0,
            "final_prompt": best_prompt,
            "iterations": iterations,
        })

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.post("/api/eval")
async def run_eval(x_api_key: str | None = Header(None)) -> dict:
    """Run batch evaluation over all test cases."""
    from app.services.chat import process_message
    from app.services.eval import run_batch_eval, EVAL_TEST_CASES

    client = _get_client(x_api_key)
    results = await run_batch_eval(client, process_message)

    # Compute summary stats
    valid = [r for r in results if r.get("faithfulness") in ("pass", "fail")]
    return {
        "total_cases": len(EVAL_TEST_CASES),
        "completed": len(valid),
        "retrieval_hit_rate": sum(1 for r in results if r.get("retrieval_hit")) / len(results) if results else 0,
        "faithfulness_pass_rate": sum(1 for r in valid if r.get("faithfulness") == "pass") / len(valid) if valid else 0,
        "relevance_pass_rate": sum(1 for r in valid if r.get("relevance") == "pass") / len(valid) if valid else 0,
        "safety_pass_rate": sum(1 for r in valid if r.get("safety") == "pass") / len(valid) if valid else 0,
        "results": results,
    }


class ImproveRequest(BaseModel):
    message: str
    original_response: str
    faithfulness_reason: str
    session_id: str | None = None


@app.post("/api/chat/improve")
async def improve_response(
    request: ImproveRequest,
    x_api_key: str | None = Header(None),
) -> dict:
    """Re-generate a response with a stricter grounding constraint.

    Takes the original question and the eval feedback, then generates
    a new response that only uses information from retrieved guidelines.
    """
    from app.services.eval import evaluate_response
    from app.services.rag import retrieve_guidelines, format_guidelines_for_prompt
    from app.services.prompts import MAVEN_SYSTEM_PROMPT, RAG_CONTEXT_TEMPLATE

    client = _get_client(x_api_key)

    guidelines = retrieve_guidelines(request.message, n_results=3)
    guidelines_text = format_guidelines_for_prompt(guidelines)

    stricter_prompt = MAVEN_SYSTEM_PROMPT + """

## CRITICAL GROUNDING RULE (THIS OVERRIDES ALL OTHER INSTRUCTIONS)
Your previous response failed a faithfulness evaluation. The eval judge said:
"{reason}"

For this response, you MUST:
- ONLY state facts that appear word-for-word or paraphrased in the retrieved guidelines below
- If the guidelines do not cover something the user asked about, say "I don't have specific guideline information about that" rather than adding general knowledge
- Every medical fact must have an inline citation [1], [2], [3]
- Keep the response short: 2 paragraphs maximum
- Do NOT add practical tips, home remedies, or general advice unless they appear in the guidelines
""".format(reason=request.faithfulness_reason)

    if guidelines_text:
        stricter_prompt += "\n\n" + RAG_CONTEXT_TEMPLATE.format(guidelines=guidelines_text)

    llm_response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=stricter_prompt,
        messages=[{"role": "user", "content": request.message}],
    )
    improved_text = llm_response.content[0].text

    eval_result = await evaluate_response(
        question=request.message,
        answer=improved_text,
        retrieved_guidelines=guidelines,
        client=client,
    )

    return {
        "response": improved_text,
        "eval": eval_result,
        "guidelines": [g.model_dump() for g in guidelines],
        "improved": eval_result["faithfulness"] == "pass",
    }


class SearchRequest(BaseModel):
    query: str
    n_results: int = 10


@app.post("/api/search")
async def search_guidelines(request: SearchRequest) -> dict:
    """Semantic search across all 137 clinical documents."""
    from app.services.rag import retrieve_guidelines

    results = retrieve_guidelines(request.query, n_results=request.n_results)
    return {
        "query": request.query,
        "total_results": len(results),
        "results": [r.model_dump() for r in results],
    }


class AgentRequest(BaseModel):
    message: str
    session_id: str | None = None


@app.post("/api/agent/assess")
async def agent_assess(
    request: AgentRequest,
    x_api_key: str | None = Header(None),
) -> dict:
    """Multi-step autonomous care assessment agent.

    Executes a structured care assessment pipeline:
      Step 1: Extract patient context (episodic memory)
      Step 2: Classify urgency (ML model)
      Step 3: Retrieve relevant guidelines (RAG)
      Step 4: Generate clinical assessment (Sonnet + thinking)
      Step 5: Run safety evaluation (Haiku judge)
      Step 6: Recommend providers
      Step 7: Create care plan summary

    Returns the full execution trace with each step's output.
    """
    import time
    from app.ml.urgency_classifier import predict_urgency
    from app.services.memory import PatientContext
    from app.services.recommendations import recommend_providers
    from app.services.rag import retrieve_guidelines, format_guidelines_for_prompt
    from app.services.icd10 import lookup_icd10_codes
    from app.services.eval import evaluate_response
    from app.services.guardrails import run_input_rails, run_output_rails
    from app.services.prompts import MAVEN_SYSTEM_PROMPT, RAG_CONTEXT_TEMPLATE

    client = _get_client(x_api_key)
    steps = []
    total_start = time.perf_counter()

    def step(name: str, model: str, output: dict, latency_ms: float):
        steps.append({
            "step": len(steps) + 1,
            "name": name,
            "model": model,
            "output": output,
            "latency_ms": round(latency_ms, 1),
        })

    # Step 1: Safety check
    t = time.perf_counter()
    safety = run_input_rails(request.message)
    step("Safety Check (Input Rails)", "regex engine", {
        "risk_level": safety.risk_level.value,
        "rails_triggered": safety.rails_triggered,
        "passed": safety.risk_level.value == "safe",
    }, (time.perf_counter() - t) * 1000)

    # Step 2: Extract patient context
    t = time.perf_counter()
    ctx = PatientContext()
    memories = ctx.update(request.message)
    summary = ctx.to_summary()
    step("Extract Patient Context", "regex NER", {
        "facts_extracted": len(memories),
        "pregnancy": summary["pregnancy"],
        "symptoms": summary["symptoms"],
        "conditions": summary["conditions"],
    }, (time.perf_counter() - t) * 1000)

    # Step 3: ML urgency classification
    t = time.perf_counter()
    urgency = predict_urgency(request.message)
    step("Classify Urgency", "TF-IDF + GradientBoosting (sklearn)", {
        "urgency_level": urgency["urgency_label"],
        "confidence": urgency["confidence"],
        "probabilities": urgency["probabilities"],
    }, (time.perf_counter() - t) * 1000)

    # Step 4: ICD-10 code lookup
    t = time.perf_counter()
    codes = lookup_icd10_codes(request.message)
    step("ICD-10 Code Mapping", "keyword matcher", {
        "codes_matched": len(codes),
        "codes": codes[:3],
    }, (time.perf_counter() - t) * 1000)

    # Step 5: RAG retrieval
    t = time.perf_counter()
    guidelines = retrieve_guidelines(request.message, n_results=3)
    guidelines_text = format_guidelines_for_prompt(guidelines)
    step("Retrieve Clinical Guidelines", "ChromaDB + MiniLM-L6-v2", {
        "documents_searched": 137,
        "documents_retrieved": len(guidelines),
        "top_sources": [g.source for g in guidelines],
        "top_scores": [g.relevance_score for g in guidelines],
    }, (time.perf_counter() - t) * 1000)

    # Step 6: Generate clinical assessment (Sonnet with thinking)
    t = time.perf_counter()
    system = MAVEN_SYSTEM_PROMPT
    if guidelines_text:
        system += "\n\n" + RAG_CONTEXT_TEMPLATE.format(guidelines=guidelines_text)

    llm_response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=16000,
        thinking={"type": "enabled", "budget_tokens": 3000},
        system=system,
        messages=[{"role": "user", "content": request.message}],
    )

    thinking_text = ""
    response_text = ""
    for block in llm_response.content:
        if block.type == "thinking":
            thinking_text = block.thinking
        elif block.type == "text":
            response_text = block.text

    step("Generate Clinical Assessment", "Claude Sonnet 4 (extended thinking)", {
        "thinking_tokens": len(thinking_text.split()),
        "response_tokens": len(response_text.split()),
        "thinking_preview": thinking_text[:200] + "..." if len(thinking_text) > 200 else thinking_text,
        "response_preview": response_text[:200] + "..." if len(response_text) > 200 else response_text,
    }, (time.perf_counter() - t) * 1000)

    # Step 7: Output safety check
    t = time.perf_counter()
    output_safety = run_output_rails(response_text)
    step("Safety Check (Output Rails)", "regex engine", {
        "risk_level": output_safety.risk_level.value,
        "rails_triggered": output_safety.rails_triggered,
        "response_modified": output_safety.modified_response is not None,
    }, (time.perf_counter() - t) * 1000)

    final_response = output_safety.modified_response or response_text

    # Step 8: Classify care pathway (Haiku)
    t = time.perf_counter()
    from app.services.prompts import ROUTING_PROMPT
    pathway_result = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=20,
        messages=[{"role": "user", "content": ROUTING_PROMPT.format(message=request.message)}],
    )
    pathway = pathway_result.content[0].text.strip().lower()
    step("Classify Care Pathway", "Claude Haiku 4.5", {
        "pathway": pathway,
    }, (time.perf_counter() - t) * 1000)

    # Step 9: Evaluate response (Haiku judge)
    t = time.perf_counter()
    eval_scores = await evaluate_response(
        question=request.message,
        answer=final_response,
        retrieved_guidelines=guidelines,
        client=client,
    )
    step("Evaluate Response Quality", "Claude Haiku 4.5 (LLM-as-judge)", {
        "faithfulness": eval_scores["faithfulness"],
        "relevance": eval_scores["relevance"],
        "reasoning": eval_scores["reasoning"],
    }, (time.perf_counter() - t) * 1000)

    # Step 10: Provider recommendations
    t = time.perf_counter()
    recs = recommend_providers(
        symptoms=summary["symptoms"],
        conditions=summary["conditions"],
        care_pathway=pathway,
    )
    step("Recommend Providers", "rule-based scoring engine", {
        "providers_matched": len(recs),
        "top_provider": recs[0]["title"] if recs else "None",
        "providers": recs,
    }, (time.perf_counter() - t) * 1000)

    total_ms = (time.perf_counter() - total_start) * 1000

    # Model orchestration summary
    models_used = {}
    for s in steps:
        model = s["model"]
        if model not in models_used:
            models_used[model] = {"calls": 0, "total_ms": 0}
        models_used[model]["calls"] += 1
        models_used[model]["total_ms"] = round(models_used[model]["total_ms"] + s["latency_ms"], 1)

    return {
        "message": request.message,
        "response": final_response,
        "thinking": thinking_text,
        "steps": steps,
        "total_steps": len(steps),
        "total_latency_ms": round(total_ms, 1),
        "models_used": models_used,
        "care_plan": {
            "urgency": urgency["urgency_label"],
            "pathway": pathway,
            "recommended_providers": recs,
            "icd10_codes": codes,
            "eval_scores": eval_scores,
        },
    }


@app.get("/api/sessions")
async def list_all_sessions() -> list[dict]:
    """List all sessions with message counts."""
    from app.services.sessions import list_sessions
    return await list_sessions()


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str) -> dict:
    """Get full session detail with messages and journey."""
    from app.services.sessions import get_session_detail
    return await get_session_detail(session_id)


@app.get("/api/memory/stats")
async def memory_stats() -> dict:
    """Get aggregate memory statistics."""
    from app.services.sessions import get_memory_stats
    return await get_memory_stats()


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "bloom-care-ai"}
