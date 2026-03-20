"""Data models for Bloom Care AI."""

from enum import Enum
from pydantic import BaseModel


class RiskLevel(str, Enum):
    SAFE = "safe"
    CAUTION = "caution"
    BLOCKED = "blocked"
    EMERGENCY = "emergency"


class GuardrailResult(BaseModel):
    risk_level: RiskLevel
    rails_triggered: list[str] = []
    modified_response: str | None = None
    escalation_required: bool = False
    explanation: str = ""


class CarePathway(str, Enum):
    MATERNITY = "maternity"
    FERTILITY = "fertility"
    POSTPARTUM = "postpartum"
    MENOPAUSE = "menopause"
    PEDIATRICS = "pediatrics"
    GENERAL_WOMENS_HEALTH = "general_womens_health"
    UNKNOWN = "unknown"


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class RetrievedGuideline(BaseModel):
    content: str
    source: str
    relevance_score: float


class GuardrailLog(BaseModel):
    input_rails: GuardrailResult
    output_rails: GuardrailResult | None = None
    original_llm_response: str | None = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    care_pathway: CarePathway
    guidelines_cited: list[RetrievedGuideline] = []
    guardrails: GuardrailLog
    care_journey: list[dict] = []
    icd10_codes: list[dict] = []
    audit_log: list[dict] = []


class JourneyEntry(BaseModel):
    timestamp: str
    summary: str
    care_pathway: CarePathway
    action: str  # "guidance", "escalation", "referral", "screening_reminder"
    details: str = ""


class AuditEvent(BaseModel):
    timestamp: str
    event_type: str  # "input_rail", "rag_retrieval", "llm_call", "output_rail", "icd10_lookup", "pathway_classification"
    detail: str
    risk_level: RiskLevel = RiskLevel.SAFE
    latency_ms: float = 0.0
