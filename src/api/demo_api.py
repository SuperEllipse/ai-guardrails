"""Configuration, use-case, and red-team routes for the banking app."""

from __future__ import annotations

import json
import shutil
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field

from src.api.demo_examples import EXAMPLES
from src.api.usecase_runner import run_usecase
from src.guardrails.audit_log import get_log, list_logs, record_log
from src.guardrails.catalog_build import build_active_config
from src.guardrails.connection import public_connection, save_connection
from src.guardrails.connection_probe import probe_target
from src.guardrails.guard_client import reload_server
from src.guardrails.profile_view import profile_catalog
from src.guardrails.written_rules import (
    CUSTOM_SOURCE,
    DEPLOYED,
    custom_is_deployed,
    judge_text,
    load_rule_file,
)
from src.simulation.redteam import list_runs, load_attacks, run_redteam, runs_as_csv, stream_redteam, summarize

CATALOG = Path(__file__).resolve().parents[2] / "guardrails" / "catalog"
POLICIES = [
    {"id": "unlicensed_advice", "label": "Unlicensed advice"},
    {"id": "commitments", "label": "Commitments and disclosures"},
    {"id": "payments", "label": "Payments"},
    {"id": "sensitive_data", "label": "Sensitive data"},
    {"id": "fair_dealing", "label": "Fair dealing"},
]


class ConnectionUpdate(BaseModel):
    model: str = ""
    base_url: str = ""
    api_key: str = ""
    safety_mode: str = ""
    llama_guard_base_url: str = ""
    llama_guard_model: str = ""
    llama_guard_api_key: str = ""
    nim_base_url: str = ""
    nim_model: str = ""
    nim_api_key: str = ""
    server_url: str = ""


class CustomRuleUpdate(BaseModel):
    policy: str
    message_default: str
    message_au: str
    message_sg: str
    should_block: list[str] = Field(default_factory=list)
    should_pass: list[str] = Field(default_factory=list)


class UseCaseRequest(BaseModel):
    example_id: str
    region: str = "US"
    profile_version: str = "v1"
    all_regions: bool = False


class RedTeamRequest(BaseModel):
    policies: list[str] = Field(default_factory=list)
    region: str = "US"
    profile_version: str = "v1"
    all_regions: bool = False


class ProbeRequest(BaseModel):
    target: str
    model: str = ""
    base_url: str = ""
    api_key: str = ""
    llama_guard_base_url: str = ""
    llama_guard_model: str = ""
    llama_guard_api_key: str = ""
    nim_base_url: str = ""
    nim_model: str = ""
    nim_api_key: str = ""
    server_url: str = ""


def _violation(result: dict[str, Any]) -> tuple[str, str]:
    path = result.get("path")
    if path == "input_blocked":
        info = result.get("input") or {}
        return "yes", _reason_text(info.get("rule"), info.get("message"))
    if path == "output_caught":
        info = result.get("output") or {}
        return "yes", _reason_text(info.get("rule"), info.get("message"))
    if path == "payment_blocked":
        payment = result.get("payment") or {}
        return "yes", str(payment.get("reason") or "The payment check stopped the transfer.")
    return "no", ""


def _reason_text(rule: Any, message: Any) -> str:
    parts = [str(part).strip() for part in (rule, message) if str(part or "").strip()]
    return ". ".join(parts) or "The guard server stopped this text."


def _read_custom() -> dict[str, Any]:
    rule = load_rule_file(CUSTOM_SOURCE)
    tests = rule.get("tests") or {}
    messages = rule.get("messages") or {}
    return {
        "id": rule.get("id"),
        "name": rule.get("name"),
        "policy": rule.get("text") or "",
        "on_violation": rule.get("on_violation") or "rewrite",
        "message_default": messages.get("default") or "",
        "message_au": messages.get("AU") or "",
        "message_sg": messages.get("SG") or "",
        "should_block": list(tests.get("should_block") or []),
        "should_pass": list(tests.get("should_pass") or []),
        "deployed": custom_is_deployed(),
    }


def _write_custom(body: CustomRuleUpdate) -> None:
    current = load_rule_file(CUSTOM_SOURCE)
    current["policy"] = body.policy
    current["text"] = body.policy
    current["messages"] = {"default": body.message_default, "AU": body.message_au, "SG": body.message_sg}
    current["tests"] = {
        "should_block": [line for line in body.should_block if line.strip()],
        "should_pass": [line for line in body.should_pass if line.strip()],
    }
    with CUSTOM_SOURCE.open("w") as handle:
        yaml.safe_dump(current, handle, sort_keys=False)


def _server_files() -> dict[str, str]:
    files: dict[str, str] = {}
    for path in sorted((CATALOG / "flows").glob("*.co")):
        files[path.name] = path.read_text()
    for path in sorted((CATALOG / "regions").glob("*.yml")):
        files[f"regions/{path.name}"] = path.read_text()
    return files


