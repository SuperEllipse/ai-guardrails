"""Run one live risk test. Every verdict comes from the guard server.

The draft is the agents' live answer; for `scripted_draft` examples a fixed risky draft
that is labelled as scripted; or for `test_prompt_draft` examples a real draft from the
answer model told to answer badly, labelled as such. These tests also call the agents
live in the same request and send that real answer through the output check.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from src.api.demo_examples import draft_for, expected_for, query_for
from src.guardrails.connection import load_connection
from src.guardrails.guard_client import check_messages, check_transfer
from src.guardrails.written_rules import custom_is_deployed
from src.llm.provider import LLMConfig, get_llm_config

BLOCKING_PATHS = {"input_blocked", "output_caught", "payment_blocked"}


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

    text, _trace = await asyncio.to_thread(run_banking_crew, query, _llm_config(), raise_on_error=True)
    if not text.strip():
        raise RuntimeError("The answer model returned an empty reply.")
    return text


async def _draft_from_test_prompt(query: str, system_prompt: str) -> str:
    """One call to the answer model with the example's test instructions."""
    cfg = _llm_config()
    body: dict[str, Any] = {
        "model": cfg.model,
        "temperature": 0.7,
        "max_tokens": 300,
        "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": query}],
        # Reasoning models otherwise put their thinking in the reply.
        "chat_template_kwargs": {"enable_thinking": False},
    }
    headers = {"Authorization": f"Bearer {cfg.api_key or 'not-needed'}"}
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(f"{cfg.base_url}/chat/completions", headers=headers, json=body)
        if response.status_code in (400, 500):
            body.pop("chat_template_kwargs")
            response = await client.post(f"{cfg.base_url}/chat/completions", headers=headers, json=body)
        response.raise_for_status()
        text = str(response.json()["choices"][0]["message"].get("content") or "")
    if not text.strip():
        raise RuntimeError("The answer model returned an empty reply.")
    return text.strip()


def _ms(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)


async def _agents(query: str) -> tuple[str, str, int]:
    started = time.perf_counter()
    try:
        return await _draft_from_agents(query), "", _ms(started)
    except Exception as exc:
        return "", f"The answer model did not answer: {exc}", _ms(started)


async def _guard(stage: str, text: str, query: str, settings: dict[str, Any]) -> tuple[dict[str, Any], int]:
    started = time.perf_counter()
    checked = await check_messages(stage=stage, text=text, user_text=query, **settings)
    info = dict(checked.get("decision") or {})
    if checked.get("status") == "error" and not info.get("error"):
        info["error"] = "The guard server returned an error without a reason."
    return info, _ms(started)


async def _live_answer(example: dict[str, Any], query: str, settings: dict[str, Any]) -> dict[str, Any]:
    """The real answer to the same message, with its own output check."""
    text, error, agents_ms = await _agents(query)
    result: dict[str, Any] = {
        "text": text,
        "output": None,
        "error": error,
        "shown_only": example.get("stage") == "payment",
        "timings_ms": {"agents": agents_ms},
    }
    if error or result["shown_only"]:
        return result
    output, output_ms = await _guard("output", text, query, settings)
    result["output"] = output
    result["timings_ms"]["output"] = output_ms
    if output.get("error"):
        result["error"] = output["error"]
    return result


async def run_usecase(
    example: dict[str, Any],
    *,
    region: str,
    profile_version: str,
    all_regions: bool,
) -> dict[str, Any]:
    started = time.perf_counter()
    query = query_for(example, region)
    kind = example.get("kind")
    scripted = kind == "scripted_draft"
    test_prompt = kind == "test_prompt_draft"
    settings = {"region": region, "profile_version": profile_version, "all_regions": all_regions}
    timings: dict[str, int] = {}

    async def draft() -> tuple[str, str]:
        if scripted:
            return draft_for(example, region), ""
        if test_prompt:
            draft_started = time.perf_counter()
            try:
                return await _draft_from_test_prompt(query, str(example["draft_prompt"])), ""
            except Exception as exc:
                return "", f"The answer model did not answer: {exc}"
            finally:
                timings["agents"] = _ms(draft_started)
        text, error, agents_ms = await _agents(query)
        timings["agents"] = agents_ms
        return text, error

    async def no_live() -> None:
        return None

    (input_info, input_ms), (draft_text, draft_error), live = await asyncio.gather(
        _guard("input", query, "", settings),
        draft(),
        _live_answer(example, query, settings) if scripted or test_prompt else no_live(),
    )
    timings["input"] = input_ms

    payment: dict[str, Any] | None = None
    output_info: dict[str, Any] = {}
    guarded = ""
    error = ""
    error_step = ""

    if input_info.get("error"):
        path, error, error_step = "error", input_info["error"], "input"
    elif input_info.get("blocked"):
        path, guarded = "input_blocked", str(input_info.get("message") or "")
    elif draft_error:
        path, error, error_step = "error", draft_error, "agents"
    else:
        path = ""
        transfer = example.get("transfer")
        if transfer:
            payment_started = time.perf_counter()
            payment = await check_transfer(
                transfer["customer_id"],
                transfer["device_id"],
                float(transfer["amount"]),
                transfer["payee"],
            )
            timings["payment"] = _ms(payment_started)
            if payment.get("error"):
                path, error, error_step = "error", str(payment.get("reason") or payment["error"]), "payment"
            elif not payment.get("allowed"):
                path = "payment_blocked"
                guarded = f"I can't send that transfer. {payment.get('reason') or ''}".strip()
        if not path:
            output_info, timings["output"] = await _guard("output", draft_text, query, settings)
            if output_info.get("error"):
                path, error, error_step = "error", output_info["error"], "output"
            elif output_info.get("blocked"):
                path, guarded = "output_caught", str(output_info.get("message") or "")
            else:
                path = "payment_allowed" if payment else "happy"
                guarded = draft_text

    timings["total"] = _ms(started)
    expected = expected_for(example, region=region, profile_version=profile_version, all_regions=all_regions)
    if path == "error":
        actual, outcome = "error", "error"
    else:
        actual = "block" if path in BLOCKING_PATHS else "allow"
        if actual == expected:
            outcome = "as_expected"
        elif expected == "block":
            outcome = "gap"
        else:
            outcome = "overblock"

    return {
        "example_id": example["id"],
        "area_id": example.get("area_id") or "",
        "area": example["area"],
        "title": example["title"],
        "stage": example.get("stage") or "input",
        "custom": bool(example.get("custom")),
        "query": query,
        "draft_source": "scripted" if scripted else "test_prompt" if test_prompt else "live",
        "draft_prompt": str(example.get("draft_prompt") or ""),
        "unguarded_response": draft_text,
        "unguarded_error": draft_error,
        "guarded_response": guarded,
        "path": path,
        "expected": expected,
        "actual": actual,
        "outcome": outcome,
        "error": error,
        "error_step": error_step,
        "input": input_info,
        "output": output_info,
        "payment": payment,
        "live_answer": live,
        "timings_ms": timings,
        "region": region,
        "profile_version": profile_version,
        "all_regions": all_regions,
        "custom_deployed": custom_is_deployed(),
    }
