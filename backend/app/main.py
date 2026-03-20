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
    max_iterations: int = 3


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
) -> dict:
    """Auto-iterate on the system prompt until faithfulness reaches the target.

    Each iteration:
      1. Run the question through the pipeline
      2. Eval the response
      3. If faithfulness < target, ask Claude to rewrite the prompt
      4. Repeat until target met or max_iterations reached

    Returns the full iteration history.
    """
    from app.services.eval import evaluate_response
    from app.services.rag import format_guidelines_for_prompt, retrieve_guidelines
    from app.services.prompts import RAG_CONTEXT_TEMPLATE

    client = _get_client(x_api_key)
    iterations = []
    current_prompt = request.system_prompt

    for i in range(request.max_iterations):
        # Retrieve
        guidelines = retrieve_guidelines(request.message, n_results=3)
        guidelines_text = format_guidelines_for_prompt(guidelines)

        system = current_prompt
        if guidelines_text:
            system += "\n\n" + RAG_CONTEXT_TEMPLATE.format(guidelines=guidelines_text)

        # Generate
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

        iterations.append({
            "iteration": i + 1,
            "prompt_snippet": current_prompt[:100] + "...",
            "response": response_text,
            "faithfulness": eval_scores["faithfulness"],
            "relevance": eval_scores["relevance"],
            "reasoning": eval_scores["reasoning"],
        })

        # Check if target met
        if eval_scores["faithfulness"] >= request.target_faithfulness:
            break

        # Ask Claude to improve the prompt based on eval feedback
        improve_response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": f"""You are a prompt engineer. The system prompt below produced a response that scored {eval_scores['faithfulness']:.0%} on faithfulness (target: {request.target_faithfulness:.0%}).

The eval judge said: "{eval_scores['reasoning']}"

The key problem is the model is adding information not found in the retrieved clinical guidelines. Rewrite ONLY the response format section of the system prompt to enforce stricter grounding. Keep everything else the same.

Current system prompt:
---
{current_prompt}
---

Return ONLY the complete rewritten system prompt, nothing else.""",
            }],
        )
        current_prompt = improve_response.content[0].text.strip()

    return {
        "iterations": iterations,
        "final_prompt": current_prompt,
        "target_met": iterations[-1]["faithfulness"] >= request.target_faithfulness if iterations else False,
        "final_faithfulness": iterations[-1]["faithfulness"] if iterations else 0,
    }


@app.post("/api/eval")
async def run_eval(x_api_key: str | None = Header(None)) -> dict:
    """Run batch evaluation over all test cases."""
    from app.services.chat import process_message
    from app.services.eval import run_batch_eval, EVAL_TEST_CASES

    client = _get_client(x_api_key)
    results = await run_batch_eval(client, process_message)

    # Compute summary stats
    valid = [r for r in results if r.get("faithfulness", -1) >= 0]
    return {
        "total_cases": len(EVAL_TEST_CASES),
        "completed": len(valid),
        "retrieval_hit_rate": sum(1 for r in results if r.get("retrieval_hit")) / len(results) if results else 0,
        "avg_faithfulness": sum(r["faithfulness"] for r in valid) / len(valid) if valid else 0,
        "avg_relevance": sum(r["relevance"] for r in valid) / len(valid) if valid else 0,
        "results": results,
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
