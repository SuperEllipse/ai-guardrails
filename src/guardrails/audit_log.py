"""Saved guardrail checks for later review.

Each row is one check: the prompt, the response, whether it was a violation,
and the reason when it was.
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "guardrail_log.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS guardrail_log (
            id TEXT PRIMARY KEY,
            created TEXT,
            source TEXT,
            input_prompt TEXT,
            output_response TEXT,
            violation TEXT,
            reason TEXT
        )
        """
    )
    return conn


def record_log(
    *,
    source: str,
    input_prompt: str,
    output_response: str,
    violation: str,
    reason: str = "",
) -> dict[str, Any]:
    row = {
        "id": "GL" + uuid.uuid4().hex[:10].upper(),
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "source": source,
        "input_prompt": input_prompt,
        "output_response": output_response,
        "violation": "yes" if violation == "yes" else "no",
        "reason": reason if violation == "yes" else "",
    }
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO guardrail_log
                (id, created, source, input_prompt, output_response, violation, reason)
            VALUES
                (:id, :created, :source, :input_prompt, :output_response, :violation, :reason)
            """,
            row,
        )
    return row


def list_logs(limit: int = 200) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, created, source, input_prompt, output_response, violation, reason
            FROM guardrail_log
            ORDER BY rowid DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_log(log_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT id, created, source, input_prompt, output_response, violation, reason
            FROM guardrail_log
            WHERE id = ?
            """,
            (log_id,),
        ).fetchone()
    return dict(row) if row else None
