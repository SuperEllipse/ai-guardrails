"""Contract tests for the live risk test backend. Stubs live only in this file."""

from __future__ import annotations

import asyncio
import sqlite3
from typing import Any

import pytest

from src.api import usecase_runner
from src.api.demo_examples import EXAMPLES, draft_for, expected_for, query_for
from src.guardrails import audit_log, connection, pii_screen, written_rules
from src.simulation import redteam


def _example(example_id: str) -> dict[str, Any]:
    return next(item for item in EXAMPLES if item["id"] == example_id)


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


def test_parse_needs_block_line() -> None:
    assert written_rules._parse("safe", {"commitments"}) is None
    assert written_rules._parse("yes", {"commitments"}) is None
    assert written_rules._parse("Block: Yes\nRule: commitments", {"commitments", "x"}) == (True, "commitments")


def test_judge_fallback_is_declared(monkeypatch: pytest.MonkeyPatch) -> None:
    replies = iter(["unsafe\nS2", "Block: Yes\nRule: commitments"])

    async def fake_ask(prompt: str, **kwargs: Any) -> str:
        return next(replies)

    monkeypatch.setattr(written_rules, "_ask_model", fake_ask)
    monkeypatch.setattr(written_rules, "load_connection", lambda: {
        "safety_mode": "llama_guard",
        "llama_guard_base_url": "https://guard.example/v1",
        "llama_guard_model": "meta-llama/Llama-Guard-3-8B",
        "base_url": "https://answer.example/v1",
        "model": "nvidia/answer",
    })
    rules = [{"id": "commitments", "name": "Commitments", "text": "x", "stages": ["input"]}]
    result = _run(written_rules.judge_text("Lock my rate", "input", rules=rules))
    assert result["blocked"] is True
    assert result["judge"]["answered_by"] == "answer_model"
    assert result["judge"]["model"] == "nvidia/answer"
    assert "Llama Guard" in result["judge"]["fallback_reason"]


