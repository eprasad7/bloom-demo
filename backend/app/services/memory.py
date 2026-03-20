"""Episodic memory extraction from conversation.

Extracts structured clinical facts from user messages and maintains
a running patient context that accumulates across the session.
"""

import re


# Pattern-based entity extraction for clinical context
EXTRACTORS: list[tuple[str, str, str]] = [
    # (regex pattern, memory_type, label_template)
    # Pregnancy
    (r"(\d{1,2})\s*weeks?\s*pregnant", "gestational_age", "{0} weeks pregnant"),
    (r"(\d{1,2})\s*weeks?\s*gestation", "gestational_age", "{0} weeks gestation"),
    (r"(first|second|third|1st|2nd|3rd)\s*trimester", "trimester", "{0} trimester"),
    (r"due\s*(date|in)\s*([\w\s]+)", "due_date", "Due {1}"),
    (r"(\d{1,2})\s*months?\s*pregnant", "gestational_age_months", "{0} months pregnant"),
    (r"(pregnant|expecting|pregnancy)", "pregnancy_status", "Currently pregnant"),

    # Demographics
    (r"i'?m\s*(\d{2,3})\s*(?:years?\s*old|yo|y\.?o\.?)", "age", "Age: {0}"),
    (r"age\s*(?:is\s*)?(\d{2,3})", "age", "Age: {0}"),
    (r"(first\s*(?:time\s*)?(?:mom|mother|pregnancy|baby|child))", "parity", "First pregnancy"),
    (r"(\d+)\s*(?:kids?|children|babies)", "parity", "{0} existing children"),

    # Symptoms
    (r"(headache|headaches|migraine)", "symptom", "Headache"),
    (r"(nausea|nauseous|morning sickness|vomiting)", "symptom", "Nausea/morning sickness"),
    (r"(bleeding|spotting)", "symptom", "Bleeding/spotting"),
    (r"(swollen|swelling|edema)\s*(feet|ankles|hands|face|legs)?", "symptom", "Swelling {1}"),
    (r"(blurred?\s*vision|vision\s*changes|seeing\s*spots)", "symptom", "Vision changes"),
    (r"(fatigue|tired|exhausted)", "symptom", "Fatigue"),
    (r"(cramping|cramps)", "symptom", "Cramping"),
    (r"(back\s*pain|backache)", "symptom", "Back pain"),
    (r"(insomnia|can'?t\s*sleep)", "symptom", "Insomnia"),
    (r"(anxiety|anxious|worried)", "symptom", "Anxiety"),
    (r"(depression|depressed|sad|crying)", "symptom", "Depression symptoms"),
    (r"(hot\s*flash|night\s*sweat)", "symptom", "Hot flashes/night sweats"),
    (r"(irregular\s*period|missed\s*period)", "symptom", "Irregular periods"),
    (r"(weight\s*gain)", "symptom", "Weight gain"),
    (r"(acne)", "symptom", "Acne"),
    (r"(breast\s*(?:tender|pain|sore))", "symptom", "Breast tenderness"),

    # Conditions
    (r"(gestational\s*diabetes|gdm)", "condition", "Gestational diabetes"),
    (r"(preeclampsia|pre-eclampsia)", "condition", "Preeclampsia concern"),
    (r"(pcos|polycystic)", "condition", "PCOS"),
    (r"(endometriosis)", "condition", "Endometriosis"),
    (r"(thyroid)", "condition", "Thyroid condition"),
    (r"(diabetes|diabetic)", "condition", "Diabetes"),
    (r"(high\s*blood\s*pressure|hypertension)", "condition", "Hypertension"),

    # Medications/supplements
    (r"(iron\s*supplement|iron\s*pill|prenatal\s*vitamin)", "medication", "Iron/prenatal supplements"),
    (r"(folic\s*acid)", "medication", "Folic acid"),
    (r"(progesterone)", "medication", "Progesterone"),

    # Care context
    (r"(trying\s*to\s*conceive|ttc|trying\s*to\s*get\s*pregnant)", "care_goal", "Trying to conceive"),
    (r"(ivf|in\s*vitro)", "care_goal", "IVF treatment"),
    (r"(breastfeeding|nursing|lactating)", "care_context", "Breastfeeding"),
    (r"(postpartum|after\s*(?:birth|delivery))", "care_context", "Postpartum"),
    (r"(menopause|menopausal|perimenopause)", "care_context", "Menopause"),
]


def extract_memories(message: str) -> list[dict]:
    """Extract structured clinical facts from a user message.

    Returns list of {type, label, value, confidence} dicts.
    """
    message_lower = message.lower()
    memories: list[dict] = []
    seen_types: dict[str, str] = {}  # type -> label (dedupe within same message)

    for pattern, mem_type, label_template in EXTRACTORS:
        match = re.search(pattern, message_lower)
        if match:
            groups = match.groups()
            try:
                label = label_template.format(*groups).strip()
            except (IndexError, KeyError):
                label = label_template

            # Clean up label
            label = re.sub(r"\s+", " ", label).strip()
            if not label or label == mem_type:
                continue

            # Dedupe: keep first match per type, but allow multiple symptoms
            key = f"{mem_type}:{label}" if mem_type == "symptom" else mem_type
            if key not in seen_types:
                seen_types[key] = label
                memories.append({
                    "type": mem_type,
                    "label": label,
                    "value": match.group(0),
                    "source": "user_message",
                })

    return memories


class PatientContext:
    """Accumulates patient context across a session."""

    def __init__(self) -> None:
        self.facts: dict[str, dict] = {}  # key -> memory dict
        self.symptoms: list[dict] = []
        self.all_memories: list[dict] = []  # chronological list

    def update(self, message: str) -> list[dict]:
        """Extract memories from a message and merge into context.

        Returns newly extracted memories.
        """
        new_memories = extract_memories(message)

        for mem in new_memories:
            if mem["type"] == "symptom":
                # Allow multiple symptoms
                key = f"symptom:{mem['label']}"
                if key not in self.facts:
                    self.facts[key] = mem
                    self.symptoms.append(mem)
                    self.all_memories.append(mem)
            else:
                # Overwrite previous value for same type
                key = mem["type"]
                self.facts[key] = mem
                self.all_memories.append(mem)

        return new_memories

    def to_summary(self) -> dict:
        """Get current patient context as a structured summary."""
        return {
            "demographics": {
                k: v["label"] for k, v in self.facts.items()
                if v["type"] in ("age", "parity")
            },
            "pregnancy": {
                k: v["label"] for k, v in self.facts.items()
                if v["type"] in ("gestational_age", "gestational_age_months", "trimester", "due_date", "pregnancy_status")
            },
            "symptoms": [s["label"] for s in self.symptoms],
            "conditions": [
                v["label"] for k, v in self.facts.items() if v["type"] == "condition"
            ],
            "medications": [
                v["label"] for k, v in self.facts.items() if v["type"] == "medication"
            ],
            "care_context": {
                k: v["label"] for k, v in self.facts.items()
                if v["type"] in ("care_goal", "care_context")
            },
            "total_facts": len(self.facts),
        }
