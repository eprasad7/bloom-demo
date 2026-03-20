"""Provider recommendation engine.

Given patient context (symptoms, gestational age, conditions, care pathway),
recommends the most appropriate provider types and care actions.

Uses a rule-based scoring system with weighted factors. In production,
this would be a trained model on historical patient-provider match data.
"""

from dataclasses import dataclass


@dataclass
class ProviderType:
    title: str
    specialty: str
    reason: str
    urgency: str  # routine, soon, urgent, emergency
    score: float  # 0-1 relevance


# Provider catalog
PROVIDERS = {
    "obgyn": ProviderType("OB-GYN", "Obstetrics and Gynecology", "", "routine", 0),
    "midwife": ProviderType("Certified Nurse Midwife", "Midwifery", "", "routine", 0),
    "mfm": ProviderType("Maternal-Fetal Medicine Specialist", "High-Risk Pregnancy", "", "soon", 0),
    "lactation": ProviderType("Lactation Consultant", "Breastfeeding Support", "", "routine", 0),
    "mental_health": ProviderType("Perinatal Mental Health Specialist", "Psychology/Psychiatry", "", "soon", 0),
    "fertility": ProviderType("Reproductive Endocrinologist", "Fertility and IVF", "", "routine", 0),
    "nutritionist": ProviderType("Prenatal Nutritionist", "Maternal Nutrition", "", "routine", 0),
    "pelvic_floor": ProviderType("Pelvic Floor Physical Therapist", "Pelvic Health", "", "routine", 0),
    "pediatrician": ProviderType("Pediatrician", "Child Health (0-5)", "", "routine", 0),
    "menopause": ProviderType("Menopause Specialist", "Hormone Therapy and Midlife Health", "", "routine", 0),
    "er": ProviderType("Emergency Room", "Emergency Medicine", "", "emergency", 0),
    "genetic_counselor": ProviderType("Genetic Counselor", "Prenatal Genetics", "", "routine", 0),
    "endocrinologist": ProviderType("Endocrinologist", "Diabetes and Thyroid", "", "soon", 0),
    "dermatologist": ProviderType("Dermatologist", "Skin Health", "", "routine", 0),
}

# Symptom-to-provider routing rules with weights
SYMPTOM_RULES: list[tuple[list[str], str, float, str]] = [
    # (symptom keywords, provider key, weight, reason)
    # Emergency
    (["seizure", "unconscious", "not breathing"], "er", 1.0, "Immediate emergency evaluation needed"),
    (["heavy bleeding", "hemorrhage", "soaking pad"], "er", 1.0, "Possible hemorrhage requires emergency care"),
    (["severe headache", "vision changes", "blurred vision"], "mfm", 0.9, "Symptoms may indicate preeclampsia"),
    (["chest pain", "shortness of breath"], "er", 1.0, "Cardiac/pulmonary emergency evaluation"),
    (["suicidal", "harm myself", "end it"], "mental_health", 1.0, "Immediate crisis mental health support"),

    # High-risk pregnancy
    (["preeclampsia", "high blood pressure", "hypertension"], "mfm", 0.9, "High-risk pregnancy management"),
    (["gestational diabetes", "blood sugar"], "endocrinologist", 0.8, "Diabetes management during pregnancy"),
    (["gestational diabetes"], "nutritionist", 0.7, "Dietary management for blood sugar control"),
    (["preterm", "premature", "contractions early"], "mfm", 0.9, "Preterm labor risk assessment"),
    (["placenta previa", "placental"], "mfm", 0.9, "Placental complication management"),

    # Standard pregnancy
    (["pregnant", "pregnancy", "prenatal", "trimester"], "obgyn", 0.7, "Routine prenatal care"),
    (["pregnant", "pregnancy"], "midwife", 0.5, "Holistic pregnancy support"),
    (["morning sickness", "nausea", "vomiting"], "obgyn", 0.7, "Pregnancy symptom management"),
    (["morning sickness", "nausea"], "nutritionist", 0.5, "Dietary strategies for nausea relief"),
    (["genetic screening", "nipt", "nuchal"], "genetic_counselor", 0.8, "Genetic screening guidance"),
    (["back pain", "pelvic pain", "round ligament"], "pelvic_floor", 0.6, "Musculoskeletal pregnancy support"),

    # Postpartum
    (["postpartum", "after birth", "after delivery"], "obgyn", 0.7, "Postpartum recovery care"),
    (["postpartum depression", "ppd", "crying", "sad after birth"], "mental_health", 0.9, "Postpartum mood disorder screening and treatment"),
    (["breastfeeding", "lactation", "latch", "nursing"], "lactation", 0.9, "Breastfeeding technique and support"),
    (["mastitis", "breast infection"], "obgyn", 0.8, "Breast infection treatment"),
    (["pelvic floor", "incontinence", "bladder"], "pelvic_floor", 0.8, "Postpartum pelvic floor rehabilitation"),

    # Fertility
    (["infertility", "trying to conceive", "ttc", "can't get pregnant"], "fertility", 0.9, "Fertility evaluation and treatment options"),
    (["ivf", "in vitro", "egg freezing"], "fertility", 0.9, "Assisted reproduction consultation"),
    (["pcos", "polycystic"], "fertility", 0.7, "PCOS fertility impact assessment"),
    (["pcos", "polycystic"], "endocrinologist", 0.6, "Hormonal evaluation for PCOS"),
    (["irregular period", "missed period", "amenorrhea"], "obgyn", 0.7, "Menstrual irregularity evaluation"),

    # Menopause
    (["menopause", "perimenopause", "hot flash", "night sweat"], "menopause", 0.9, "Menopause symptom management"),
    (["hormone replacement", "hrt", "estrogen"], "menopause", 0.8, "Hormone therapy consultation"),
    (["bone density", "osteoporosis"], "menopause", 0.7, "Bone health assessment"),

    # Pediatrics
    (["baby", "newborn", "infant", "child", "toddler"], "pediatrician", 0.8, "Child health and development"),
    (["vaccination", "vaccine", "immunization"], "pediatrician", 0.7, "Childhood immunization schedule"),

    # Mental health
    (["anxiety", "anxious", "panic", "worried"], "mental_health", 0.7, "Anxiety management during pregnancy/postpartum"),
    (["depression", "depressed", "mood"], "mental_health", 0.8, "Mood disorder screening and support"),
    (["insomnia", "can't sleep", "sleep problem"], "mental_health", 0.5, "Sleep disturbance assessment"),

    # General
    (["weight gain", "nutrition", "diet", "vitamin"], "nutritionist", 0.6, "Nutritional guidance"),
    (["acne", "skin"], "dermatologist", 0.5, "Dermatological evaluation"),
    (["thyroid"], "endocrinologist", 0.8, "Thyroid function management"),
]

