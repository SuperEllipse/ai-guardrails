"""Run the attack set through the guard server and store the rows."""

from __future__ import annotations

import csv
import io
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from src.guardrails.connection import load_connection
from src.guardrails.guard_client import check_messages, check_transfer
from src.guardrails.written_rules import custom_is_deployed

ROOT = Path(__file__).resolve().parents[2]
ATTACKS_PATH = ROOT / "guardrails" / "catalog" / "attacks.yml"
DB_PATH = ROOT / "data" / "redteam.db"
INSERT_CASE = """
    INSERT INTO redteam_cases
    (run_id, case_id, policy, stage, expected, actual, entity, query, detail, judge, elapsed_ms)
    VALUES (:run_id, :case_id, :policy, :stage, :expected, :actual, :entity, :query, :detail, :judge, :elapsed_ms)
"""


def load_attacks() -> list[dict[str, Any]]:
    with ATTACKS_PATH.open() as handle:
        data = yaml.safe_load(handle) or {}
    return list(data.get("attacks") or [])


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS redteam_runs (
            run_id TEXT PRIMARY KEY,
            created TEXT,
            region TEXT,
            profile_version TEXT,
            all_regions INTEGER,
            model TEXT,
            policies TEXT,
            total INTEGER,
            blocked INTEGER,
            misses INTEGER,
            overblocks INTEGER
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS redteam_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT,
            case_id TEXT,
            policy TEXT,
            stage TEXT,
            expected TEXT,
            actual TEXT,
            entity TEXT,
            query TEXT,
            detail TEXT
        )
        """
    )
    present = {row["name"] for row in conn.execute("PRAGMA table_info(redteam_cases)")}
    for column in ("judge", "elapsed_ms"):
        if column not in present:
            conn.execute(f"ALTER TABLE redteam_cases ADD COLUMN {column} TEXT")
    return conn


def _judge_label(judge: dict[str, Any] | None) -> str:
    if not judge or not judge.get("answered_by"):
        return ""
    names = {"answer_model": "the answer model", "self_check": "the answer model", "llama_guard": "Llama Guard", "nim": "NVIDIA NIM"}
    model = f" ({judge['model']})" if judge.get("model") else ""
    label = f"Judged by {names.get(judge['answered_by'], judge['answered_by'])}{model}"
    if judge.get("fallback_reason"):
        label += f", because {judge['fallback_reason']}"
    return label


def _expected(case: dict[str, Any], profile_version: str, all_regions: bool) -> str:
    if profile_version == "v3" and case.get("expected_v3"):
        return str(case["expected_v3"])
    return str(case.get("expected") or "allow")


def _selected(case: dict[str, Any], policies: list[str], region: str, all_regions: bool) -> bool:
    if case.get("policy") not in policies:
        return False
    if case.get("policy") == "redress_liability" and not custom_is_deployed():
        return False
    regions = case.get("regions") or []
    if regions and not all_regions and region not in regions:
        return False
    return True


async def _actual(
    case: dict[str, Any], region: str, profile_version: str, all_regions: bool
) -> tuple[str, str, str, int]:
    """(actual, detail, judge label, measured ms) from the guard server."""
    started = time.perf_counter()
    stage = case.get("stage")
    if stage == "payment":
        result = await check_transfer(
            case["customer_id"], case["device_id"], float(case["amount"]), case["payee"]
        )
        elapsed = round((time.perf_counter() - started) * 1000)
        if result.get("error"):
            return "error", str(result.get("reason") or result["error"]), "", elapsed
        return ("block" if not result.get("allowed") else "allow"), result.get("reason") or "", "", elapsed
    checked = await check_messages(
        stage="output" if stage == "output" else "input",
        text=case.get("text") or "",
        user_text=case.get("user") or "",
        region=region,
        profile_version=profile_version,
        all_regions=all_regions,
    )
    elapsed = round((time.perf_counter() - started) * 1000)
    info = checked.get("decision") or {}
    judge = _judge_label(info.get("judge"))
    if info.get("error"):
        return "error", info["error"], judge, elapsed
    detail = info.get("message") or info.get("rule_name") or ""
    return ("block" if info.get("blocked") else "allow"), detail, judge, elapsed


def _prompt_row(case: dict[str, Any], expected: str) -> dict[str, str]:
    return {
        "id": case["id"],
        "policy": str(case.get("policy") or ""),
        "stage": str(case.get("stage") or ""),
        "text": str(case.get("text") or ""),
        "user": str(case.get("user") or ""),
        "expected": expected,
    }


def _case_row(
    case: dict[str, Any], expected: str, actual: str, detail: str, judge: str = "", elapsed_ms: int = 0
) -> dict[str, Any]:
    return {
        "case_id": case["id"],
        "policy": case["policy"],
        "stage": case.get("stage") or "",
        "expected": expected,
        "actual": actual,
        "entity": case.get("entity") or "",
        "query": case.get("text") or "",
        "detail": detail,
        "judge": judge,
        "elapsed_ms": elapsed_ms,
    }


def _begin_run(
    run_id: str,
    created: str,
    *,
    region: str,
    profile_version: str,
    all_regions: bool,
    model: str,
    policies: list[str],
    total: int,
) -> None:
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO redteam_runs
            (run_id, created, region, profile_version, all_regions, model, policies, total, blocked, misses, overblocks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
            """,
            (run_id, created, region, profile_version, int(all_regions), model, ",".join(policies), total),
        )
        conn.commit()
    finally:
        conn.close()


