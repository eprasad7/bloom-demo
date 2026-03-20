"""Chat orchestration — ties together RAG, guardrails, LLM, sessions, audit, and ICD-10."""

import json
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

import anthropic

from app.models import (
    CarePathway,
    ChatResponse,
    GuardrailLog,
    JourneyEntry,
    RiskLevel,
)
from app.ml.urgency_classifier import predict_urgency
from app.services.audit import AuditLogger
from app.services.memory import PatientContext
from app.services.recommendations import recommend_providers
from app.services.eval import evaluate_response
from app.services.guardrails import run_input_rails, run_output_rails
from app.services.icd10 import lookup_icd10_codes
from app.services.prompts import MAVEN_SYSTEM_PROMPT, RAG_CONTEXT_TEMPLATE, ROUTING_PROMPT
from app.services.rag import format_guidelines_for_prompt, retrieve_guidelines
from app.services.sessions import (
    add_journey_entry,
    add_message,
    create_session,
    get_journey,
    get_messages,
    session_exists,
    update_session_pathway,
)


async def process_message(
    message: str,
    session_id: str | None,
    client: anthropic.AsyncAnthropic,
) -> ChatResponse:
    """Full pipeline: input rails → RAG → LLM → output rails → session update."""
    audit = AuditLogger()

    # ── Session management ──
    if session_id is None or not await session_exists(session_id):
        session_id = await create_session()

    # ── Step 1: Input Rails ──
    audit.start_timer("input_rails")
    input_result = run_input_rails(message)
    audit.log(
        "input_rail",
        f"Risk: {input_result.risk_level.value} | Triggered: {input_result.rails_triggered or 'none'}",
        risk_level=input_result.risk_level,
        timer_key="input_rails",
    )

    # ── ICD-10 Lookup ──
    audit.start_timer("icd10")
    icd10_codes = lookup_icd10_codes(message)
    audit.log(
        "icd10_lookup",
        f"Matched {len(icd10_codes)} codes: {[c['code'] for c in icd10_codes]}" if icd10_codes else "No codes matched",
        timer_key="icd10",
    )

    if input_result.risk_level in (RiskLevel.BLOCKED, RiskLevel.EMERGENCY):
        await add_message(session_id, "user", message)
        await add_message(session_id, "assistant", input_result.modified_response)

        audit.start_timer("pathway")
        pathway = await _classify_pathway(message, client)
        await update_session_pathway(session_id, pathway)
        audit.log("pathway_classification", f"Pathway: {pathway.value}", timer_key="pathway")

        if input_result.risk_level == RiskLevel.EMERGENCY:
            await add_journey_entry(
                session_id,
                JourneyEntry(
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    summary=input_result.rails_triggered[0],
                    care_pathway=pathway,
                    action="escalation",
                    details=input_result.explanation,
                ),
            )

        journey = await get_journey(session_id)
        return ChatResponse(
            response=input_result.modified_response,
            session_id=session_id,
            care_pathway=pathway,
            guidelines_cited=[],
            guardrails=GuardrailLog(input_rails=input_result),
            care_journey=journey,
            icd10_codes=icd10_codes,
            audit_log=audit.to_dicts(),
        )

    # ── Step 2: RAG Retrieval ──
    audit.start_timer("rag")
    guidelines = retrieve_guidelines(message, n_results=3)
    guidelines_text = format_guidelines_for_prompt(guidelines)
    audit.log(
        "rag_retrieval",
        f"Retrieved {len(guidelines)} guidelines (top: {guidelines[0].source[:40] if guidelines else 'none'})",
        timer_key="rag",
    )

    # ── Step 3: Build conversation context ──
    history = await get_messages(session_id, limit=10)
    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": message})

    system_prompt = MAVEN_SYSTEM_PROMPT
    if guidelines_text:
        system_prompt += "\n\n" + RAG_CONTEXT_TEMPLATE.format(guidelines=guidelines_text)

    # ── Step 4: LLM Call ──
    audit.start_timer("llm")
    llm_response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    )
    response_text = llm_response.content[0].text
    audit.log("llm_call", f"Generated {len(response_text)} chars", timer_key="llm")

    # ── Step 5: Output Rails ──
    audit.start_timer("output_rails")
    output_result = run_output_rails(response_text)
    final_response = output_result.modified_response or response_text
    audit.log(
        "output_rail",
        f"Risk: {output_result.risk_level.value} | Triggered: {output_result.rails_triggered or 'none'}",
        risk_level=output_result.risk_level,
        timer_key="output_rails",
    )

    # ── Step 6: Classify care pathway ──
    audit.start_timer("pathway")
    pathway = await _classify_pathway(message, client)
    await update_session_pathway(session_id, pathway)
    audit.log("pathway_classification", f"Pathway: {pathway.value}", timer_key="pathway")

    # ── Step 7: Store in session ──
    await add_message(session_id, "user", message)
    await add_message(session_id, "assistant", final_response)

    action = "guidance"
    if output_result.risk_level == RiskLevel.BLOCKED:
        action = "referral"

    await add_journey_entry(
        session_id,
        JourneyEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            summary=_summarize_interaction(message),
            care_pathway=pathway,
            action=action,
            details=f"Guidelines cited: {len(guidelines)}",
        ),
    )

    journey = await get_journey(session_id)

    return ChatResponse(
        response=final_response,
        session_id=session_id,
        care_pathway=pathway,
        guidelines_cited=guidelines,
        guardrails=GuardrailLog(
            input_rails=input_result,
            output_rails=output_result,
            original_llm_response=response_text if output_result.modified_response else None,
        ),
        care_journey=journey,
        icd10_codes=icd10_codes,
        audit_log=audit.to_dicts(),
    )


