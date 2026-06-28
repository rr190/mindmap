from sqlalchemy import create_engine, Column, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv() 
DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True)
    filename = Column(String, nullable=False)
    file_hash = Column(String, unique=True, nullable=False)
    full_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Node(Base):
    __tablename__ = "nodes"

    id = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    label = Column(String, nullable=False)

class Edge(Base):
    __tablename__ = "edges"

    id = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    source = Column(String, nullable=False)
    target = Column(String, nullable=False)

def create_tables():
    Base.metadata.create_all(engine)