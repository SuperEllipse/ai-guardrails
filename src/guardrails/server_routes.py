"""Extra routes on the guard server: a check, a payment check, and reload."""

from __future__ import annotations

import time
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from src.guardrails.catalog_build import CONFIG_ID, build_active_config
from src.guardrails.demo_state import clear_request, decision, set_scope
from src.guardrails.transfer_gate import decide_transfer


class DemoCheckRequest(BaseModel):
    messages: list[dict[str, str]] = Field(min_length=1)
    rail_types: list[str] = Field(default_factory=lambda: ["input"])
    region: str = "US"
    profile_version: str = "v1"
    all_regions: bool = False
    config_id: str = CONFIG_ID


class TransferCheckRequest(BaseModel):
    customer_id: str
    device_id: str
    amount: float
    payee: str


def mount_guard_routes(app: FastAPI) -> None:
    @app.get("/v1/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/v1/demo-check")
    async def demo_check(body: DemoCheckRequest) -> dict[str, Any]:
        from nemoguardrails.rails.llm.options import RailType
        from nemoguardrails.server.api import _get_rails

        set_scope(body.region, body.profile_version, body.all_regions)
        started = time.perf_counter()
        try:
            rails = await _get_rails([body.config_id or CONFIG_ID])
            rail_types = [RailType(item) for item in body.rail_types]
            result = await rails.check_async(messages=body.messages, rail_types=rail_types)
            info = decision()
            if info.get("error"):
                status = "error"
                content = ""
            else:
                content = info["message"] if info.get("blocked") else (result.content or "")
                status = "blocked" if info.get("blocked") else result.status.value
            elapsed = round((time.perf_counter() - started) * 1000)
            return {"status": status, "content": content, "decision": info, "elapsed_ms": elapsed}
        finally:
            clear_request()

    @app.post("/v1/transfer-check")
    async def transfer_check(body: TransferCheckRequest) -> dict[str, Any]:
        # Same rule the payment script describes. The ledger is not written here.
        return decide_transfer(body.customer_id, body.device_id, body.amount, body.payee)

    @app.post("/v1/reload")
    async def reload_rules() -> dict[str, Any]:
        build_active_config()
        from nemoguardrails.server import api as nemo_api

        nemo_api.llm_rails_instances.clear()
        return {"reloaded": True}
