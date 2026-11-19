"""Model and guard-server addresses. Saved from the Configuration screen."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from src.llm.provider import SafetyModelConfig, default_llm_config

PATH = Path(__file__).resolve().parents[2] / "guardrails" / "catalog" / "connection.yml"


def _defaults() -> dict[str, Any]:
    llm = default_llm_config()
    safety = SafetyModelConfig()
    from src.api.settings import default_guardrails_server_url

    return {
        "model": llm.model,
        "base_url": llm.base_url,
        "api_key": llm.api_key,
        "safety_mode": safety.mode,
        "llama_guard_base_url": safety.llama_guard_base_url,
        "llama_guard_model": safety.llama_guard_model,
        "llama_guard_api_key": safety.llama_guard_api_key,
        "nim_base_url": safety.nim_base_url,
        "nim_model": safety.nim_model,
        "nim_api_key": safety.nim_api_key,
        "server_url": default_guardrails_server_url(),
    }


def load_connection() -> dict[str, Any]:
    values = _defaults()
    if PATH.is_file():
        with PATH.open() as handle:
            saved = yaml.safe_load(handle) or {}
        for key, value in saved.items():
            if value not in (None, ""):
                values[key] = value
    return values


def save_connection(updates: dict[str, Any]) -> dict[str, Any]:
    current = load_connection()
    secrets = {"api_key", "llama_guard_api_key", "nim_api_key"}
    for key, value in updates.items():
        if key not in current or value is None:
            continue
        if key in secrets and value == "":
            continue
        current[key] = value
    PATH.parent.mkdir(parents=True, exist_ok=True)
    with PATH.open("w") as handle:
        yaml.safe_dump(current, handle, sort_keys=False)
    return current


def public_connection() -> dict[str, Any]:
    """Same settings for the screen, without revealing saved tokens."""
    raw = load_connection()
    hidden = ("api_key", "llama_guard_api_key", "nim_api_key")
    view = {key: value for key, value in raw.items() if key not in hidden}
    for key in hidden:
        view[f"has_{key}"] = bool(raw.get(key))
    return view
