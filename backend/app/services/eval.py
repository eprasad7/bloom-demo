"""Evaluation service — LLM-as-judge for faithfulness and relevance scoring.

Uses Claude Haiku for fast, cheap evaluation of each response.
Runs async so it doesn't block the response stream.
"""

import anthropic

from app.models import RetrievedGuideline


async def evaluate_response(
    question: str,
    answer: str,
    retrieved_guidelines: list[RetrievedGuideline],
    client: anthropic.AsyncAnthropic,
) -> dict:
    """Score a response on faithfulness and relevance using Claude Haiku.

    Returns:
        {
            "faithfulness": float 0-1,
            "relevance": float 0-1,
            "reasoning": str,
        }
    """
    context_text = "\n\n".join(
        f"[Source: {g.source}]\n{g.content}" for g in retrieved_guidelines
    )

    if not context_text:
        return {
            "faithfulness": 0.0,
            "relevance": 0.0,
            "reasoning": "No context retrieved. Cannot evaluate faithfulness.",
        }

    prompt = f"""You are an evaluation judge for a healthcare AI assistant. Score the answer on two dimensions.

## Retrieved Context
{context_text}

## User Question
{question}

## AI Answer
{answer}

## Scoring Instructions

1. **Faithfulness** (0.0 to 1.0): Does the answer ONLY contain claims supported by the retrieved context?
   - 1.0 = every claim is supported by the context
   - 0.5 = some claims are supported, some are general medical knowledge not in context
   - 0.0 = answer contains claims contradicting the context or significant hallucinations

2. **Relevance** (0.0 to 1.0): Does the answer actually address the user's question?
   - 1.0 = directly and completely addresses the question
   - 0.5 = partially addresses or is tangentially related
   - 0.0 = does not address the question at all

Respond in EXACTLY this format (no other text):
FAITHFULNESS: <score>
RELEVANCE: <score>
REASONING: <one sentence explaining scores>"""

    try:
        result = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        text = result.content[0].text.strip()

        faithfulness = _parse_score(text, "FAITHFULNESS")
        relevance = _parse_score(text, "RELEVANCE")
        reasoning = _parse_field(text, "REASONING")

        return {
            "faithfulness": faithfulness,
            "relevance": relevance,
            "reasoning": reasoning,
        }
    except Exception as e:
        return {
            "faithfulness": -1.0,
            "relevance": -1.0,
            "reasoning": f"Eval failed: {str(e)}",
        }


def _parse_score(text: str, field: str) -> float:
    """Extract a numeric score from 'FIELD: 0.85' format."""
    for line in text.split("\n"):
        if line.strip().upper().startswith(field.upper() + ":"):
            val = line.split(":", 1)[1].strip()
            try:
                return max(0.0, min(1.0, float(val)))
            except ValueError:
                return -1.0
    return -1.0


def _parse_field(text: str, field: str) -> str:
    """Extract text value from 'FIELD: some text' format."""
    for line in text.split("\n"):
        if line.strip().upper().startswith(field.upper() + ":"):
            return line.split(":", 1)[1].strip()
    return ""


# ── Batch eval test cases ──

