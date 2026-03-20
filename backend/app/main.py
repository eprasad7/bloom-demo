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


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "bloom-care-ai"}