def register_demo_routes(app: FastAPI) -> None:
    @app.get("/api/demo/config")
    async def demo_config() -> dict[str, Any]:
        policies = list(POLICIES)
        if custom_is_deployed():
            policies.append({"id": "redress_liability", "label": "Custom refund rule"})
        return {
            "connection": public_connection(),
            "custom_rule": _read_custom(),
            "files": _server_files(),
            "examples": EXAMPLES,
            "policies": policies,
            "regions": [
                {"id": "SG", "label": "Singapore"},
                {"id": "AU", "label": "Australia"},
                {"id": "US", "label": "United States"},
                {"id": "EU", "label": "Europe"},
                {"id": "IN", "label": "India"},
            ],
        }

    @app.put("/api/demo/connection")
    async def update_connection(body: ConnectionUpdate) -> dict[str, Any]:
        saved = save_connection(body.model_dump())
        build_active_config()
        reloaded = await reload_server()
        return {"connection": public_connection(), "reload": reloaded, "saved_model": saved.get("model")}

    @app.put("/api/demo/custom-rule")
    async def update_custom_rule(body: CustomRuleUpdate) -> dict[str, Any]:
        _write_custom(body)
        return _read_custom()

    @app.post("/api/demo/custom-rule/test")
    async def test_custom_rule() -> dict[str, Any]:
        rule = load_rule_file(CUSTOM_SOURCE)
        results = []
        passed = True
        for bucket, expect_block in (("should_block", True), ("should_pass", False)):
            for sentence in (rule.get("tests") or {}).get(bucket) or []:
                judged = await judge_text(sentence, "output", rules=[rule], region="US")
                ok = bool(judged.get("blocked")) is expect_block and not judged.get("error")
                passed = passed and ok
                actual = "error" if judged.get("error") else ("block" if judged.get("blocked") else "allow")
                message = judged.get("message") or judged.get("error") or ""
                results.append(
                    {
                        "sentence": sentence,
                        "expected": "block" if expect_block else "allow",
                        "actual": actual,
                        "ok": ok,
                        "message": message,
                    }
                )
                record_log(
                    source="custom_rule",
                    input_prompt=sentence,
                    output_response=message or ("Blocked" if actual == "block" else "Allowed"),
                    violation="yes" if actual == "block" else "no",
                    reason=message if actual == "block" else "",
                )
        return {"passed": passed, "results": results}

    @app.post("/api/demo/custom-rule/deploy")
    async def deploy_custom_rule() -> dict[str, Any]:
        if not CUSTOM_SOURCE.is_file():
            raise HTTPException(status_code=404, detail="Custom rule file is missing.")
        DEPLOYED.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(CUSTOM_SOURCE, DEPLOYED)
        build_active_config()
        reloaded = await reload_server()
        return {"deployed": True, "reload": reloaded}

    @app.post("/api/demo/usecase")
    async def usecase(body: UseCaseRequest) -> dict[str, Any]:
        example = next((item for item in EXAMPLES if item["id"] == body.example_id), None)
        if example is None:
            raise HTTPException(status_code=404, detail="Unknown example.")
        result = await run_usecase(
            example,
            region=body.region,
            profile_version=body.profile_version,
            all_regions=body.all_regions,
        )
        violation, reason = _violation(result)
        record_log(
            source="compliance",
            input_prompt=str(result.get("query") or ""),
            output_response=str(result.get("guarded_response") or ""),
            violation=violation,
            reason=reason,
        )
        return result

    @app.post("/api/demo/redteam")
    async def redteam(body: RedTeamRequest) -> dict[str, Any]:
        policies = body.policies or [item["id"] for item in POLICIES]
        if "redress_liability" in policies and not custom_is_deployed():
            policies = [item for item in policies if item != "redress_liability"]
        return await run_redteam(
            policies,
            region=body.region,
            profile_version=body.profile_version,
            all_regions=body.all_regions,
        )

    @app.post("/api/demo/redteam/stream")
    async def redteam_stream(body: RedTeamRequest) -> StreamingResponse:
        policies = body.policies or [item["id"] for item in POLICIES]
        if "redress_liability" in policies and not custom_is_deployed():
            policies = [item for item in policies if item != "redress_liability"]

        async def lines() -> AsyncIterator[str]:
            async for event in stream_redteam(
                policies,
                region=body.region,
                profile_version=body.profile_version,
                all_regions=body.all_regions,
            ):
                yield json.dumps(event) + "\n"

        return StreamingResponse(lines(), media_type="application/x-ndjson")

    @app.get("/api/demo/redteam/runs")
    async def redteam_runs() -> list[dict[str, Any]]:
        return list_runs()

    @app.get("/api/demo/redteam/runs/{run_id}")
    async def redteam_run(run_id: str) -> dict[str, Any]:
        summary = summarize(run_id)
        if not summary:
            raise HTTPException(status_code=404, detail="Unknown run.")
        return summary

    @app.get("/api/demo/redteam/runs/{run_id}.csv", response_class=PlainTextResponse)
    async def redteam_csv(run_id: str) -> str:
        if not summarize(run_id):
            raise HTTPException(status_code=404, detail="Unknown run.")
        return runs_as_csv(run_id)

    @app.get("/api/demo/attacks")
    async def attacks() -> dict[str, Any]:
        return {"attacks": load_attacks(), "custom_deployed": custom_is_deployed()}

    @app.get("/api/demo/profiles")
    async def profiles() -> dict[str, Any]:
        return profile_catalog()

    @app.post("/api/demo/connection/test")
    async def test_connection(body: ProbeRequest) -> dict[str, Any]:
        return await probe_target(body.target, body.model_dump())

    @app.get("/api/demo/logs")
    async def logs() -> list[dict[str, Any]]:
        return list_logs()

    @app.get("/api/demo/logs/{log_id}")
    async def log_entry(log_id: str) -> dict[str, Any]:
        row = get_log(log_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Unknown log entry.")
        return row
