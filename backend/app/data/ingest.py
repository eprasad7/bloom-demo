"""Ingest clinical guidelines into ChromaDB."""

import json
from pathlib import Path

from app.services.rag import ingest_guidelines


def load_and_ingest(persist_dir: str = "./chroma_data") -> int:
    """Load clinical guidelines JSON and ingest into vector store."""
    data_path = Path(__file__).parent / "clinical_guidelines.json"

    with open(data_path) as f:
        guidelines = json.load(f)

    documents = []
    metadatas = []
    ids = []

    for g in guidelines:
        # Combine topic and content for richer embeddings
        doc_text = f"{g['topic']}\n\n{g['content']}"
        documents.append(doc_text)
        metadatas.append({
            "source": g["source"],
            "topic": g["topic"],
        })
        ids.append(g["id"])

    count = ingest_guidelines(documents, metadatas, ids, persist_dir)
    print(f"Ingested {count} clinical guidelines into ChromaDB")
    return count


if __name__ == "__main__":
    load_and_ingest()
