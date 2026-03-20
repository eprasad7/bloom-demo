import type {
  AuditEvent,
  CarePathway,
  EvalScores,
  GuardrailResult,
  PatientContext,
  PatientMemory,
  ProviderRecommendation,
  UrgencyPrediction,
  ICD10Code,
  JourneyEntry,
  RAGContext,
  RetrievedGuideline,
} from "./types";

export interface StreamCallbacks {
  onSession: (sessionId: string) => void;
  onInputRails: (result: GuardrailResult) => void;
  onICD10: (codes: ICD10Code[]) => void;
  onMemory: (newMemories: PatientMemory[], context: PatientContext) => void;
  onRecommendations: (providers: ProviderRecommendation[]) => void;
  onUrgency: (prediction: UrgencyPrediction) => void;
  onRAG: (guidelines: RetrievedGuideline[]) => void;
  onRAGContext: (context: RAGContext) => void;
  onThinking: (text: string) => void;
  onThinkingComplete: (fullText: string) => void;
  onToken: (text: string) => void;
  onOutputRails: (result: GuardrailResult) => void;
  onResponseReplaced: (original: string, replacement: string) => void;
  onPathway: (pathway: CarePathway) => void;
  onJourney: (entries: JourneyEntry[]) => void;
  onEval: (scores: EvalScores) => void;
  onAudit: (events: AuditEvent[]) => void;
  onDone: (response: string) => void;
  onError: (message: string) => void;
}

// In production, call backend directly via public URL.
// In development, Next.js rewrites proxy /api/* to localhost:8000.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export async function sendMessageStream(
  message: string,
  sessionId: string | null,
  callbacks: StreamCallbacks,
  apiKey?: string | null
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message, session_id: sessionId }),
  });

  if (!res.ok) {
    callbacks.onError(`Request failed: ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

    let currentEvent = "";
    let currentData = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7);
      } else if (line.startsWith("data: ")) {
        currentData = line.slice(6);
      } else if (line === "" && currentEvent && currentData) {
        // Empty line = end of event
        try {
          const data = JSON.parse(currentData);
          dispatchEvent(currentEvent, data, callbacks);
        } catch {
          // Non-JSON data
        }
        currentEvent = "";
        currentData = "";
      }
    }
  }
}

function dispatchEvent(
  event: string,
  data: Record<string, unknown>,
  cb: StreamCallbacks
): void {
  switch (event) {
    case "session":
      cb.onSession(data.session_id as string);
      break;
    case "input_rails":
      cb.onInputRails(data as unknown as GuardrailResult);
      break;
    case "icd10":
      cb.onICD10(data.codes as ICD10Code[]);
      break;
    case "recommendations":
      cb.onRecommendations(data.providers as ProviderRecommendation[]);
      break;
    case "memory":
      cb.onMemory(
        data.new_memories as PatientMemory[],
        data.patient_context as PatientContext,
      );
      break;
    case "urgency":
      cb.onUrgency(data as unknown as UrgencyPrediction);
      break;
    case "rag":
      cb.onRAG(data.guidelines as RetrievedGuideline[]);
      break;
    case "rag_context":
      cb.onRAGContext(data as unknown as RAGContext);
      break;
    case "thinking_start":
    case "thinking":
      cb.onThinking(data.text as string ?? "");
      break;
    case "thinking_end":
      break;
    case "thinking_complete":
      cb.onThinkingComplete(data.text as string);
      break;
    case "token":
      cb.onToken(data.text as string);
      break;
    case "output_rails":
      cb.onOutputRails(data as unknown as GuardrailResult);
      break;
    case "response_replaced":
      cb.onResponseReplaced(data.original as string, data.replacement as string);
      break;
    case "pathway":
      cb.onPathway(data.care_pathway as CarePathway);
      break;
    case "journey":
      cb.onJourney(data.entries as JourneyEntry[]);
      break;
    case "eval":
      cb.onEval(data as unknown as EvalScores);
      break;
    case "audit":
      cb.onAudit(data.events as AuditEvent[]);
      break;
    case "done":
      cb.onDone(data.response as string);
      break;
    case "error":
      cb.onError(data.message as string);
      break;
  }
}
