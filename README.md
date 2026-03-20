# Maven Intelligence Mini

Women's Health Care Navigation Agent with Clinical Guardrails — a working prototype of Maven Clinic's AI-powered care navigation system.

## Architecture

```
┌──────────────────────────┐     ┌──────────────────────────────┐
│    Next.js Frontend      │     │      FastAPI Backend          │
│                          │     │                              │
│  Chat UI ──────────────────────▶ /api/chat                   │
│  Guardrail Inspector     │     │   ├─ Input Rails (regex)    │
│  Care Journey Timeline   │     │   ├─ RAG Retrieval          │
│  Preset Scenarios        │     │   ├─ Claude API (Sonnet)    │
│                          │     │   ├─ Output Rails           │
│                          │     │   └─ Session Memory         │
└──────────────────────────┘     │                              │
                                 │  ChromaDB (clinical guides)  │
                                 │  SQLite (session store)      │
                                 └──────────────────────────────┘
```

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

# Ingest clinical guidelines
python -m app.data.ingest

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

| Scenario | What it shows |
|----------|--------------|
| **Emergency** | Preeclampsia symptoms → input rail bypasses LLM, immediate escalation |
| **Medication** | "Should I stop my supplements?" → output rail catches unsafe advice |
| **Off-Topic** | Non-health question → scope boundary redirect |
| **Diagnosis** | "Do I have PCOS?" → output rail blocks diagnostic language |
| **Jailbreak** | Prompt injection → input rail deflection |
| **Safe Question** | Normal prenatal question → RAG retrieval + clinical response |

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS 4
- **Backend**: FastAPI, Python 3.11+
- **AI**: Claude Sonnet (generation), Claude Haiku (routing)
- **RAG**: ChromaDB with all-MiniLM-L6-v2 embeddings
- **Data**: 15 clinical guidelines from ACOG, WHO, CDC
- **Session**: SQLite (care journey persistence)

## Clinical Data Sources

- ACOG Practice Bulletins (prenatal care, preeclampsia, fertility, menopause, GDM)
- WHO Recommendations (antenatal care, nutrition, postnatal care, breastfeeding, mental health)
- CDC Guidelines (contraception, genetic screening, vaccinations)
