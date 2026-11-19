"""Ask each configured endpoint whether it answers. No policy check."""

from __future__ import annotations

from typing import Any

import httpx

from src.guardrails.connection import load_connection


def _saved_secret(name: str, supplied: str) -> str:
    if supplied:
        return supplied
    return str(load_connection().get(name) or "")


async def _probe_chat(*, base_url: str, model: str, api_key: str, who: str, user_only: bool) -> dict[str, Any]:
    base_url = base_url.rstrip("/")
    if not base_url or not model:
        return {"ok": False, "detail": f"Enter the address and model name for {who}."}
    messages = [{"role": "user", "content": "Reply with the single word ready."}]
    body: dict[str, Any] = {"model": model, "temperature": 0, "max_tokens": 8, "messages": messages}
    if not user_only:
        body["chat_template_kwargs"] = {"enable_thinking": False}
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key or 'not-needed'}"},
                json=body,
            )
            if response.status_code in (400, 500) and not user_only:
                body.pop("chat_template_kwargs", None)
                response = await client.post(
                    f"{base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key or 'not-needed'}"},
                    json=body,
                )
            response.raise_for_status()
            response.json()["choices"][0]
    except httpx.HTTPStatusError as exc:
        return {"ok": False, "detail": f"{who} answered with HTTP {exc.response.status_code}."}
    except (httpx.RequestError, KeyError, ValueError):
        return {"ok": False, "detail": f"Could not reach {who} at {base_url}."}
    return {"ok": True, "detail": f"Test successful. {who} answered."}


async def _probe_guard(server_url: str) -> dict[str, Any]:
    server_url = server_url.rstrip("/")
    if not server_url:
        return {"ok": False, "detail": "Enter the guard server address."}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{server_url}/v1/health")
    except httpx.RequestError:
        return {"ok": False, "detail": f"Could not reach the guard server at {server_url}."}
    if response.status_code == 404:
        return {"ok": False, "detail": "The address answered, but it is not this guard server."}
    if response.status_code >= 400:
        return {"ok": False, "detail": f"The guard server answered with HTTP {response.status_code}."}
    return {"ok": True, "detail": "Test successful. The guard server is reachable."}


async def probe_target(target: str, fields: dict[str, Any]) -> dict[str, Any]:
    if target == "answer":
        return await _probe_chat(
            base_url=str(fields.get("base_url") or ""),
            model=str(fields.get("model") or ""),
            api_key=_saved_secret("api_key", str(fields.get("api_key") or "")),
            who="The answer model",
            user_only=False,
        )
    if target == "llama_guard":
        return await _probe_chat(
            base_url=str(fields.get("llama_guard_base_url") or ""),
            model=str(fields.get("llama_guard_model") or ""),
            api_key=_saved_secret("llama_guard_api_key", str(fields.get("llama_guard_api_key") or "")),
            who="Llama Guard",
            user_only=True,
        )
    if target == "nim":
        return await _probe_chat(
            base_url=str(fields.get("nim_base_url") or ""),
            model=str(fields.get("nim_model") or ""),
            api_key=_saved_secret("nim_api_key", str(fields.get("nim_api_key") or "")),
            who="The NVIDIA safety model",
            user_only=False,
        )
    if target == "guard":
        return await _probe_guard(str(fields.get("server_url") or ""))
    return {"ok": False, "detail": "Unknown connection."}