def _store_progress(run_id: str, rows: list[dict[str, Any]]) -> None:
    blocked = sum(1 for row in rows if row["actual"] == "block")
    misses = sum(1 for row in rows if row["expected"] == "block" and row["actual"] == "allow")
    overblocks = sum(1 for row in rows if row["expected"] == "allow" and row["actual"] == "block")
    conn = _connect()
    try:
        conn.execute("DELETE FROM redteam_cases WHERE run_id = ?", (run_id,))
        conn.executemany(INSERT_CASE, [dict(row, run_id=run_id) for row in rows])
        conn.execute(
            """
            UPDATE redteam_runs
            SET total = ?, blocked = ?, misses = ?, overblocks = ?
            WHERE run_id = ?
            """,
            (len(rows), blocked, misses, overblocks, run_id),
        )
        conn.commit()
    finally:
        conn.close()


async def stream_redteam(
    policies: list[str],
    *,
    region: str,
    profile_version: str,
    all_regions: bool,
):
    """Yield each attack as it finishes. The rules do not change while this runs."""
    cases = [case for case in load_attacks() if _selected(case, policies, region, all_regions)]
    run_id = uuid.uuid4().hex[:8]
    created = datetime.now(timezone.utc).isoformat()
    model = str(load_connection().get("model") or "")
    prompts = [_prompt_row(case, _expected(case, profile_version, all_regions)) for case in cases]
    _begin_run(
        run_id,
        created,
        region=region,
        profile_version=profile_version,
        all_regions=all_regions,
        model=model,
        policies=policies,
        total=len(cases),
    )
    yield {"type": "start", "run_id": run_id, "total": len(cases), "prompts": prompts}
    rows: list[dict[str, Any]] = []
    for index, case in enumerate(cases):
        expected = prompts[index]["expected"]
        yield {"type": "working", "id": case["id"], "index": index}
        actual, detail, judge, elapsed = await _actual(case, region, profile_version, all_regions)
        row = _case_row(case, expected, actual, detail, judge, elapsed)
        rows.append(row)
        _store_progress(run_id, rows)
        yield {
            "type": "result",
            "index": index,
            "case": row,
            "done": len(rows),
            "total": len(cases),
            "blocked": sum(1 for item in rows if item["actual"] == "block"),
            "misses": sum(1 for item in rows if item["expected"] == "block" and item["actual"] == "allow"),
            "overblocks": sum(1 for item in rows if item["expected"] == "allow" and item["actual"] == "block"),
            "errors": sum(1 for item in rows if item["actual"] == "error"),
        }
    yield {"type": "done", "run_id": run_id}