def test_judge_error_is_not_a_pass(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing(prompt: str, **kwargs: Any) -> str:
        raise RuntimeError("boom")

    monkeypatch.setattr(written_rules, "_ask_model", failing)
    monkeypatch.setattr(written_rules, "load_connection", lambda: {"safety_mode": "self_check", "base_url": "https://a.example/v1", "model": "m"})
    rules = [{"id": "commitments", "name": "Commitments", "text": "x", "stages": ["input"]}]
    result = _run(written_rules.judge_text("hi", "input", rules=rules))
    assert result["error"]
    assert result["judge"]["answered_by"] == ""


def _stub_guard(monkeypatch: pytest.MonkeyPatch, *, output_blocked: bool, agents_text: str = "Live reply") -> list[str]:
    calls: list[str] = []

    async def fake_check(*, stage: str, text: str, user_text: str = "", **kwargs: Any) -> dict[str, Any]:
        calls.append(f"{stage}:{text}")
        blocked = output_blocked and stage == "output" and text != agents_text
        return {"status": "ok", "decision": {"blocked": blocked, "message": "Safe reply" if blocked else "", "judge": {"answered_by": "answer_model"}}}

    async def fake_agents(query: str) -> str:
        return agents_text

    monkeypatch.setattr(usecase_runner, "check_messages", fake_check)
    monkeypatch.setattr(usecase_runner, "_draft_from_agents", fake_agents)
    return calls


def test_scripted_draft_has_live_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _stub_guard(monkeypatch, output_blocked=True)
    result = _run(usecase_runner.run_usecase(_example("pii-leak"), region="US", profile_version="v1", all_regions=False))
    assert result["draft_source"] == "scripted"
    assert result["path"] == "output_caught"
    assert result["outcome"] == "as_expected"
    assert result["live_answer"]["text"] == "Live reply"
    assert result["live_answer"]["output"]["blocked"] is False
    assert "output:Live reply" in calls
    assert set(result["timings_ms"]) >= {"input", "output", "total"}


def test_test_prompt_draft_uses_the_example_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _stub_guard(monkeypatch, output_blocked=True)
    prompts: list[str] = []

    async def fake_test_prompt(query: str, system_prompt: str) -> str:
        prompts.append(system_prompt)
        return "Biased reply"

    monkeypatch.setattr(usecase_runner, "_draft_from_test_prompt", fake_test_prompt)
    example = _example("fair")
    result = _run(usecase_runner.run_usecase(example, region="US", profile_version="v1", all_regions=False))
    assert prompts == [example["draft_prompt"]]
    assert result["draft_source"] == "test_prompt"
    assert result["unguarded_response"] == "Biased reply"
    assert result["path"] == "output_caught"
    assert result["live_answer"]["text"] == "Live reply"
    assert "output:Biased reply" in calls


def test_gap_comes_from_the_real_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_guard(monkeypatch, output_blocked=False)
    result = _run(usecase_runner.run_usecase(_example("refund"), region="US", profile_version="v1", all_regions=False))
    assert result["path"] == "happy"
    assert result["outcome"] == "gap"


def test_answer_model_error_is_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_guard(monkeypatch, output_blocked=False)

    async def broken(query: str) -> str:
        raise RuntimeError("HTTP 401")

    monkeypatch.setattr(usecase_runner, "_draft_from_agents", broken)
    result = _run(usecase_runner.run_usecase(_example("happy"), region="US", profile_version="v1", all_regions=False))
    assert result["outcome"] == "error"
    assert result["unguarded_response"] == ""
    assert "did not answer" in result["error"]


def test_national_id_matches_the_region() -> None:
    national_id = _example("pii-national-id")
    assert "SSN" in query_for(national_id, "US")
    assert "NRIC" in query_for(national_id, "SG")
    for region in ("US", "SG", "IN", "AU", "EU"):
        for version in ("v1", "v2", "v3"):
            assert expected_for(national_id, region=region, profile_version=version, all_regions=False) == "block"
            assert pii_screen.screen_text(query_for(national_id, region), region, version, False)["blocked"]


def test_personal_data_prompts_differ_by_region() -> None:
    for example_id in ("pii-national-id", "pii-name-address"):
        example = _example(example_id)
        assert len({query_for(example, region) for region in ("US", "SG", "IN", "AU", "EU")}) == 5
    leak = _example("pii-leak")
    assert len({draft_for(leak, region) for region in ("US", "SG", "IN", "AU", "EU")}) == 5
    ids = [case for case in redteam.load_attacks() if case.get("policy") == "sensitive_data" and case.get("regions")]
    for region in ("US", "SG", "IN", "AU", "EU"):
        mine = [case for case in ids if region in case["regions"]]
        assert len(mine) == 1 and mine[0]["expected"] == "block"
        assert pii_screen.screen_text(mine[0]["text"], region, "v3", False)["blocked"]


def test_audit_log_migrates_old_table(tmp_path: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "log.db"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE guardrail_log (id TEXT PRIMARY KEY, created TEXT, source TEXT, input_prompt TEXT, output_response TEXT, violation TEXT, reason TEXT)")
        conn.execute("INSERT INTO guardrail_log VALUES ('GLOLD', 't', 'compliance', 'q', 'r', 'no', '')")
    monkeypatch.setattr(audit_log, "DB_PATH", db)
    row = audit_log.record_log(source="compliance", input_prompt="q", output_response="", violation="yes", reason="x", judge={"answered_by": "nim"}, outcome="as_expected")
    assert audit_log.get_log(row["id"])["judge"] == {"answered_by": "nim"}
    assert audit_log.get_log("GLOLD")["outcome"] is None


def test_save_connection_keeps_only_overrides(tmp_path: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(connection, "PATH", tmp_path / "connection.yml")
    monkeypatch.setattr(connection, "_defaults", lambda: {"model": "m", "api_key": "session-token", "server_url": "http://127.0.0.1:8001"})
    connection.save_connection({"model": "m", "api_key": "", "server_url": "http://other:8001"})
    text = (tmp_path / "connection.yml").read_text()
    assert "session-token" not in text and "model" not in text and "other" in text
    connection.save_connection({}, reset=["server_url"])
    assert not (tmp_path / "connection.yml").exists()


def test_id_tester_reasons() -> None:
    hits = pii_screen.explain_text("My NRIC is S1234567A", "SG", "v3", False)
    assert any(hit["reason"] == "checksum_failed" and not hit["matched"] for hit in hits)
    hits = pii_screen.explain_text("Code S1234567A", "SG", "v2", False)
    assert any(hit["reason"] == "no_nearby_word" for hit in hits)
