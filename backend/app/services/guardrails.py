"""Clinical safety guardrails — mirrors NeMo Guardrails architecture.

Three rail types:
  1. Input Rails  — classify/filter user messages BEFORE LLM
  2. Output Rails — validate LLM responses BEFORE returning to user
  3. Dialogue Rail — system prompt constraining LLM behavior (see prompts.py)
"""

import re

from app.models import GuardrailResult, RiskLevel


# ── Emergency patterns (life-threatening situations) ──

EMERGENCY_PATTERNS: list[tuple[str, str]] = [
    (
        r"(severe\s+headache|blurred?\s+vision|seeing\s+spots).*pregnan",
        "Possible preeclampsia symptoms",
    ),
    (
        r"pregnan.*(severe\s+headache|blurred?\s+vision|seeing\s+spots)",
        "Possible preeclampsia symptoms",
    ),
    (
        r"(heavy\s+bleeding|hemorrhag|soaking\s+(through\s+)?.*pad)",
        "Possible hemorrhage",
    ),
    (
        r"(can'?t\s+(breathe|stop\s+crying)|want\s+to\s+(die|hurt\s+myself|harm\s+myself|end\s+it))",
        "Mental health crisis",
    ),
    (
        r"(chest\s+pain|seizure|faint(ed|ing)|unconscious|not\s+(moving|breathing))",
        "Medical emergency",
    ),
    (
        r"(fever.*(10[2-9]|1[1-9]\d)\s*°?\s*(f|deg))",
        "High fever — urgent",
    ),
    (
        r"(swollen.*(face|hands).*pregnan|pregnan.*swollen.*(face|hands))",
        "Possible preeclampsia symptoms",
    ),
]

# ── Off-topic indicators ──

OFF_TOPIC_INDICATORS: list[str] = [
    "stock market", "cryptocurrency", "bitcoin", "election",
    "sports score", "recipe for", "how to hack", "write me code",
    "political opinion", "investment advice", "real estate",
]

# ── Jailbreak patterns ──

JAILBREAK_PATTERNS: list[str] = [
    r"ignore\s+(previous|all|your)\s+(instructions|rules|prompt)",
    r"you\s+are\s+now\s+(a|an)\s+",
    r"pretend\s+(you|to\s+be)",
    r"DAN\s+mode",
    r"system\s*prompt",
    r"act\s+as\s+(a|an)\s+(?!maven|health)",
    r"bypass\s+(your|the)\s+(safety|guard|filter)",
]

# ── Diagnosis phrases (output rail) ──

DIAGNOSIS_PHRASES: list[str] = [
    "you are diagnosed",
    "you're suffering from",
    "this means you have",
    "based on your symptoms, it's",
    "you most likely have",
    "i can confirm you have",
    "the diagnosis is",
    "you clearly have",
    "you definitely have",
    "i believe you have",
]

# ── Unsafe medication phrases (output rail) ──

UNSAFE_MED_PHRASES: list[str] = [
    "you should stop taking", "discontinue your",
    "i recommend taking", "take \\d+ ?mg",
    "switch from", "you don't need",
    "stop your medication", "increase your dose",
    "decrease your dose",
]

# ── Disclaimer indicators ──

DISCLAIMER_PHRASES: list[str] = [
    "consult", "healthcare provider", "talk to your doctor",
    "speak with your provider", "medical professional",
    "not a substitute", "personalized guidance",
    "your provider", "your doctor", "healthcare team",
]


