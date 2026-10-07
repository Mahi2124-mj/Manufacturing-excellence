"""Database engine, session factory and declarative Base for the QCC backend.

This is the lowest-level module: importing it loads backend/.env so connection
strings and secrets are available everywhere. PostgreSQL is the primary datastore.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load secrets/connection strings from backend/.env (explicit path so it works no
# matter the current working directory).
load_dotenv(os.path.join(BASE_DIR, ".env"))

# Format: postgresql+psycopg2://<user>:<password>@<host>:<port>/<db>  ('@' -> %40)
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Copy backend/.env.example to backend/.env "
        "and fill in the connection string."
    )

# SQLite (used for local dev / no-Postgres runs) needs check_same_thread=False so the
# connection can be shared across FastAPI's threadpool. Ignored for PostgreSQL.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_db():
    """FastAPI dependency that yields a request-scoped session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
