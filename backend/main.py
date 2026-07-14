from models import create_tables, SessionLocal, Document, Node, Edge

create_tables()

import hashlib
import json
import os
import uuid
from io import BytesIO

import pdfplumber
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel, Field

load_dotenv()

MAX_TEXT_CHARS = 12_000
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

app = FastAPI()

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5175").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExtractRequest(BaseModel):
    text: str = Field(min_length=1)
    document_id: str | None = None


def truncate_text(text: str) -> str:
    if len(text) <= MAX_TEXT_CHARS:
        return text
    return text[:MAX_TEXT_CHARS] + "\n\n[Text truncated for extraction.]"


def parse_llm_json(response_text: str) -> dict:
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="The model returned invalid JSON. Try uploading again or use a shorter document.",
        ) from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="The model response was not a JSON object.")

    nodes = parsed.get("nodes")
    edges = parsed.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise HTTPException(status_code=502, detail="The model response is missing nodes or edges.")

    return {"nodes": nodes, "edges": edges}


def persist_mindmap(document_id: str, nodes: list, edges: list) -> None:
    db = SessionLocal()
    try:
        db.query(Edge).filter(Edge.document_id == document_id).delete()
        db.query(Node).filter(Node.document_id == document_id).delete()

        for node in nodes:
            node_id = str(node.get("id", "")).strip()
            label = str(node.get("label", "")).strip()
            if not node_id or not label:
                continue
            db.add(Node(id=node_id, document_id=document_id, label=label))

        for edge in edges:
            source = str(edge.get("source", "")).strip()
            target = str(edge.get("target", "")).strip()
            if not source or not target:
                continue
            db.add(
                Edge(
                    id=str(uuid.uuid4()),
                    document_id=document_id,
                    source=source,
                    target=target,
                )
            )

        db.commit()
    finally:
        db.close()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    contents = await file.read()

    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is too large. Maximum size is 20 MB.")

    file_hash = hashlib.md5(contents).hexdigest()

    db = SessionLocal()
    try:
        existing = db.query(Document).filter(Document.file_hash == file_hash).first()
        if existing:
            nodes = db.query(Node).filter(Node.document_id == existing.id).all()
            edges = db.query(Edge).filter(Edge.document_id == existing.id).all()
            existing_text = existing.full_text or ""
            return {
                "filename": existing.filename,
                "document_id": existing.id,
                "cached": True,
                "nodes": [{"id": n.id, "label": n.label} for n in nodes],
                "edges": [{"source": e.source, "target": e.target} for e in edges],
                "text_preview": existing_text[:500],
                "full_text": existing_text,
            }

        text_by_page = []
        with pdfplumber.open(BytesIO(contents)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    text_by_page.append(text)

        full_text = "\n\n".join(text_by_page)
        doc_id = str(uuid.uuid4())
        document = Document(
            id=doc_id,
            filename=file.filename or "upload.pdf",
            file_hash=file_hash,
            full_text=full_text,
        )
        db.add(document)
        db.commit()

        return {
            "filename": file.filename,
            "document_id": doc_id,
            "cached": False,
            "nodes": [],
            "edges": [],
            "text_preview": full_text[:500],
            "full_text": full_text,
        }
    finally:
        db.close()


@app.post("/extract")
async def extract_mindmap(payload: ExtractRequest):
    text = truncate_text(payload.text.strip())
    prompt = f"""You are a knowledge graph extractor.

Extract the key concepts and relationships from this text:

{text}

Return ONLY a JSON object, no explanation, no markdown backticks, in this exact format:
{{
    "nodes": [
        {{"id": "1", "label": "concept name"}}
    ],
    "edges": [
        {{"source": "1", "target": "2"}}
    ]
}}

Each node should be a key concept from the text.
Each edge should represent a relationship between two concepts.
IDs must be unique strings matching between nodes and edges."""

    try:
        client = Groq()
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Failed to reach the extraction service. Check your GROQ_API_KEY and try again.",
        ) from exc

    response_text = response.choices[0].message.content or ""
    result = parse_llm_json(response_text)

    if payload.document_id:
        persist_mindmap(payload.document_id, result["nodes"], result["edges"])

    return result