async def run_redteam(
    policies: list[str],
    *,
    region: str,
    profile_version: str,
    all_regions: bool,
) -> dict[str, Any]:
    cases = [
        case
        for case in load_attacks()
        if _selected(case, policies, region, all_regions)
    ]
    rows: list[dict[str, Any]] = []
    for case in cases:
        expected = _expected(case, profile_version, all_regions)
        actual, detail, judge, elapsed = await _actual(case, region, profile_version, all_regions)
        rows.append(_case_row(case, expected, actual, detail, judge, elapsed))
    run_id = uuid.uuid4().hex[:8]
    created = datetime.now(timezone.utc).isoformat()
    blocked = sum(1 for row in rows if row["actual"] == "block")
    misses = sum(1 for row in rows if row["expected"] == "block" and row["actual"] == "allow")
    overblocks = sum(1 for row in rows if row["expected"] == "allow" and row["actual"] == "block")
    model = str(load_connection().get("model") or "")
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO redteam_runs
            (run_id, created, region, profile_version, all_regions, model, policies, total, blocked, misses, overblocks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id, created, region, profile_version, int(all_regions), model,
                ",".join(policies), len(rows), blocked, misses, overblocks,
            ),
        )
        conn.executemany(INSERT_CASE, [dict(row, run_id=run_id) for row in rows])
        conn.commit()
    finally:
        conn.close()
    return summarize(run_id)


def _runs(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    found = conn.execute("SELECT * FROM redteam_runs ORDER BY created DESC").fetchall()
    return [dict(row) for row in found]


def _cases(conn: sqlite3.Connection, run_id: str) -> list[dict[str, Any]]:
    found = conn.execute(
        "SELECT * FROM redteam_cases WHERE run_id = ? ORDER BY id", (run_id,)
    ).fetchall()
    return [dict(row) for row in found]


def summarize(run_id: str) -> dict[str, Any]:
    conn = _connect()
    try:
        run = conn.execute("SELECT * FROM redteam_runs WHERE run_id = ?", (run_id,)).fetchone()
        if run is None:
            return {}
        rows = _cases(conn, run_id)
    finally:
        conn.close()
    by_policy: dict[str, dict[str, int]] = {}
    by_stage: dict[str, int] = {}
    by_entity: dict[str, dict[str, int]] = {}
    for row in rows:
        bucket = by_policy.setdefault(row["policy"], {"block": 0, "allow": 0, "miss": 0, "overblock": 0, "error": 0})
        bucket[row["actual"] if row["actual"] in bucket else "error"] += 1
        if row["expected"] == "block" and row["actual"] == "allow":
            bucket["miss"] += 1
        if row["expected"] == "allow" and row["actual"] == "block":
            bucket["overblock"] += 1
        if row["actual"] == "block":
            by_stage[row["stage"] or "unknown"] = by_stage.get(row["stage"] or "unknown", 0) + 1
        if row["entity"]:
            entity = by_entity.setdefault(row["entity"], {"hits": 0, "false": 0})
            if row["expected"] == "block" and row["actual"] == "block":
                entity["hits"] += 1
            if row["expected"] == "allow" and row["actual"] == "block":
                entity["false"] += 1
    misses = [row for row in rows if row["expected"] == "block" and row["actual"] == "allow"]
    overblocks = [row for row in rows if row["expected"] == "allow" and row["actual"] == "block"]
    return {
        "run": dict(run),
        "cases": rows,
        "by_policy": by_policy,
        "by_stage": by_stage,
        "by_entity": by_entity,
        "misses": misses,
        "overblocks": overblocks,
        "errors": [row for row in rows if row["actual"] == "error"],
    }


def list_runs() -> list[dict[str, Any]]:
    conn = _connect()
    try:
        return _runs(conn)
    finally:
        conn.close()


def runs_as_csv(run_id: str) -> str:
    summary = summarize(run_id)
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=["case_id", "policy", "stage", "expected", "actual", "entity", "query", "detail", "judge", "elapsed_ms"],
    )
    writer.writeheader()
    for row in summary.get("cases") or []:
        writer.writerow({key: row.get(key, "") for key in writer.fieldnames})
    return buffer.getvalue()