# Care pathway boosts
PATHWAY_BOOSTS: dict[str, dict[str, float]] = {
    "maternity": {"obgyn": 0.3, "midwife": 0.2, "mfm": 0.1, "nutritionist": 0.1},
    "fertility": {"fertility": 0.3, "endocrinologist": 0.1},
    "postpartum": {"obgyn": 0.2, "lactation": 0.2, "mental_health": 0.2, "pelvic_floor": 0.1},
    "menopause": {"menopause": 0.3, "obgyn": 0.1},
    "pediatrics": {"pediatrician": 0.3},
    "general_womens_health": {"obgyn": 0.2},
}


def recommend_providers(
    symptoms: list[str],
    conditions: list[str],
    care_pathway: str,
    gestational_age: str | None = None,
    max_results: int = 3,
) -> list[dict]:
    """Recommend providers based on patient context.

    Returns list of {title, specialty, reason, urgency, score} dicts,
    sorted by relevance score.
    """
    scores: dict[str, dict] = {}

    # Build search text from all patient context
    search_terms = [s.lower() for s in symptoms + conditions]
    if gestational_age:
        search_terms.append(gestational_age.lower())

    # Score each rule
    for keywords, provider_key, weight, reason in SYMPTOM_RULES:
        matched = any(
            any(kw in term for kw in keywords)
            for term in search_terms
        )
        if matched:
            if provider_key not in scores or weight > scores[provider_key].get("score", 0):
                provider = PROVIDERS[provider_key]
                scores[provider_key] = {
                    "title": provider.title,
                    "specialty": provider.specialty,
                    "reason": reason,
                    "urgency": provider.urgency if weight >= 0.9 else "routine",
                    "score": weight,
                    "key": provider_key,
                }

    # Apply pathway boosts
    boosts = PATHWAY_BOOSTS.get(care_pathway, {})
    for key, boost in boosts.items():
        if key in scores:
            scores[key]["score"] = min(1.0, scores[key]["score"] + boost)
        elif boost >= 0.2:
            provider = PROVIDERS[key]
            scores[key] = {
                "title": provider.title,
                "specialty": provider.specialty,
                "reason": f"Recommended for {care_pathway.replace('_', ' ')} care",
                "urgency": "routine",
                "score": boost,
                "key": key,
            }

    # If no matches, recommend based on pathway
    if not scores and care_pathway in PATHWAY_BOOSTS:
        for key, boost in PATHWAY_BOOSTS[care_pathway].items():
            provider = PROVIDERS[key]
            scores[key] = {
                "title": provider.title,
                "specialty": provider.specialty,
                "reason": f"General {care_pathway.replace('_', ' ')} care",
                "urgency": "routine",
                "score": boost,
                "key": key,
            }

    # Sort by score, take top N
    results = sorted(scores.values(), key=lambda x: x["score"], reverse=True)[:max_results]

    # Remove internal key
    for r in results:
        r.pop("key", None)
        r["score"] = round(r["score"], 2)

    return results
