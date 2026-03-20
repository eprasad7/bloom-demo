"""MedlinePlus data fetcher — pulls health topic summaries via their web services API.

MedlinePlus provides a public XML web service for health topics.
All content is public domain (NIH/NLM).
"""

import re
import xml.etree.ElementTree as ET

import httpx

# MedlinePlus Web Service endpoint
MEDLINEPLUS_URL = "https://wsearch.nlm.nih.gov/ws/query"

# Women's health search queries
HEALTH_TOPICS = [
    "pregnancy prenatal care",
    "preeclampsia toxemia",
    "gestational diabetes",
    "morning sickness hyperemesis",
    "miscarriage pregnancy loss",
    "ectopic pregnancy",
    "postpartum depression",
    "breastfeeding problems",
    "infertility women",
    "polycystic ovary syndrome PCOS",
    "endometriosis",
    "menopause hot flashes",
    "cervical cancer screening",
    "ovarian cysts",
    "uterine fibroids",
    "pelvic floor disorders",
    "contraception birth control",
    "prenatal testing",
    "labor delivery childbirth",
    "cesarean section",
    "high risk pregnancy",
    "placenta previa",
    "group B strep pregnancy",
    "Rh incompatibility pregnancy",
    "mastitis breast infection",
]


def search_medlineplus(query: str, max_results: int = 3) -> list[dict]:
    """Search MedlinePlus for health topics and extract summaries."""
    params = {
        "db": "healthTopics",
        "term": query,
        "retmax": max_results,
    }

    try:
        resp = httpx.get(MEDLINEPLUS_URL, params=params, timeout=30)
        resp.raise_for_status()
    except Exception:
        return []

    results = []
    try:
        root = ET.fromstring(resp.text)

        for doc in root.findall(".//document"):
            title = ""
            snippet = ""
            url = doc.get("url", "")

            for content in doc.findall("content"):
                name = content.get("name", "")
                text = "".join(content.itertext()).strip()

                if name == "title":
                    title = text
                elif name == "FullSummary":
                    snippet = text
                elif name == "snippet" and not snippet:
                    snippet = text

            if title and snippet:
                # Clean HTML tags from snippet
                clean_text = _strip_html(snippet)
                if len(clean_text) > 100:  # Only include substantial content
                    results.append({
                        "title": title,
                        "content": clean_text,
                        "url": url,
                    })

    except ET.ParseError:
        pass

    return results


def _strip_html(text: str) -> str:
    """Remove HTML tags from text."""
    import re
    clean = re.sub(r"<[^>]+>", "", text)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def fetch_all_topics() -> list[dict]:
    """Fetch health topic summaries for all women's health queries."""
    all_topics: list[dict] = []
    seen_titles: set[str] = set()

    for query in HEALTH_TOPICS:
        print(f"  MedlinePlus: searching '{query}'...")
        try:
            topics = search_medlineplus(query, max_results=2)
            for topic in topics:
                if topic["title"] not in seen_titles:
                    seen_titles.add(topic["title"])
                    all_topics.append(topic)
        except Exception as e:
            print(f"  MedlinePlus: error on '{query}': {e}")
            continue

    print(f"  MedlinePlus: fetched {len(all_topics)} unique topics")
    return all_topics


def topics_to_documents(topics: list[dict]) -> tuple[list[str], list[dict], list[str]]:
    """Convert MedlinePlus topics to documents for ChromaDB ingestion."""
    documents = []
    metadatas = []
    ids = []

    for topic in topics:
        clean_title = _strip_html(topic["title"])
        doc_text = f"{clean_title}\n\n{topic['content']}"
        documents.append(doc_text)
        metadatas.append({
            "source": f"MedlinePlus: {clean_title}",
            "topic": "general_womens_health",
            "url": topic.get("url", ""),
            "data_source": "medlineplus",
        })
        clean_title = _strip_html(topic["title"])
        safe_id = re.sub(r"[^a-z0-9]+", "-", clean_title.lower()).strip("-")[:50]
        # Ensure uniqueness
        base_id = f"medlineplus-{safe_id}"
        final_id = base_id
        counter = 1
        while final_id in ids:
            final_id = f"{base_id}-{counter}"
            counter += 1
        ids.append(final_id)

    return documents, metadatas, ids
