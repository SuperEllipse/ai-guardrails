"""Actions the guard server's Colang scripts call."""

from __future__ import annotations

from typing import Any

from src.guardrails.demo_state import scope
from src.guardrails.pii_screen import screen_text
from src.guardrails.transfer_gate import decide_transfer
from src.guardrails.written_rules import judge_text


async def screen_pii(text: str = "", stage: str = "input", **kwargs: Any) -> bool:
    info = scope()
    result = screen_text(
        text or "",
        info.get("region", "US"),
        info.get("profile_version", "v1"),
        bool(info.get("all_regions")),
    )
    return bool(result["blocked"])


async def check_written_rules(text: str = "", stage: str = "input", **kwargs: Any) -> bool:
    result = await judge_text(text or "", stage or "input")
    # A judge that did not answer stops the flow. The caller sees the error.
    return bool(result["blocked"] or result.get("error"))


async def check_transfer_gate(
    customer_id: str = "",
    device_id: str = "",
    amount: float = 0,
    payee: str = "",
    **kwargs: Any,
) -> bool:
    info = scope()
    decision = decide_transfer(
        customer_id or info.get("customer_id", ""),
        device_id or info.get("device_id", ""),
        float(amount or info.get("amount") or 0),
        payee or info.get("payee", ""),
    )
    return bool(decision["allowed"])