def run_input_rails(user_message: str) -> GuardrailResult:
    """Classify user input BEFORE it reaches the LLM.

    Checks (in order):
      1. Emergency detection → immediate escalation
      2. Off-topic detection → scope redirect
      3. Jailbreak detection → deflection
    """
    message_lower = user_message.lower()

    # ── Rail 1: Emergency detection ──
    for pattern, label in EMERGENCY_PATTERNS:
        if re.search(pattern, message_lower):
            return GuardrailResult(
                risk_level=RiskLevel.EMERGENCY,
                rails_triggered=[f"emergency:{label}"],
                escalation_required=True,
                modified_response=(
                    f"⚠️ **URGENT: {label}**\n\n"
                    "If you or someone nearby is experiencing a medical emergency, "
                    "**please call 911 immediately** or go to your nearest emergency room. "
                    "Do not wait. This could be life-threatening.\n\n"
                    "If you are a Bloom member, you can also reach our on-call "
                    "clinical team for immediate support."
                ),
                explanation=f"Emergency pattern matched: {label}",
            )

    # ── Rail 2: Off-topic detection ──
    off_topic_triggered = []
    for indicator in OFF_TOPIC_INDICATORS:
        if indicator in message_lower:
            off_topic_triggered.append(f"off_topic:{indicator}")

    if off_topic_triggered:
        return GuardrailResult(
            risk_level=RiskLevel.BLOCKED,
            rails_triggered=off_topic_triggered,
            modified_response=(
                "I'm Bloom's health assistant, specializing in women's "
                "and family health. I can't help with that topic, but I can "
                "help with questions about **fertility, pregnancy, postpartum "
                "care, pediatrics, or menopause**. What can I help you with?"
            ),
            explanation="Message outside clinical scope",
        )

    # ── Rail 3: Jailbreak detection ──
    jailbreak_triggered = []
    for pattern in JAILBREAK_PATTERNS:
        if re.search(pattern, message_lower):
            jailbreak_triggered.append("jailbreak_attempt")
            break

    if jailbreak_triggered:
        return GuardrailResult(
            risk_level=RiskLevel.BLOCKED,
            rails_triggered=jailbreak_triggered,
            modified_response=(
                "I'm here to help with your health questions. "
                "Could you rephrase what you'd like to know? "
                "I specialize in women's and family health topics."
            ),
            explanation="Prompt injection attempt detected",
        )

    # ── All clear ──
    return GuardrailResult(risk_level=RiskLevel.SAFE)


def run_output_rails(llm_response: str) -> GuardrailResult:
    """Validate LLM output BEFORE returning to user.

    Checks:
      1. Diagnosis detection → block and redirect
      2. Medication safety → block and redirect
      3. Missing disclaimer → append one
    """
    response_lower = llm_response.lower()
    triggered: list[str] = []

    # ── Rail 1: Diagnosis detection ──
    for phrase in DIAGNOSIS_PHRASES:
        if phrase in response_lower:
            triggered.append(f"diagnosis_detected:{phrase}")

    # ── Rail 2: Medication safety ──
    for phrase in UNSAFE_MED_PHRASES:
        if re.search(phrase, response_lower):
            triggered.append(f"unsafe_medication:{phrase}")

    # If diagnosis or medication rail fired → block entirely
    if any("diagnosis" in t or "medication" in t for t in triggered):
        return GuardrailResult(
            risk_level=RiskLevel.BLOCKED,
            rails_triggered=triggered,
            modified_response=(
                "I can share some general information about this topic, "
                "but for anything specific to your situation, especially "
                "regarding diagnoses or medications, please reach out to "
                "your provider who can review your full medical history.\n\n"
                "Would you like me to help you connect with a provider?"
            ),
            explanation="Output contained diagnosis or medication recommendation",
        )

    # ── Rail 3: Missing disclaimer ──
    has_disclaimer = any(phrase in response_lower for phrase in DISCLAIMER_PHRASES)
    if not has_disclaimer:
        triggered.append("missing_disclaimer")
        return GuardrailResult(
            risk_level=RiskLevel.CAUTION,
            rails_triggered=triggered,
            modified_response=(
                llm_response
                + "\n\n*Please remember: this information is for educational "
                "purposes only and is not a substitute for professional medical "
                "advice. Please consult your healthcare provider for "
                "personalized guidance.*"
            ),
            explanation="Disclaimer appended to response",
        )

    # ── All clear ──
    return GuardrailResult(risk_level=RiskLevel.SAFE)
