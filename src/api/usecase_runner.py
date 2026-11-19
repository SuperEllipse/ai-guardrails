"""Run one use-case example. The guarded path always asks the guard server."""

from __future__ import annotations

import asyncio
from typing import Any

from src.guardrails.connection import load_connection
from src.guardrails.guard_client import check_messages, check_transfer
from src.guardrails.written_rules import custom_is_deployed
from src.llm.provider import LLMConfig, get_llm_config


def _step(step_id: str, state: str, detail: str = "") -> dict[str, str]:
    return {"id": step_id, "state": state, "detail": detail}


def _llm_config() -> LLMConfig:
    cfg = load_connection()
    return get_llm_config(
        provider="caiis" if "openai.com" not in str(cfg.get("base_url") or "") else "openai",
        api_key=cfg.get("api_key") or "",
        base_url=cfg.get("base_url") or "",
        model=cfg.get("model") or "",
    )


async def _draft_from_agents(query: str) -> str:
    from src.agents.banking_crew import run_banking_crew

    text, _trace = await asyncio.to_thread(run_banking_crew, query, _llm_config())
    return text


async def run_usecase(
    example: dict[str, Any],
    *,
    region: str,
    profile_version: str,
    all_regions: bool,
) -> dict[str, Any]:
    query = example["query"]

    async def unguarded_draft() -> tuple[str, str, str]:
        if example.get("kind") == "fixed_draft":
            return (
                str(example.get("draft") or ""),
                "done",
                "Using the prepared draft so the output check is easy to see.",
            )
        if example.get("kind") == "payment":
            transfer = example["transfer"]
            return (
                f"I'll transfer ${transfer['amount']} to {transfer['payee']} "
                f"from {transfer['customer_id']}.",
                "done",
                "The example proposes initiate_transfer.",
            )
        return (
            await _draft_from_agents(query),
            "done",
            "The agents wrote this draft for the left column.",
        )

    input_check, (draft, agents_state, agents_detail) = await asyncio.gather(
        check_messages(
            stage="input",
            text=query,
            region=region,
            profile_version=profile_version,
            all_regions=all_regions,
        ),
        unguarded_draft(),
    )
    input_info = input_check.get("decision") or {}
    input_error = input_info.get("error") or ""
    input_blocked = bool(input_info.get("blocked")) and not input_error

    steps = [
        _step("customer", "done", query),
        _step("input", "done", input_info.get("label") or "input check"),
    ]

    if input_error:
        steps.append(_step("agents", "skipped", "Not used on the guarded path."))
        steps.append(_step("output", "skipped", ""))
        steps.append(_step("reply", "done", "The guard server could not be reached."))
        return _payload(
            example, draft, input_error, "error", steps, input_info, None, region, profile_version, all_regions
        )

    if input_blocked:
        steps.append(_step("agents", "skipped", "No answer was written."))
        steps.append(_step("output", "skipped", ""))
        steps.append(_step("reply", "done", input_info.get("message") or "Blocked"))
        return _payload(
            example,
            draft,
            input_info.get("message") or "Blocked",
            "input_blocked",
            steps,
            input_info,
            None,
            region,
            profile_version,
            all_regions,
        )

    steps.append(_step("agents", agents_state, agents_detail))

    payment_view = None
    if example.get("kind") == "payment":
        transfer = example["transfer"]
        payment_view = await check_transfer(
            transfer["customer_id"],
            transfer["device_id"],
            float(transfer["amount"]),
            transfer["payee"],
        )
        if payment_view.get("error"):
            steps.append(_step("payment", "done", payment_view["error"]))
            steps.append(_step("output", "skipped", ""))
            steps.append(_step("reply", "done", ""))
            return _payload(
                example, draft, payment_view["error"], "error", steps, input_info, payment_view,
                region, profile_version, all_regions,
            )
        if not payment_view.get("allowed"):
            steps.append(_step("payment", "done", payment_view.get("reason") or "Blocked"))
            steps.append(_step("output", "skipped", ""))
            message = f"I can't send that transfer. {payment_view.get('reason') or ''}".strip()
            steps.append(_step("reply", "done", message))
            return _payload(
                example, draft, message, "payment_blocked", steps, input_info, payment_view,
                region, profile_version, all_regions,
            )
        steps.append(_step("payment", "done", payment_view.get("reason") or "Allowed"))

    output_check = await check_messages(
        stage="output",
        text=draft,
        user_text=query,
        region=region,
        profile_version=profile_version,
        all_regions=all_regions,
    )
    output_info = output_check.get("decision") or {}
    if output_info.get("error"):
        steps.append(_step("output", "done", output_info["error"]))
        steps.append(_step("reply", "done", ""))
        return _payload(
            example, draft, output_info["error"], "error", steps, input_info, payment_view,
            region, profile_version, all_regions, output_info,
        )
    if output_info.get("blocked"):
        label = "replaced" if output_info.get("rewrite") else "blocked"
        steps.append(_step("output", "done", label))
        message = output_info.get("message") or "Blocked"
        steps.append(_step("reply", "done", message))
        return _payload(
            example, draft, message, "output_caught", steps, input_info, payment_view,
            region, profile_version, all_regions, output_info,
        )

    steps.append(_step("output", "done", "allowed"))
    steps.append(_step("reply", "done", draft))
    if example.get("id") == "refund" and not custom_is_deployed():
        path = "refund_pending"
    elif payment_view:
        path = "payment_allowed"
    else:
        path = "happy"
    return _payload(
        example, draft, draft, path, steps, input_info, payment_view,
        region, profile_version, all_regions, output_info,
    )


def _payload(
    example: dict[str, Any],
    unguarded: str,
    guarded: str,
    path: str,
    steps: list[dict[str, str]],
    input_info: dict[str, Any],
    payment: dict[str, Any] | None,
    region: str,
    profile_version: str,
    all_regions: bool,
    output_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "example_id": example["id"],
        "area": example["area"],
        "title": example["title"],
        "query": example["query"],
        "unguarded_response": unguarded,
        "guarded_response": guarded,
        "path": path,
        "steps": steps,
        "input": input_info,
        "output": output_info or {},
        "payment": payment,
        "region": region,
        "profile_version": profile_version,
        "all_regions": all_regions,
        "custom_deployed": custom_is_deployed(),
    }
