"""Model and guard-server addresses.

Project environment variables are the configuration. `connection.yml` holds only
overrides saved from Setup. A token is written there only when one was typed in Setup.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

from src.llm.caiis_url import SESSION_JWT_PATH
from src.llm.provider import SafetyModelConfig, default_llm_config, detect_default_safety_mode

PATH = Path(__file__).resolve().parents[2] / "guardrails" / "catalog" / "connection.yml"
SECRETS = ("api_key", "llama_guard_api_key", "nim_api_key")

# Project environment variables behind each field.
PROJECT_VARS: dict[str, tuple[str, ...]] = {
    "model": ("CAIIS_MODEL", "CAIIS_MODEL_NAME", "OPENAI_MODEL"),
    "base_url": ("CAIIS_BASE_URL", "CAIIS_HOST", "OPENAI_BASE_URL"),
    "api_key": ("CDP_TOKEN", "OPENAI_API_KEY"),
    "safety_mode": ("DEFAULT_SAFETY_MODE",),
    "llama_guard_base_url": ("LLAMA_GUARD_BASE_URL", "LLAMA_GUARD_HOST"),
    "llama_guard_model": ("LLAMA_GUARD_MODEL", "LLAMA_GUARD_MODEL_NAME"),
    "llama_guard_api_key": ("CDP_TOKEN",),
    "nim_base_url": ("NIM_BASE_URL",),
    "nim_model": (),
    "nim_api_key": ("NVIDIA_API_KEY",),
    "server_url": ("GUARDRAILS_PORT", "GUARDRAILS_SERVER_URL", "GUARDRAILS_HOST"),
}


def _defaults() -> dict[str, Any]:
    llm = default_llm_config()
    safety = SafetyModelConfig()
    from src.api.settings import default_guardrails_server_url

    return {
        "model": llm.model,
        "base_url": llm.base_url,
        "api_key": llm.api_key,
        "safety_mode": detect_default_safety_mode(),
        "llama_guard_base_url": safety.llama_guard_base_url,
        "llama_guard_model": safety.llama_guard_model,
        "llama_guard_api_key": safety.llama_guard_api_key,
        "nim_base_url": safety.nim_base_url,
        "nim_model": safety.nim_model,
        "nim_api_key": safety.nim_api_key,
        "server_url": default_guardrails_server_url(),
    }


def _saved() -> dict[str, Any]:
    if not PATH.is_file():
        return {}
    with PATH.open() as handle:
        data = yaml.safe_load(handle) or {}
    return {key: value for key, value in data.items() if key in PROJECT_VARS and value not in (None, "")}


def load_connection() -> dict[str, Any]:
    values = _defaults()
    values.update(_saved())
    return values


def _write(saved: dict[str, Any]) -> None:
    if not saved:
        PATH.unlink(missing_ok=True)
        return
    PATH.parent.mkdir(parents=True, exist_ok=True)
    with PATH.open("w") as handle:
        yaml.safe_dump(saved, handle, sort_keys=False)


def save_connection(updates: dict[str, Any], reset: list[str] | None = None) -> dict[str, Any]:
    """Keep only values that differ from the project configuration."""
    defaults = _defaults()
    saved = _saved()
    for key in reset or []:
        saved.pop(key, None)
    for key, value in updates.items():
        if key not in PROJECT_VARS or value is None or key in (reset or []):
            continue
        value = str(value).strip()
        if key in SECRETS:
            if value:
                saved[key] = value
            continue
        if value == "" or value == str(defaults.get(key) or ""):
            saved.pop(key, None)
        else:
            saved[key] = value
    _write(saved)
    return load_connection()


def _source(key: str, saved: dict[str, Any]) -> str:
    if key in saved:
        return "saved"
    if any(os.getenv(name, "").strip() for name in PROJECT_VARS[key]):
        return "project"
    if key in SECRETS and key != "nim_api_key" and SESSION_JWT_PATH.is_file():
        return "session"
    return "default"


def public_connection() -> dict[str, Any]:
    """Same settings for the screen, without revealing tokens."""
    raw = load_connection()
    saved = _saved()
    view = {key: value for key, value in raw.items() if key not in SECRETS}
    for key in SECRETS:
        view[f"has_{key}"] = bool(raw.get(key))
    view["sources"] = {key: _source(key, saved) for key in PROJECT_VARS}
    return view
