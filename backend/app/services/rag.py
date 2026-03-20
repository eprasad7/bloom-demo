"""RAG service — embeds clinical guidelines, retrieves relevant context."""

import chromadb
from chromadb.config import Settings

from app.models import RetrievedGuideline


_client: chromadb.ClientAPI | None = None
_collection: chromadb.Collection | None = None

COLLECTION_NAME = "clinical_guidelines"


def get_client(persist_dir: str = "./chroma_data") -> chromadb.ClientAPI:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(anonymized_telemetry=False),
        )
    return _client


def get_collection(persist_dir: str = "./chroma_data") -> chromadb.Collection:
    global _collection
    if _collection is None:
        client = get_client(persist_dir)
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def ingest_guidelines(
    documents: list[str],
    metadatas: list[dict],
    ids: list[str],
    persist_dir: str = "./chroma_data",
) -> int:
    """Bulk insert clinical guideline chunks into ChromaDB.

    ChromaDB handles embedding via its default model (all-MiniLM-L6-v2).
    """
    collection = get_collection(persist_dir)
    collection.upsert(documents=documents, metadatas=metadatas, ids=ids)
    return collection.count()


def retrieve_guidelines(
    query: str,
    n_results: int = 5,
    persist_dir: str = "./chroma_data",
) -> list[RetrievedGuideline]:
    """Retrieve the most relevant clinical guidelines for a query."""
    collection = get_collection(persist_dir)

    if collection.count() == 0:
        return []

    results = collection.query(query_texts=[query], n_results=n_results)

    guidelines = []
    for i, doc in enumerate(results["documents"][0]):
        metadata = results["metadatas"][0][i]
        distance = results["distances"][0][i] if results["distances"] else 0.0
        # ChromaDB returns distance; convert to similarity score
        relevance = max(0.0, 1.0 - distance)

        guidelines.append(
            RetrievedGuideline(
                content=doc,
                source=metadata.get("source", "Unknown"),
                relevance_score=round(relevance, 3),
            )
        )

    return guidelines


def format_guidelines_for_prompt(guidelines: list[RetrievedGuideline]) -> str:
    """Format retrieved guidelines into a string for the LLM context."""
    if not guidelines:
        return ""

    parts = []
    for i, g in enumerate(guidelines, 1):
        parts.append(
            f"### Guideline {i} [Source: {g.source}]\n"
            f"{g.content}\n"
            f"(Relevance: {g.relevance_score})"
        )
    return "\n\n".join(parts)
