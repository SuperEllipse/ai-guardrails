"""Regional personal-data check. Runs inside the guard server. No model call."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from src.guardrails.demo_state import record, scope
from src.guardrails.pii_validators import VALIDATORS

CATALOG = Path(__file__).resolve().parents[2] / "guardrails" / "catalog" / "regions"
VERSIONS = ("v1", "v2", "v3")


def _load(path: Path) -> dict[str, Any]:
    with path.open() as handle:
        return yaml.safe_load(handle) or {}


def load_profiles(region: str, all_regions: bool) -> list[dict[str, Any]]:
    profiles = [_load(CATALOG / "global.yml")]
    if all_regions:
        for path in sorted(CATALOG.glob("*.yml")):
            if path.name != "global.yml":
                profiles.append(_load(path))
        return profiles
    home = CATALOG / f"{region}.yml"
    if home.is_file():
        profiles.append(_load(home))
    return profiles


def _context_near(text: str, start: int, end: int, words: list[str]) -> bool:
    window = text[max(0, start - 40) : end + 40].lower()
    return any(word.lower() in window for word in words)


def screen_text(text: str, region: str, profile_version: str, all_regions: bool) -> dict[str, Any]:
    version = profile_version if profile_version in VERSIONS else "v1"
    found: list[dict[str, str]] = []
    for profile in load_profiles(region, all_regions):
        threshold = float(profile.get("threshold", 0.5))
        for entity in profile.get("entities") or []:
            pattern = entity.get("pattern") or ""
            if not pattern:
                continue
            context_words = entity.get("context") or []
            validator_name = entity.get("validator") or ""
            for match in re.finditer(pattern, text, flags=re.IGNORECASE):
                if version in ("v2", "v3") and context_words:
                    if not _context_near(text, match.start(), match.end(), context_words):
                        continue
                if version == "v3" and validator_name:
                    validator = VALIDATORS.get(validator_name)
                    if validator and not validator(match.group()):
                        continue
                score = float(entity.get("score", 0.5))
                if score < threshold:
                    continue
                found.append(
                    {
                        "id": entity.get("id", ""),
                        "label": entity.get("label", entity.get("id", "")),
                        "profile": profile.get("id", ""),
                    }
                )
    blocked = bool(found)
    names = ", ".join(item["label"] for item in found)
    decision = {
        "blocked": blocked,
        "rewrite": False,
        "message": f"I can't continue while this message contains personal data ({names})." if blocked else "",
        "rule": "sensitive_data" if blocked else "",
        "model_call": False,
        "label": "no model call",
        "entities": found,
    }
    record(decision)
    return decision
