"""Session memory — SQLite-backed care journey persistence."""

import json
import uuid
from datetime import datetime, timezone

import aiosqlite

from app.models import CarePathway, JourneyEntry

DATABASE_PATH = "./sessions.db"


async def init_db(db_path: str = DATABASE_PATH) -> None:
    """Create tables if they don't exist."""
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                care_pathway TEXT DEFAULT 'unknown'
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS journey_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                summary TEXT NOT NULL,
                care_pathway TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT DEFAULT '',
                FOREIGN KEY (session_id) REFERENCES sessions(session_id)
            )
        """)
        await db.commit()


async def create_session(db_path: str = DATABASE_PATH) -> str:
    """Create a new session and return its ID."""
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO sessions (session_id, created_at) VALUES (?, ?)",
            (session_id, now),
        )
        await db.commit()
    return session_id


async def session_exists(session_id: str, db_path: str = DATABASE_PATH) -> bool:
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            "SELECT 1 FROM sessions WHERE session_id = ?", (session_id,)
        )
        return await cursor.fetchone() is not None


async def add_message(
    session_id: str, role: str, content: str, db_path: str = DATABASE_PATH
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            (session_id, role, content, now),
        )
        await db.commit()


async def get_messages(
    session_id: str, limit: int = 20, db_path: str = DATABASE_PATH
) -> list[dict]:
    """Get recent conversation history for a session."""
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (session_id, limit),
        )
        rows = await cursor.fetchall()
        # Reverse to get chronological order
        return [{"role": row[0], "content": row[1]} for row in reversed(rows)]


async def add_journey_entry(
    session_id: str, entry: JourneyEntry, db_path: str = DATABASE_PATH
) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """INSERT INTO journey_entries
               (session_id, timestamp, summary, care_pathway, action, details)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                entry.timestamp,
                entry.summary,
                entry.care_pathway.value,
                entry.action,
                entry.details,
            ),
        )
        await db.commit()


async def get_journey(
    session_id: str, db_path: str = DATABASE_PATH
) -> list[dict]:
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            """SELECT timestamp, summary, care_pathway, action, details
               FROM journey_entries WHERE session_id = ? ORDER BY id ASC""",
            (session_id,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "timestamp": row[0],
                "summary": row[1],
                "care_pathway": row[2],
                "action": row[3],
                "details": row[4],
            }
            for row in rows
        ]


async def update_session_pathway(
    session_id: str, pathway: CarePathway, db_path: str = DATABASE_PATH
) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE sessions SET care_pathway = ? WHERE session_id = ?",
            (pathway.value, session_id),
        )
        await db.commit()
