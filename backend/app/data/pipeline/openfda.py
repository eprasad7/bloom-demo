"""OpenFDA data fetcher — pulls pregnancy/lactation drug label sections.

Uses the public OpenFDA API (no key required, rate limited to 240 req/min).
Fetches structured pregnancy and lactation warnings from drug labels.
"""

import httpx

OPENFDA_URL = "https://api.fda.gov/drug/label.json"

# Drug categories commonly relevant to women's health
DRUG_QUERIES = [
    "prenatal+vitamins",
    "iron+supplement+pregnancy",
    "folic+acid",
    "progesterone",
    "clomiphene",
    "letrozole+fertility",
    "metformin+pregnancy",
    "sertraline+pregnancy",
    "acetaminophen+pregnancy",
    "ibuprofen+pregnancy",
    "aspirin+preeclampsia",
    "ondansetron+pregnancy",  # nausea
    "levothyroxine+pregnancy",
    "insulin+gestational",
    "methyldopa+pregnancy",  # hypertension
]


def fetch_drug_labels(query: str, limit: int = 3) -> list[dict]:
    """Fetch drug labels from OpenFDA with pregnancy-related info."""
    params = {
        "search": f'"{query}"',
        "limit": limit,
    }

    try:
        resp = httpx.get(OPENFDA_URL, params=params, timeout=30)
        if resp.status_code != 200:
            return []

        data = resp.json()
        results = data.get("results", [])
    except Exception:
        return []

    labels = []
    for result in results:
        # Extract drug name
        brand_name = ""
        generic_name = ""
        openfda = result.get("openfda", {})
        if openfda.get("brand_name"):
            brand_name = openfda["brand_name"][0]
        if openfda.get("generic_name"):
            generic_name = openfda["generic_name"][0]

        drug_name = brand_name or generic_name or query

        # Extract pregnancy-relevant sections
        pregnancy_info = _extract_text(result, "pregnancy")
        lactation_info = _extract_text(result, "nursing_mothers")
        # Newer labels use structured pregnancy/lactation subsections
        if not pregnancy_info:
            pregnancy_info = _extract_text(result, "pregnancy_or_breast_feeding")
        labor_info = _extract_text(result, "labor_and_delivery")
        contraindications = _extract_text(result, "contraindications")
        warnings = _extract_text(result, "warnings_and_precautions")
        if not warnings:
            warnings = _extract_text(result, "warnings")

        # Only include if we have pregnancy-relevant content
        relevant_content = pregnancy_info or lactation_info or labor_info
        if not relevant_content:
            continue

        # Build a consolidated document
        sections = []
        if pregnancy_info:
            sections.append(f"PREGNANCY: {pregnancy_info}")
        if lactation_info:
            sections.append(f"LACTATION/NURSING: {lactation_info}")
        if labor_info:
            sections.append(f"LABOR AND DELIVERY: {labor_info}")
        if contraindications:
            # Truncate long contraindications to key pregnancy mentions
            contra_lower = contraindications.lower()
            if "pregnan" in contra_lower or "lactat" in contra_lower:
                sections.append(f"CONTRAINDICATIONS: {contraindications[:500]}")
        if warnings:
            warn_lower = warnings.lower()
            if "pregnan" in warn_lower or "fetal" in warn_lower:
                sections.append(f"WARNINGS: {warnings[:500]}")

        labels.append({
            "drug_name": drug_name,
            "generic_name": generic_name,
            "content": "\n\n".join(sections),
        })

    return labels


def _extract_text(result: dict, field: str) -> str:
    """Extract text from an OpenFDA label field (always returns list)."""
    value = result.get(field, [])
    if isinstance(value, list) and value:
        return value[0].strip()[:2000]  # Cap at 2000 chars
    return ""


def fetch_all_drug_labels() -> list[dict]:
    """Fetch pregnancy/lactation info for all drug queries."""
    all_labels: list[dict] = []
    seen_drugs: set[str] = set()

    for query in DRUG_QUERIES:
        print(f"  OpenFDA: searching '{query}'...")
        try:
            labels = fetch_drug_labels(query, limit=2)
            for label in labels:
                drug_key = label["generic_name"].lower() or label["drug_name"].lower()
                if drug_key not in seen_drugs:
                    seen_drugs.add(drug_key)
                    all_labels.append(label)
        except Exception as e:
            print(f"  OpenFDA: error on '{query}': {e}")
            continue

    print(f"  OpenFDA: fetched {len(all_labels)} drug labels")
    return all_labels


def labels_to_documents(labels: list[dict]) -> tuple[list[str], list[dict], list[str]]:
    """Convert OpenFDA labels to documents for ChromaDB ingestion."""
    documents = []
    metadatas = []
    ids = []

    for label in labels:
        drug = label["drug_name"]
        doc_text = f"Drug Safety in Pregnancy: {drug}\n\n{label['content']}"
        documents.append(doc_text)
        metadatas.append({
            "source": f"FDA Drug Label: {drug}",
            "topic": "medication_safety",
            "data_source": "openfda",
        })
        safe_id = drug.lower().replace(" ", "-").replace("/", "-")[:50]
        ids.append(f"fda-{safe_id}")

    return documents, metadatas, ids
