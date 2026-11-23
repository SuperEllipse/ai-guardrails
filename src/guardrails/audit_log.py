"""Saved guardrail checks for later review.

Each row is one check: the prompt, the response, whether it was a violation,
and the reason when it was. Later columns are nullable so older databases keep working.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "guardrail_log.db"

BASE_COLUMNS = ("id", "created", "source", "input_prompt", "output_response", "violation", "reason")
EXTRA_COLUMNS = (
    "example_id",
    "title",
    "area",
    "stage",
    "region",
    "outcome",
    "judge",
    "timings",
    "draft_source",
    "draft",
    "live_answer",
    "live_verdict",
    "error",
)
JSON_COLUMNS = {"judge", "timings"}


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
    present = {row["name"] for row in conn.execute("PRAGMA table_info(guardrail_log)")}
    for column in EXTRA_COLUMNS:
        if column not in present:
            conn.execute(f"ALTER TABLE guardrail_log ADD COLUMN {column} TEXT")
    return conn


def record_log(
    *,
    source: str,
    input_prompt: str,
    output_response: str,
    violation: str,
    reason: str = "",
    **extra: Any,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": "GL" + uuid.uuid4().hex[:10].upper(),
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "source": source,
        "input_prompt": input_prompt,
        "output_response": output_response,
        "violation": violation if violation in ("yes", "no", "error") else "no",
        "reason": reason if violation in ("yes", "error") else "",
    }
    for column in EXTRA_COLUMNS:
        value = extra.get(column)
        if column in JSON_COLUMNS and value is not None:
            value = json.dumps(value)
        row[column] = value
    columns = BASE_COLUMNS + EXTRA_COLUMNS
    with _connect() as conn:
        conn.execute(
            f"INSERT INTO guardrail_log ({', '.join(columns)}) VALUES ({', '.join(':' + c for c in columns)})",
            row,
        )
    return _decode(row)


def _decode(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    for column in JSON_COLUMNS:
        value = out.get(column)
        if isinstance(value, str) and value:
            try:
                out[column] = json.loads(value)
            except ValueError:
                out[column] = None
    return out


def list_logs(limit: int = 200) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM guardrail_log ORDER BY rowid DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [_decode(dict(row)) for row in rows]


def count_logs() -> int:
    with _connect() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM guardrail_log").fetchone()[0])


def get_log(log_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM guardrail_log WHERE id = ?", (log_id,)).fetchone()
    return _decode(dict(row)) if row else None
