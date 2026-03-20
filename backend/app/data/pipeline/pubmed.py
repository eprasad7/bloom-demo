"""PubMed data fetcher — pulls article abstracts via NCBI E-utilities API.

Uses the public Entrez API (no key required for low-volume).
Rate limit: 3 requests/second without API key.
"""

import time
import xml.etree.ElementTree as ET

import httpx

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

# Targeted search queries for women's health topics
SEARCH_QUERIES = [
    ("prenatal care guidelines", "maternity"),
    ("preeclampsia screening prevention management", "maternity"),
    ("gestational diabetes mellitus management", "maternity"),
    ("postpartum depression screening treatment", "postpartum"),
    ("postpartum hemorrhage prevention", "postpartum"),
    ("breastfeeding lactation support guidelines", "postpartum"),
    ("infertility evaluation treatment female", "fertility"),
    ("IVF in vitro fertilization outcomes", "fertility"),
    ("ovarian reserve AMH fertility", "fertility"),
    ("menopause hormone replacement therapy", "menopause"),
    ("perimenopause vasomotor symptoms management", "menopause"),
    ("contraception methods effectiveness safety", "general_womens_health"),
    ("cervical cancer screening HPV guidelines", "general_womens_health"),
    ("prenatal genetic screening NIPT", "maternity"),
    ("pregnancy nutrition supplementation guidelines", "maternity"),
]


def search_pmids(query: str, max_results: int = 5) -> list[str]:
    """Search PubMed for article IDs matching a query."""
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "sort": "relevance",
        "retmode": "json",
    }
    resp = httpx.get(ESEARCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data.get("esearchresult", {}).get("idlist", [])


def fetch_articles(pmids: list[str]) -> list[dict]:
    """Fetch full article metadata for a list of PMIDs."""
    if not pmids:
        return []

    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
        "rettype": "abstract",
    }
    resp = httpx.get(EFETCH_URL, params=params, timeout=60)
    resp.raise_for_status()

    articles = []
    root = ET.fromstring(resp.text)

    for article_elem in root.findall(".//PubmedArticle"):
        try:
            medline = article_elem.find("MedlineCitation")
            if medline is None:
                continue

            pmid = medline.findtext("PMID", "")
            art = medline.find("Article")
            if art is None:
                continue

            title = art.findtext("ArticleTitle", "")

            # Extract abstract text (may have multiple sections)
            abstract_parts = []
            abstract_elem = art.find("Abstract")
            if abstract_elem is not None:
                for abs_text in abstract_elem.findall("AbstractText"):
                    label = abs_text.get("Label", "")
                    text = "".join(abs_text.itertext()).strip()
                    if label:
                        abstract_parts.append(f"{label}: {text}")
                    else:
                        abstract_parts.append(text)

            abstract = "\n\n".join(abstract_parts)
            if not abstract:
                continue

            # Extract journal name
            journal = ""
            journal_elem = art.find("Journal")
            if journal_elem is not None:
                journal = journal_elem.findtext("Title", "")

            # Extract DOI
            doi = ""
            article_id_list = article_elem.find(".//ArticleIdList")
            if article_id_list is not None:
                for aid in article_id_list.findall("ArticleId"):
                    if aid.get("IdType") == "doi":
                        doi = aid.text or ""

            # Extract publication year
            pub_date = art.find(".//PubDate")
            year = pub_date.findtext("Year", "") if pub_date is not None else ""

            # Extract MeSH terms
            mesh_terms = []
            mesh_list = medline.find("MeshHeadingList")
            if mesh_list is not None:
                for heading in mesh_list.findall("MeshHeading"):
                    desc = heading.find("DescriptorName")
                    if desc is not None and desc.text:
                        mesh_terms.append(desc.text)

            articles.append({
                "pmid": pmid,
                "title": title,
                "abstract": abstract,
                "journal": journal,
                "doi": doi,
                "year": year,
                "mesh_terms": mesh_terms,
            })

        except Exception:
            continue

    return articles


def fetch_all_guidelines(max_per_query: int = 5) -> list[dict]:
    """Run all search queries and return deduplicated articles with topics."""
    seen_pmids: set[str] = set()
    all_results: list[dict] = []

    for query, topic in SEARCH_QUERIES:
        print(f"  PubMed: searching '{query}'...")
        try:
            pmids = search_pmids(query, max_results=max_per_query)
            new_pmids = [p for p in pmids if p not in seen_pmids]

            if new_pmids:
                articles = fetch_articles(new_pmids)
                for art in articles:
                    art["topic"] = topic
                    art["source"] = f"PubMed: {art['journal']} ({art['year']})"
                    seen_pmids.add(art["pmid"])
                    all_results.append(art)

            # Rate limit: 3 req/sec without API key
            time.sleep(0.5)

        except Exception as e:
            print(f"  PubMed: error on '{query}': {e}")
            continue

    print(f"  PubMed: fetched {len(all_results)} unique articles")
    return all_results


def articles_to_documents(articles: list[dict]) -> tuple[list[str], list[dict], list[str]]:
    """Convert PubMed articles to documents for ChromaDB ingestion.

    Returns (documents, metadatas, ids).
    """
    documents = []
    metadatas = []
    ids = []

    for art in articles:
        doc_text = f"{art['title']}\n\n{art['abstract']}"
        documents.append(doc_text)
        metadatas.append({
            "source": art["source"],
            "topic": art["topic"],
            "doi": art.get("doi", ""),
            "data_source": "pubmed",
        })
        ids.append(f"pubmed-{art['pmid']}")

    return documents, metadatas, ids