async def process_message_stream(
    message: str,
    session_id: str | None,
    client: anthropic.AsyncAnthropic,
) -> AsyncGenerator[str, None]:
    """Streaming pipeline — yields SSE events as the pipeline progresses.

    Event types:
      - session: {session_id}
      - input_rails: {guardrail_result}
      - icd10: {codes}
      - rag: {guidelines}
      - token: {text chunk}
      - output_rails: {guardrail_result}
      - pathway: {care_pathway}
      - journey: {entries}
      - audit: {events}
      - done: {final metadata}
      - error: {message}
    """
    audit = AuditLogger()

    def sse(event: str, data: dict | str) -> str:
        payload = data if isinstance(data, str) else json.dumps(data)
        return f"event: {event}\ndata: {payload}\n\n"

    try:
        # ── Session ──
        if session_id is None or not await session_exists(session_id):
            session_id = await create_session()
        yield sse("session", {"session_id": session_id})

        # ── Input Rails ──
        audit.start_timer("input_rails")
        input_result = run_input_rails(message)
        audit.log(
            "input_rail",
            f"Risk: {input_result.risk_level.value} | {input_result.rails_triggered or 'none'}",
            risk_level=input_result.risk_level,
            timer_key="input_rails",
        )
        yield sse("input_rails", input_result.model_dump())

        # ── ICD-10 ──
        audit.start_timer("icd10")
        icd10_codes = lookup_icd10_codes(message)
        audit.log(
            "icd10_lookup",
            f"Matched {len(icd10_codes)} codes",
            timer_key="icd10",
        )
        yield sse("icd10", {"codes": icd10_codes})

        # ── Episodic Memory Extraction ──
        audit.start_timer("memory")
        patient_ctx = PatientContext()
        # Extract from current message and all prior user messages
        prior_messages = await get_messages(session_id, limit=20)
        for m in prior_messages:
            if m["role"] == "user":
                patient_ctx.update(m["content"])
        new_memories = patient_ctx.update(message)
        audit.log(
            "memory_extraction",
            f"Extracted {len(new_memories)} new facts, {patient_ctx.to_summary()['total_facts']} total",
            timer_key="memory",
        )
        yield sse("memory", {
            "new_memories": new_memories,
            "patient_context": patient_ctx.to_summary(),
        })

        # ── Provider Recommendations ──
        audit.start_timer("recommendations")
        ctx_summary = patient_ctx.to_summary()
        # Infer pathway from context for routing
        inferred_pathway = ""
        pregnancy_vals = " ".join(ctx_summary["pregnancy"].values()).lower()
        care_vals = " ".join(ctx_summary["care_context"].values()).lower()
        if pregnancy_vals:
            inferred_pathway = "maternity"
        elif "postpartum" in care_vals:
            inferred_pathway = "postpartum"
        elif "menopause" in care_vals:
            inferred_pathway = "menopause"
        elif any("infertil" in c.lower() or "conceive" in c.lower() for c in ctx_summary["conditions"] + list(ctx_summary["care_context"].values())):
            inferred_pathway = "fertility"

        recommendations = recommend_providers(
            symptoms=ctx_summary["symptoms"],
            conditions=ctx_summary["conditions"],
            care_pathway=inferred_pathway,
            gestational_age=next(iter(ctx_summary["pregnancy"].values()), None),
        )
        audit.log(
            "recommendations",
            f"Recommended {len(recommendations)} providers",
            timer_key="recommendations",
        )
        yield sse("recommendations", {"providers": recommendations})

        # ── ML Urgency Classification ──
        audit.start_timer("urgency_ml")
        urgency = predict_urgency(message)
        audit.log(
            "urgency_ml",
            f"Predicted: {urgency['urgency_label']} ({urgency['confidence']:.0%})",
            timer_key="urgency_ml",
        )
        yield sse("urgency", urgency)

        # ── Blocked / Emergency ──
        if input_result.risk_level in (RiskLevel.BLOCKED, RiskLevel.EMERGENCY):
            await add_message(session_id, "user", message)
            await add_message(session_id, "assistant", input_result.modified_response)

            audit.start_timer("pathway")
            pathway = await _classify_pathway(message, client)
            await update_session_pathway(session_id, pathway)
            audit.log("pathway_classification", f"Pathway: {pathway.value}", timer_key="pathway")
            yield sse("pathway", {"care_pathway": pathway.value})

            if input_result.risk_level == RiskLevel.EMERGENCY:
                await add_journey_entry(
                    session_id,
                    JourneyEntry(
                        timestamp=datetime.now(timezone.utc).isoformat(),
                        summary=input_result.rails_triggered[0],
                        care_pathway=pathway,
                        action="escalation",
                        details=input_result.explanation,
                    ),
                )

            # Send full response as single token event (no streaming needed for blocked)
            yield sse("token", {"text": input_result.modified_response})

            journey = await get_journey(session_id)
            yield sse("journey", {"entries": journey})
            yield sse("audit", {"events": audit.to_dicts()})
            yield sse("done", {"response": input_result.modified_response})
            return

        # ── RAG Retrieval ──
        audit.start_timer("rag")
        guidelines = retrieve_guidelines(message, n_results=3)
        guidelines_text = format_guidelines_for_prompt(guidelines)
        audit.log(
            "rag_retrieval",
            f"Retrieved {len(guidelines)} guidelines",
            timer_key="rag",
        )
        yield sse("rag", {"guidelines": [g.model_dump() for g in guidelines]})

        # ── Build context ──
        history = await get_messages(session_id, limit=10)
        messages_list = [{"role": m["role"], "content": m["content"]} for m in history]
        messages_list.append({"role": "user", "content": message})

        system_prompt = MAVEN_SYSTEM_PROMPT
        if guidelines_text:
            system_prompt += "\n\n" + RAG_CONTEXT_TEMPLATE.format(guidelines=guidelines_text)

        # Send context assembly info for RAG visualizer
        system_token_est = len(system_prompt.split()) * 1.3
        context_token_est = len(guidelines_text.split()) * 1.3 if guidelines_text else 0
        yield sse("rag_context", {
            "system_prompt_tokens": int(system_token_est),
            "context_tokens": int(context_token_est),
            "query_tokens": int(len(message.split()) * 1.3),
            "total_context_tokens": int(system_token_est + context_token_est + len(message.split()) * 1.3),
            "max_tokens": 1024,
            "guidelines_in_prompt": len(guidelines),
        })

        # ── Streaming LLM Call with Extended Thinking ──
        audit.start_timer("llm")
        full_response = ""
        thinking_text = ""

        in_thinking = False

        async with client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=16000,
            thinking={
                "type": "enabled",
                "budget_tokens": 5000,
            },
            system=system_prompt,
            messages=messages_list,
        ) as stream:
            async for event in stream:
                if event.type == "content_block_start":
                    block_type = getattr(event.content_block, "type", None)
                    if block_type == "thinking":
                        in_thinking = True
                        yield sse("thinking_start", {})
                    elif block_type == "text":
                        if in_thinking:
                            in_thinking = False
                            yield sse("thinking_complete", {"text": thinking_text})
                elif event.type == "content_block_delta":
                    delta_type = getattr(event.delta, "type", None)
                    if delta_type == "thinking_delta":
                        chunk = getattr(event.delta, "thinking", "")
                        thinking_text += chunk
                        yield sse("thinking", {"text": chunk})
                    elif delta_type == "text_delta":
                        chunk = getattr(event.delta, "text", "")
                        full_response += chunk
                        yield sse("token", {"text": chunk})

        audit.log(
            "llm_call",
            f"Generated {len(full_response)} chars + {len(thinking_text)} thinking chars",
            timer_key="llm",
        )

        # ── Output Rails ──
        audit.start_timer("output_rails")
        output_result = run_output_rails(full_response)
        audit.log(
            "output_rail",
            f"Risk: {output_result.risk_level.value} | {output_result.rails_triggered or 'none'}",
            risk_level=output_result.risk_level,
            timer_key="output_rails",
        )
        yield sse("output_rails", output_result.model_dump())

        final_response = output_result.modified_response or full_response

        # If output rail modified the response, send the replacement
        if output_result.modified_response:
            yield sse("response_replaced", {
                "original": full_response,
                "replacement": output_result.modified_response,
            })

        # ── Pathway classification ──
        audit.start_timer("pathway")
        pathway = await _classify_pathway(message, client)
        await update_session_pathway(session_id, pathway)
        audit.log("pathway_classification", f"Pathway: {pathway.value}", timer_key="pathway")
        yield sse("pathway", {"care_pathway": pathway.value})

        # ── Session persistence ──
        await add_message(session_id, "user", message)
        await add_message(session_id, "assistant", final_response)

        action = "guidance"
        if output_result.risk_level == RiskLevel.BLOCKED:
            action = "referral"

        await add_journey_entry(
            session_id,
            JourneyEntry(
                timestamp=datetime.now(timezone.utc).isoformat(),
                summary=_summarize_interaction(message),
                care_pathway=pathway,
                action=action,
                details=f"Guidelines cited: {len(guidelines)}",
            ),
        )

        journey = await get_journey(session_id)
        yield sse("journey", {"entries": journey})

        # ── Eval (async, non-blocking for UX) ──
        audit.start_timer("eval")
        try:
            eval_scores = await evaluate_response(
                question=message,
                answer=final_response,
                retrieved_guidelines=guidelines,
                client=client,
            )
            audit.log(
                "eval",
                f"Faithfulness: {eval_scores['faithfulness']} | Relevance: {eval_scores['relevance']} | Safety: {eval_scores.get('safety', '?')}",
                timer_key="eval",
            )
            yield sse("eval", eval_scores)
        except Exception as e:
            audit.log("eval", f"Eval failed: {e}", timer_key="eval")
            yield sse("eval", {"faithfulness": -1, "relevance": -1, "reasoning": str(e)})

        yield sse("audit", {"events": audit.to_dicts()})
        yield sse("done", {"response": final_response})

    except Exception as e:
        yield sse("error", {"message": str(e)})


async def _classify_pathway(
    message: str, client: anthropic.AsyncAnthropic
) -> CarePathway:
    """Use a fast Claude call to classify the care pathway."""
    try:
        result = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=20,
            messages=[
                {"role": "user", "content": ROUTING_PROMPT.format(message=message)}
            ],
        )
        pathway_str = result.content[0].text.strip().lower()
        return CarePathway(pathway_str)
    except (ValueError, KeyError):
        return CarePathway.UNKNOWN


def _summarize_interaction(message: str) -> str:
    """Create a short summary of the user's question for the journey timeline."""
    if len(message) <= 80:
        return message
    return message[:77] + "..."
