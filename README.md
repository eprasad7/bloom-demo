# Bloom Care AI

AI-powered women's health care navigation with clinical guardrails. A full-stack prototype demonstrating how AI can safely guide patients through health decisions, grounded in evidence-based clinical guidelines.

**Live demo:** [bloom.ish.dev](https://bloom.ish.dev)

## Architecture

```
┌─ Frontend (Next.js 15) ──────────────────────────────────────────┐
│                                                                   │
│  Chat UI          Search UI              Agent UI                 │
│  (Markdown +      (Semantic search       (10-step autonomous      │
│   Streaming SSE    across 137 docs)       care assessment)         │
│   + Thinking)                                                     │
│                                                                   │
│  Guardrail        RAG Visualizer         Memory Panel             │
│  Inspector        (Chunks + Context      (Episodic/Semantic/      │
│  (Rails + ICD-10   Window + Eval)         Working/Procedural)     │
│   + ML Urgency                                                    │
│   + Providers)    Metrics Panel          Prompt Playground        │
│                   (Latency + Risk +      (Auto-evolve to          │
│                    Tokens + Trends)       target F-score)          │
└───────────────────────────────────────────────────────────────────┘
                              │ SSE Stream
┌─ Backend (FastAPI) ─────────▼─────────────────────────────────────┐
│                                                                   │
│  Input Rails ──▶ RAG ──▶ ML Urgency ──▶ Claude + Think ──▶ Output │
│  (Emergency,     (137     (TF-IDF +     (Sonnet with      Rails   │
│   Off-topic,     docs)    Gradient       Extended          (Diag,  │
│   Jailbreak)              Boosting)      Thinking)         Meds)   │
│       │            │          │              │               │     │
│       └────────────┴──────────┴──────────────┴───────────────┘     │
│                              │                                     │
│  ┌───────────────────────────▼───────────────────────────────┐    │
│  │  Episodic Memory   (Patient context extraction)           │    │
│  │  ICD-10 Mapping    (35+ symptom-to-code mappings)         │    │
│  │  Care Routing      (Haiku pathway classification)         │    │
│  │  Eval Judge        (Haiku faithfulness + relevance)       │    │
│  │  Auto-Evolve       (Iterative prompt optimization)        │    │
│  │  Audit Logger      (Latency tracking per step)            │    │
│  │  Session Memory    (SQLite persistence)                   │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─ Data Pipeline ───────────────────────────────────────────┐    │
│  │  PubMed API (71) + OpenFDA API (5) + MedlinePlus API (46) │    │
│  │  + ACOG/WHO/CDC Static Guidelines (15) = 137 documents     │    │
│  └───────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

## Features

### Clinical Guardrails (5 layers)
- **Input Rails:** Emergency detection (preeclampsia, hemorrhage, mental health crisis), off-topic filtering, jailbreak resistance
- **Output Rails:** Diagnosis language blocking, medication safety, auto-disclaimer
- Modeled after NVIDIA NeMo Guardrails architecture

### RAG Pipeline
- 137 clinical documents from 4 live data sources (PubMed, OpenFDA, MedlinePlus) + static ACOG/WHO/CDC guidelines
- ChromaDB with all-MiniLM-L6-v2 embeddings
- Inline citations [1], [2], [3] in responses
- RAG Visualizer showing retrieved chunks, relevance scores, and context window token breakdown

### ML Urgency Classifier
- TF-IDF + Gradient Boosting model trained on 85 synthetic clinical vignettes
- Predicts urgency level (routine/soon/urgent/emergency) with confidence scores
- Probability distribution across all 4 classes displayed in UI

### Extended Thinking
- Claude Sonnet with 5K token thinking budget
- Reasoning visible in collapsible "View reasoning" section per response
- Thinking vs response token breakdown in Metrics panel

### Eval System
- LLM-as-judge (Claude Haiku) scoring faithfulness and relevance per response
- 15 hand-curated clinical test cases with expected sources and reference answers
- **Auto-evolve:** Iterative prompt optimization that rewrites the system prompt until faithfulness reaches target (75%)
- Batch eval endpoint: `POST /api/eval`

### Agent Memory (4 types)
- **Episodic:** Structured fact extraction from conversation (gestational age, symptoms, conditions, medications)
- **Semantic:** RAG knowledge base (137 clinical guidelines)
- **Working:** Active conversation context window
- **Procedural:** Guardrail rules, urgency classifier, eval judge

### Observability
- Pipeline Metrics panel: latency per step, risk distribution, token breakdown, eval score trends
- Audit events with timestamps and latency tracking
- Production path: OpenTelemetry to Datadog/Grafana

### Session Persistence
- SQLite-backed session memory with messages, journey entries, and care pathway tracking
- Sessions persist across page refreshes
- Session history browser in Memory tab
- New Chat button for fresh sessions

### ICD-10 Integration
- 35+ symptom-to-diagnosis code mappings for women's health
- Codes displayed in guardrails panel with matched terms

### Clinical Search
- Semantic search across all 137 clinical documents via `POST /api/search`
- Sample search queries for quick exploration
- Relevance score bars and content previews
- Searches the same ChromaDB vector store used by the RAG pipeline

### Autonomous Care Assessment Agent
- 10-step autonomous pipeline via `POST /api/agent/assess`
- Steps: safety check, context extraction, urgency classification (ML), ICD-10 mapping, RAG retrieval, clinical assessment (Sonnet + thinking), output safety check, pathway classification (Haiku), eval judge (Haiku), provider recommendations
- Full execution trace with expandable step-by-step output
- Model orchestration summary showing all 7 models/engines with call counts and latency

### Multi-Model Orchestration
7 different models/engines coordinated in a single pipeline:
| Model | Role |
|-------|------|
| Regex engine | Input/output safety rails |
| Regex NER | Patient context extraction |
| TF-IDF + Gradient Boosting (sklearn) | Urgency classification |
| ChromaDB + MiniLM-L6-v2 | Semantic search and RAG retrieval |
| Claude Sonnet 4 (extended thinking) | Clinical assessment generation |
| Claude Haiku 4.5 | Care pathway routing + eval judge |
| Rule-based scoring engine | Provider recommendations |

### Provider Recommendation Engine
- Rule-based scoring with 40+ symptom-provider routing rules
- Care pathway boosts (maternity, fertility, postpartum, menopause, pediatrics)
- Urgency levels (routine/soon/urgent/emergency)
- Uses episodic memory (symptoms, conditions, gestational age) as input
- Maps to Maven's core product: matching members with the right provider

## Quick Start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

# Set your API key
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# Run data pipeline (fetches from PubMed, OpenFDA, MedlinePlus)
python -m app.data.pipeline.runner

# Start server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## Demo Scenarios

| Scenario | What it demonstrates |
|----------|---------------------|
| **Emergency** | Preeclampsia symptoms trigger input rail, bypass LLM entirely, show ICD-10 codes + ML urgency prediction |
| **Medication** | "Should I stop my supplements?" passes input rails, but output rail may catch unsafe advice |
| **Off-Topic** | Non-health question hits scope boundary, shows topic filtering |
| **Diagnosis** | "Do I have PCOS?" shows output rail catching diagnostic language |
| **Jailbreak** | Prompt injection attempt deflected by input rail |
| **Safe Question** | Full pipeline: RAG retrieval, extended thinking, inline citations, eval scores |

## Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS 4, react-markdown
- **Backend:** FastAPI, Python 3.12+
- **AI:** Claude Sonnet (generation + thinking), Claude Haiku (routing + eval)
- **ML:** scikit-learn (TF-IDF + Gradient Boosting urgency classifier)
- **RAG:** ChromaDB with all-MiniLM-L6-v2 embeddings
- **Data:** PubMed API, OpenFDA API, MedlinePlus API, ACOG/WHO/CDC guidelines
- **Storage:** SQLite (sessions), ChromaDB (vectors)
- **Deploy:** Railway (Docker), GitHub

## Clinical Data Sources

| Source | Documents | Type |
|--------|-----------|------|
| PubMed (live API) | 71 | Peer-reviewed article abstracts |
| MedlinePlus (live API) | 46 | NIH patient health topics |
| ACOG/WHO/CDC (static) | 15 | Clinical practice guidelines |
| OpenFDA (live API) | 5 | Pregnancy drug safety labels |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/chat` | Non-streaming chat |
| `POST /api/chat/stream` | SSE streaming chat with full pipeline |
| `POST /api/chat/playground` | Test custom system prompt with eval |
| `POST /api/chat/auto-evolve` | Iterative prompt optimization |
| `POST /api/search` | Semantic search across 137 clinical documents |
| `POST /api/agent/assess` | 10-step autonomous care assessment agent |
| `POST /api/eval` | Batch eval over 15 test cases |
| `GET /api/sessions` | List all sessions |
| `GET /api/sessions/:id` | Session detail with messages |
| `GET /api/memory/stats` | Aggregate memory statistics |
| `GET /api/journey/:id` | Care journey timeline |
| `GET /api/health` | Health check |

---

Built with ♥ by Ish Prasad | Powered by claude-code
