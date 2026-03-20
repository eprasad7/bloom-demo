export type RiskLevel = "safe" | "caution" | "blocked" | "emergency";

export type CarePathway =
  | "maternity"
  | "fertility"
  | "postpartum"
  | "menopause"
  | "pediatrics"
  | "general_womens_health"
  | "unknown";

export interface GuardrailResult {
  risk_level: RiskLevel;
  rails_triggered: string[];
  modified_response: string | null;
  escalation_required: boolean;
  explanation: string;
}

export interface RetrievedGuideline {
  content: string;
  source: string;
  relevance_score: number;
}

export interface GuardrailLog {
  input_rails: GuardrailResult;
  output_rails: GuardrailResult | null;
  original_llm_response: string | null;
}

export interface JourneyEntry {
  timestamp: string;
  summary: string;
  care_pathway: CarePathway;
  action: string;
  details: string;
}

export interface ICD10Code {
  code: string;
  description: string;
  matched_terms: string[];
}

export interface AuditEvent {
  timestamp: string;
  event_type: string;
  detail: string;
  risk_level: RiskLevel;
  latency_ms: number;
}

export interface EvalScores {
  faithfulness: string; // "pass" | "fail" | "error"
  faithfulness_reason: string;
  relevance: string;
  relevance_reason: string;
  safety: string;
  safety_reason: string;
}

export interface RAGContext {
  system_prompt_tokens: number;
  context_tokens: number;
  query_tokens: number;
  total_context_tokens: number;
  max_tokens: number;
  guidelines_in_prompt: number;
}

export interface PatientMemory {
  type: string;
  label: string;
  value: string;
  source: string;
}

export interface PatientContext {
  demographics: Record<string, string>;
  pregnancy: Record<string, string>;
  symptoms: string[];
  conditions: string[];
  medications: string[];
  care_context: Record<string, string>;
  total_facts: number;
}

export interface ProviderRecommendation {
  title: string;
  specialty: string;
  reason: string;
  urgency: string;
  score: number;
}

export interface UrgencyPrediction {
  urgency_level: number;
  urgency_label: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ChatResponse {
  response: string;
  session_id: string;
  care_pathway: CarePathway;
  guidelines_cited: RetrievedGuideline[];
  guardrails: GuardrailLog;
  care_journey: JourneyEntry[];
  icd10_codes: ICD10Code[];
  audit_log: AuditEvent[];
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  guardrails?: GuardrailLog;
  guidelines?: RetrievedGuideline[];
  care_pathway?: CarePathway;
  risk_level?: RiskLevel;
  icd10_codes?: ICD10Code[];
  audit_log?: AuditEvent[];
}
