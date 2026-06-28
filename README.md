# Mind Map Builder

An AI-powered web app that converts PDFs into interactive mind maps.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + React Flow
- **Backend**: Python + FastAPI
- **AI**: Google Gemini API
- **Database**: SQLite (local), pgvector/PostgreSQL (production)

## Project Structure
mindmap-app/

├── backend/

│   ├── main.py        # FastAPI endpoints

│   ├── models.py      # Database tables

│   ├── requirements.txt

│   ├── .env           # API keys (never commit this)

│   ├── .gitignore

│   └── mindmap.db     # SQLite database (auto-created)

└── frontend/

└── src/

└── App.tsx    # Main React component

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```
Runs at http://localhost:8000
API docs at http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```
Runs at http://localhost:5173



## Environment Variables
Create a `.env` file in `backend/` with:


## Known Issues & Fixes
- **CORS error**: Make sure backend is running before frontend
- **SQLite vs PostgreSQL**: Currently using SQLite locally to avoid
  Docker auth issues. DATABASE_URL in .env controls which is used.
- **Docker PostgreSQL auth**: pg_hba.conf requires scram-sha-256 for
  external connections — workaround is SQLite for local dev
- **React Flow Connection type**: Import as `import type { Connection }`
  not a regular import
- **Gemini returns markdown**: Strip ```json fences before JSON.parse()

## What's Been Built
- [x] PDF upload endpoint
- [x] Text extraction with pdfplumber  
- [x] AI concept extraction with Gemini
- [x] React Flow mind map rendering
- [x] SQLite database with duplicate detection via MD5 hash
- [x] Full PDF text extraction (not just preview)

## Up Next
- [ ] Save nodes and edges to database after extraction
- [ ] Wire frontend to use full_text not just text_preview
- [ ] Better node layout with Dagre algorithm
- [ ] Loading states in the UI
- [ ] Display cached vs fresh indicator