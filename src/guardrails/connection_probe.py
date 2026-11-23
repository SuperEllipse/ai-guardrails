"""Ask each configured endpoint whether it answers. No policy check."""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlparse

import httpx

from src.guardrails.connection import load_connection


def _saved_secret(name: str, supplied: str) -> str:
    if supplied:
        return supplied
    return str(load_connection().get(name) or "")


def _field(fields: dict[str, Any], name: str) -> str:
    return str(fields.get(name) or load_connection().get(name) or "")


def _ms(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)


def _took(ms: int) -> str:
    return f"{ms} ms" if ms < 1000 else f"{ms / 1000:.1f} s"


async def _probe_chat(*, base_url: str, model: str, api_key: str, who: str, user_only: bool) -> dict[str, Any]:
    base_url = base_url.rstrip("/")
    host = urlparse(base_url).hostname or base_url
    result: dict[str, Any] = {"ok": False, "endpoint": host, "model": model, "status": None, "latency_ms": None}
    if not base_url or not model:
        return {**result, "detail": f"Enter the address and model name for {who}."}
    messages = [{"role": "user", "content": "Reply with the single word ready."}]
    body: dict[str, Any] = {"model": model, "temperature": 0, "max_tokens": 8, "messages": messages}
    if not user_only:
        body["chat_template_kwargs"] = {"enable_thinking": False}
    headers = {"Authorization": f"Bearer {api_key or 'not-needed'}"}
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(f"{base_url}/chat/completions", headers=headers, json=body)
            if response.status_code in (400, 500) and not user_only:
                body.pop("chat_template_kwargs", None)
                response = await client.post(f"{base_url}/chat/completions", headers=headers, json=body)
            result["status"] = response.status_code
            response.raise_for_status()
            payload = response.json()
            payload["choices"][0]
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        result["latency_ms"] = _ms(started)
        if code == 401:
            detail = f"{who} refused the request (HTTP 401 at {host}). Check the token and test again."
        elif code == 404:
            detail = f"{who} was not found (HTTP 404 at {host}). Check the address and model name."
        else:
            detail = f"{who} answered with HTTP {code} at {host}."
        return {**result, "detail": detail}
    except httpx.RequestError as exc:
        return {**result, "latency_ms": _ms(started), "detail": f"Could not reach {who} at {host}. {exc.__class__.__name__}."}
    except (KeyError, IndexError, ValueError):
        return {**result, "latency_ms": _ms(started), "detail": f"{who} answered at {host}, but not with a chat reply."}
    latency = _ms(started)
    answered = str(payload.get("model") or model)
    return {
        **result,
        "ok": True,
        "latency_ms": latency,
        "model": answered,
        "detail": f"{who} answered in {_took(latency)} ({answered}).",
    }


async def _probe_guard(server_url: str) -> dict[str, Any]:
    server_url = server_url.rstrip("/")
    result: dict[str, Any] = {"ok": False, "endpoint": server_url, "model": "", "status": None, "latency_ms": None}
    if not server_url:
        return {**result, "detail": "Enter the guard server address."}
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{server_url}/v1/health")
    except httpx.RequestError:
        return {**result, "latency_ms": _ms(started), "detail": f"Could not reach the guard server at {server_url}."}
    latency = _ms(started)
    result.update({"status": response.status_code, "latency_ms": latency})
    if response.status_code == 404:
        return {**result, "detail": f"{server_url} answered with HTTP 404. It is not this guard server."}
    if response.status_code >= 400:
        return {**result, "detail": f"The guard server answered with HTTP {response.status_code}."}
    return {**result, "ok": True, "detail": f"The guard server answered in {_took(latency)}."}


async def probe_target(target: str, fields: dict[str, Any]) -> dict[str, Any]:
    if target == "answer":
        return await _probe_chat(
            base_url=_field(fields, "base_url"),
            model=_field(fields, "model"),
            api_key=_saved_secret("api_key", str(fields.get("api_key") or "")),
            who="The answer model",
            user_only=False,
        )
    if target == "llama_guard":
        return await _probe_chat(
            base_url=_field(fields, "llama_guard_base_url"),
            model=_field(fields, "llama_guard_model"),
            api_key=_saved_secret("llama_guard_api_key", str(fields.get("llama_guard_api_key") or "")),
            who="Llama Guard",
            user_only=True,
        )
    if target == "nim":
        return await _probe_chat(
            base_url=_field(fields, "nim_base_url"),
            model=_field(fields, "nim_model"),
            api_key=_saved_secret("nim_api_key", str(fields.get("nim_api_key") or "")),
            who="NVIDIA NIM",
            user_only=False,
        )
    if target == "guard":
        return await _probe_guard(_field(fields, "server_url"))
    return {"ok": False, "detail": "Unknown connection.", "latency_ms": None}


async def probe_status() -> dict[str, Any]:
    """Probe the guard server, the answer model, and the active judge."""
    import asyncio

    cfg = load_connection()
    mode = str(cfg.get("safety_mode") or "self_check")
    judge_target = {"llama_guard": "llama_guard", "nim": "nim"}.get(mode, "answer")
    guard, answer, judge = await asyncio.gather(
        probe_target("guard", {}),
        probe_target("answer", {}),
        probe_target(judge_target, {}),
    )
    return {"guard": guard, "answer": answer, "judge": {**judge, "mode": mode}}
