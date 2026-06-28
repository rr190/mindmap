from models import create_tables, SessionLocal, Document, Node, Edge
create_tables()

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pdfplumber
from io import BytesIO
from dotenv import load_dotenv
from google import genai
from google.genai import types
from groq import Groq
import anthropic
import json
import uuid
import hashlib


import os

load_dotenv()  # Load environment variables from .env file

api_key = os.getenv("ANTHROPIC_API_KEY")
gemini_api_key = os.getenv("GEMINI_API_KEY")
groq_api_key = os.getenv("GROQ_API_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    # file.read() gives you the raw bytes
    contents = await file.read()

    # hash the file for duplicate detection
    file_hash = hashlib.md5(contents).hexdigest()
    
    db = SessionLocal()
    
    # check if we've seen this file before
    existing = db.query(Document).filter(Document.file_hash == file_hash).first()
    if existing:
        nodes = db.query(Node).filter(Node.document_id == existing.id).all()
        edges = db.query(Edge).filter(Edge.document_id == existing.id).all()
        db.close()
        return {
            "filename": existing.filename,
            "document_id": existing.id,
            "cached": True,
            "nodes": [{"id": n.id, "label": n.label} for n in nodes],
            "edges": [{"source": e.source, "target": e.target} for e in edges]
        }

    # extract text from pdf
    text_by_page = []
    with pdfplumber.open(BytesIO(contents)) as pdf:
        page_count = len(pdf.pages)
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                text_by_page.append(text)

    full_text = "\n\n".join(text_by_page)

    # store document in database
    doc_id = str(uuid.uuid4())
    document = Document(
        id=doc_id,
        filename=file.filename,
        file_hash=file_hash,
        full_text=full_text
    )
    db.add(document)
    db.commit()
    db.close()

    return {
        "filename": file.filename,
        "document_id": doc_id,
        "cached": False,
        "text_preview": full_text[:500],
        "full_text": full_text
    }

@app.post("/extract")
async def extract_mindmap(payload: dict):
    text = payload["text"]

    # client = anthropic.Anthropic()
    # client = genai.Client()
    client = Groq()

    
    your_prompt = f"""
                You are a knowledge graph extractor.

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
                IDs must be unique strings matching between nodes and edges.
                """
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": your_prompt}]
    )

    response_text = response.choices[0].message.content
    cleaned = response_text.strip().removeprefix("```json").removesuffix("```").strip()
    return json.loads(cleaned)