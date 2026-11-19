"""Build the NeMo config folder the guard server loads."""

from __future__ import annotations

import shutil
from pathlib import Path

import yaml

from src.guardrails.connection import load_connection

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "guardrails" / "catalog"
ACTIVE = ROOT / "guardrails" / "active"
CONFIG_ID = "active"

CONFIG_PY = '''"""Generated for the guard server. Actions live in src/guardrails."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from nemoguardrails.rails.llm.llmrails import LLMRails


def init(rails: LLMRails) -> None:
    from src.guardrails.demo_actions import check_transfer_gate, check_written_rules, screen_pii
    from src.guardrails.output_parsers import self_check_yes_no

    rails.register_action(screen_pii, name="screen_pii")
    rails.register_action(check_written_rules, name="check_written_rules")
    rails.register_action(check_transfer_gate, name="check_transfer_gate")
    rails.register_output_parser(self_check_yes_no, "self_check_yes_no")
'''


def build_active_config() -> Path:
    """Write guardrails/active from the catalog. Safe to call on every reload."""
    cfg = load_connection()
    ACTIVE.mkdir(parents=True, exist_ok=True)
    flows = CATALOG / "flows"
    for path in flows.glob("*.co"):
        shutil.copy2(path, ACTIVE / path.name)

    config = {
        "colang_version": "1.0",
        "models": [
            {
                "type": "main",
                "engine": "openai",
                "model": cfg.get("model") or "gpt-6.1-sol",
                "parameters": {
                    "temperature": 0,
                    "base_url": cfg.get("base_url") or "https://api.openai.com/v1",
                    "api_key": cfg.get("api_key") or "",
                },
            }
        ],
        "instructions": [
            {
                "type": "general",
                "content": "You are a retail banking assistant. The checker decides what is allowed.\n",
            }
        ],
        "rails": {
            "input": {
                "flows": [
                    "check regional pii on input",
                    "check written rules on input",
                ]
            },
            "output": {
                "flows": [
                    "check regional pii on output",
                    "check written rules on output",
                ]
            },
        },
    }
    with (ACTIVE / "config.yml").open("w") as handle:
        yaml.safe_dump(config, handle, sort_keys=False)
    (ACTIVE / "prompts.yml").write_text("prompts: []\n")
    (ACTIVE / "config.py").write_text(CONFIG_PY)
    return ACTIVE
