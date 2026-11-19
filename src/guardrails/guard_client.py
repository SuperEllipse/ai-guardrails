"""The banking app calls the guard server. It does not apply the rules itself."""

from __future__ import annotations

from typing import Any

import httpx

from src.guardrails.connection import load_connection


def server_url() -> str:
    return str(load_connection().get("server_url") or "http://127.0.0.1:8001").rstrip("/")


async def check_messages(
    *,
    stage: str,
    text: str,
    user_text: str = "",
    region: str,
    profile_version: str,
    all_regions: bool,
) -> dict[str, Any]:
    if stage == "output":
        messages = [
            {"role": "user", "content": user_text or text},
            {"role": "assistant", "content": text},
        ]
        rail_types = ["output"]
    else:
        messages = [{"role": "user", "content": text}]
        rail_types = ["input"]
    url = f"{server_url()}/v1/demo-check"
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                url,
                json={
                    "messages": messages,
                    "rail_types": rail_types,
                    "region": region,
                    "profile_version": profile_version,
                    "all_regions": all_regions,
                },
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        return {
            "status": "error",
            "content": "",
            "decision": {
                "blocked": False,
                "rewrite": False,
                "message": "",
                "rule": "",
                "model_call": False,
                "label": "no model call",
                "entities": [],
                "error": f"Guard server was not reachable at {url}. {exc}",
            },
        }


async def check_transfer(customer_id: str, device_id: str, amount: float, payee: str) -> dict[str, Any]:
    url = f"{server_url()}/v1/transfer-check"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                url,
                json={
                    "customer_id": customer_id,
                    "device_id": device_id,
                    "amount": amount,
                    "payee": payee,
                },
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        return {"allowed": False, "reason": f"Guard server was not reachable. {exc}", "error": str(exc)}


async def reload_server() -> dict[str, Any]:
    url = f"{server_url()}/v1/reload"
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url)
            response.raise_for_status()
            return {"reloaded": True}
    except httpx.HTTPError as exc:
        return {
            "reloaded": False,
            "detail": f"The rule file was saved, but the guard server did not reload. {exc}",
        }
