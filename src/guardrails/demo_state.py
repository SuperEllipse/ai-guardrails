"""Per-request notes shared by the guard server checks."""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any

_scope: ContextVar[dict[str, Any] | None] = ContextVar("guard_scope", default=None)
_decision: ContextVar[dict[str, Any] | None] = ContextVar("guard_decision", default=None)


def set_scope(region: str, profile_version: str, all_regions: bool) -> None:
    _scope.set(
        {
            "region": region or "US",
            "profile_version": profile_version or "v1",
            "all_regions": bool(all_regions),
        }
    )
    _decision.set(None)


def clear_request() -> None:
    _scope.set(None)
    _decision.set(None)


def scope() -> dict[str, Any]:
    return _scope.get() or {"region": "US", "profile_version": "v1", "all_regions": False}


def record(decision: dict[str, Any]) -> None:
    """Keep a block if one happens. Otherwise keep the check that called a model."""
    current = _decision.get()
    if current is None:
        _decision.set(decision)
        return
    if decision.get("blocked"):
        _decision.set(decision)
        return
    if not current.get("blocked") and decision.get("model_call"):
        _decision.set(decision)


def decision() -> dict[str, Any]:
    return _decision.get() or {
        "blocked": False,
        "rewrite": False,
        "message": "",
        "rule": "",
        "model_call": False,
        "label": "no model call",
        "entities": [],
    }