EVAL_TEST_CASES: list[dict] = [
    {
        "question": "What are the warning signs of preeclampsia?",
        "expected_source": "ACOG Practice Bulletin #222",
        "reference": "Severe headaches, visual changes, upper abdominal pain, sudden swelling of face/hands, shortness of breath, blood pressure ≥140/90.",
    },
    {
        "question": "How often should I have prenatal visits?",
        "expected_source": "ACOG Committee Opinion #762",
        "reference": "Every 4 weeks from weeks 4-28, every 2 weeks from 28-36, weekly from 36 until delivery.",
    },
    {
        "question": "When should I be screened for gestational diabetes?",
        "expected_source": "ACOG Practice Bulletin #190",
        "reference": "All pregnant women should be screened at 24-28 weeks. Early screening at first visit for high-risk women.",
    },
    {
        "question": "What vaccines are recommended during pregnancy?",
        "expected_source": "CDC Immunization Schedule",
        "reference": "Tdap at 27-36 weeks each pregnancy, inactivated influenza during flu season, COVID-19 vaccine recommended.",
    },
    {
        "question": "How long should I exclusively breastfeed?",
        "expected_source": "WHO Infant and Young Child Feeding",
        "reference": "Exclusive breastfeeding for first 6 months, continue with complementary foods up to 2 years or beyond.",
    },
    {
        "question": "What are the symptoms of postpartum depression?",
        "expected_source": "WHO Maternal Mental Health",
        "reference": "Screen using EPDS (cutoff ≥13) or PHQ-9 (cutoff ≥10). Affects 10-15% of women. Risk factors include history of depression, lack of social support.",
    },
    {
        "question": "When is infertility diagnosed?",
        "expected_source": "ACOG Practice Bulletin #781",
        "reference": "After 12 months of regular unprotected intercourse (6 months if woman is over 35).",
    },
    {
        "question": "Is exercise safe during pregnancy?",
        "expected_source": "ACOG Committee Opinion #804",
        "reference": "Yes, at least 150 minutes of moderate-intensity aerobic activity per week. Safe activities include walking, swimming, stationary cycling.",
    },
    {
        "question": "What is the recommended daily folic acid dose during pregnancy?",
        "expected_source": "WHO Guideline on Nutritional Interventions",
        "reference": "400mcg daily (5mg if high-risk for neural tube defects).",
    },
    {
        "question": "When should GBS screening be done?",
        "expected_source": "ACOG Committee Opinion #797",
        "reference": "Universal GBS screening at 36-37 weeks via vaginal-rectal swab culture.",
    },
    {
        "question": "What are the options for menopause symptom management?",
        "expected_source": "ACOG Practice Bulletin #141",
        "reference": "HRT is most effective for vasomotor symptoms within 10 years of menopause onset. Non-hormonal alternatives include SSRIs/SNRIs, gabapentin, CBT.",
    },
    {
        "question": "What are the most effective contraceptive methods?",
        "expected_source": "CDC US Medical Eligibility Criteria",
        "reference": "LARCs (IUDs and implants) are recommended first-line. Implant 0.05% failure, hormonal IUD 0.2%, copper IUD 0.8%.",
    },
    {
        "question": "What postpartum care visits are recommended?",
        "expected_source": "WHO Recommendations on Postnatal Care",
        "reference": "Within 24 hours of birth, day 3, days 7-14, and 6 weeks postpartum.",
    },
    {
        "question": "What genetic screening is available in the first trimester?",
        "expected_source": "CDC Prenatal Screening Guidelines",
        "reference": "Nuchal translucency + blood markers (10-13 weeks, 82-87% detection). cfDNA/NIPT from 10 weeks with >99% detection for Down syndrome.",
    },
    {
        "question": "How much caffeine is safe during pregnancy?",
        "expected_source": "WHO Guideline on Nutritional Interventions",
        "reference": "Less than 300mg per day (approximately 2-3 cups of coffee).",
    },
]


async def run_batch_eval(
    client: anthropic.AsyncAnthropic,
    chat_fn,
) -> list[dict]:
    """Run all test cases through the pipeline and evaluate results.

    Args:
        client: Anthropic client
        chat_fn: async function(message, session_id, client) -> ChatResponse

    Returns list of eval results with scores.
    """
    results = []

    for i, case in enumerate(EVAL_TEST_CASES):
        try:
            # Run through pipeline
            response = await chat_fn(
                message=case["question"],
                session_id=None,
                client=client,
            )

            # Check retrieval hit
            retrieval_hit = any(
                case["expected_source"].lower() in g.source.lower()
                for g in response.guidelines_cited
            )

            # Run LLM judge
            eval_scores = await evaluate_response(
                question=case["question"],
                answer=response.response,
                retrieved_guidelines=response.guidelines_cited,
                client=client,
            )

            results.append({
                "index": i,
                "question": case["question"],
                "expected_source": case["expected_source"],
                "retrieval_hit": retrieval_hit,
                "top_sources": [g.source for g in response.guidelines_cited[:3]],
                "top_scores": [g.relevance_score for g in response.guidelines_cited[:3]],
                "faithfulness": eval_scores["faithfulness"],
                "relevance": eval_scores["relevance"],
                "reasoning": eval_scores["reasoning"],
                "response_length": len(response.response),
                "care_pathway": response.care_pathway.value,
            })

        except Exception as e:
            results.append({
                "index": i,
                "question": case["question"],
                "error": str(e),
                "retrieval_hit": False,
                "faithfulness": -1.0,
                "relevance": -1.0,
            })

    return results
