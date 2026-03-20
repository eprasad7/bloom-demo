"""Unified data pipeline runner.

Orchestrates all data sources:
  1. Static clinical guidelines (ACOG/WHO/CDC — bundled JSON)
  2. PubMed articles (live API)
  3. OpenFDA drug labels (live API)
  4. MedlinePlus health topics (live API)

Run: python -m app.data.pipeline.runner
"""

import json
import sys
import time
from pathlib import Path

from app.services.rag import ingest_guidelines, get_collection

# Import fetchers
from app.data.pipeline.pubmed import (
    fetch_all_guidelines as fetch_pubmed,
    articles_to_documents,
)
from app.data.pipeline.openfda import (
    fetch_all_drug_labels,
    labels_to_documents,
)
from app.data.pipeline.medlineplus import (
    fetch_all_topics,
    topics_to_documents,
)


def load_static_guidelines() -> tuple[list[str], list[dict], list[str]]:
    """Load bundled clinical guidelines from JSON."""
    data_path = Path(__file__).parent.parent / "clinical_guidelines.json"

    with open(data_path) as f:
        guidelines = json.load(f)

    documents = []
    metadatas = []
    ids = []

    for g in guidelines:
        doc_text = f"{g['topic']}\n\n{g['content']}"
        documents.append(doc_text)
        metadatas.append({
            "source": g["source"],
            "topic": g["topic"],
            "data_source": "static",
        })
        ids.append(g["id"])

    return documents, metadatas, ids


def run_pipeline(
    persist_dir: str = "./chroma_data",
    skip_apis: bool = False,
) -> dict:
    """Run the full data ingestion pipeline.

    Args:
        persist_dir: ChromaDB persistence directory.
        skip_apis: If True, only load static guidelines (for offline/testing).

    Returns:
        Summary dict with counts per source.
    """
    summary: dict[str, int] = {}
    all_docs: list[str] = []
    all_metas: list[dict] = []
    all_ids: list[str] = []

    start = time.time()

    # ── Source 1: Static clinical guidelines ──
    print("\n[1/4] Loading static clinical guidelines (ACOG/WHO/CDC)...")
    docs, metas, ids = load_static_guidelines()
    all_docs.extend(docs)
    all_metas.extend(metas)
    all_ids.extend(ids)
    summary["static_guidelines"] = len(docs)
    print(f"  Loaded {len(docs)} static guidelines")

    if not skip_apis:
        # ── Source 2: PubMed ──
        print("\n[2/4] Fetching PubMed articles...")
        try:
            articles = fetch_pubmed(max_per_query=5)
            docs, metas, ids = articles_to_documents(articles)
            all_docs.extend(docs)
            all_metas.extend(metas)
            all_ids.extend(ids)
            summary["pubmed_articles"] = len(docs)
        except Exception as e:
            print(f"  PubMed failed: {e}")
            summary["pubmed_articles"] = 0

        # ── Source 3: OpenFDA ──
        print("\n[3/4] Fetching OpenFDA drug labels...")
        try:
            labels = fetch_all_drug_labels()
            docs, metas, ids = labels_to_documents(labels)
            all_docs.extend(docs)
            all_metas.extend(metas)
            all_ids.extend(ids)
            summary["openfda_labels"] = len(docs)
        except Exception as e:
            print(f"  OpenFDA failed: {e}")
            summary["openfda_labels"] = 0

        # ── Source 4: MedlinePlus ──
        print("\n[4/4] Fetching MedlinePlus health topics...")
        try:
            topics = fetch_all_topics()
            docs, metas, ids = topics_to_documents(topics)
            all_docs.extend(docs)
            all_metas.extend(metas)
            all_ids.extend(ids)
            summary["medlineplus_topics"] = len(docs)
        except Exception as e:
            print(f"  MedlinePlus failed: {e}")
            summary["medlineplus_topics"] = 0
    else:
        print("\n[2-4/4] Skipping API sources (--offline mode)")
        summary["pubmed_articles"] = 0
        summary["openfda_labels"] = 0
        summary["medlineplus_topics"] = 0

    # ── Ingest all into ChromaDB ──
    print(f"\nIngesting {len(all_docs)} total documents into ChromaDB...")

    # Batch ingest (ChromaDB has a batch size limit)
    batch_size = 100
    for i in range(0, len(all_docs), batch_size):
        batch_docs = all_docs[i : i + batch_size]
        batch_metas = all_metas[i : i + batch_size]
        batch_ids = all_ids[i : i + batch_size]
        ingest_guidelines(batch_docs, batch_metas, batch_ids, persist_dir)

    collection = get_collection(persist_dir)
    total = collection.count()
    elapsed = time.time() - start

    summary["total_documents"] = total
    summary["elapsed_seconds"] = round(elapsed, 1)

    print(f"\n{'='*50}")
    print(f"Pipeline complete!")
    print(f"{'='*50}")
    for source, count in summary.items():
        print(f"  {source}: {count}")
    print(f"{'='*50}")

    return summary


if __name__ == "__main__":
    offline = "--offline" in sys.argv
    run_pipeline(skip_apis=offline)
