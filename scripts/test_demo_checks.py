"""Offline checks for regional IDs and the payment gate."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.guardrails.catalog_build import build_active_config
from src.guardrails.demo_state import clear_request, set_scope
from src.guardrails.pii_screen import screen_text
from src.guardrails.pii_validators import aadhaar, card_luhn, sg_nric
from src.guardrails.transfer_gate import decide_transfer


def test_payment_gate() -> None:
    blocked = decide_transfer("CUST-NEW", "DEV-NEW", 500, "ACME")
    assert blocked["allowed"] is False
    assert blocked["ledger_guarded"]["balance"] == blocked["ledger_before"]["balance"]
    assert blocked["ledger_unguarded"]["balance"] == 1500

    unknown = decide_transfer("CUST-AGED", "DEV-NEW", 200, "Northwind")
    assert unknown["allowed"] is False

    allowed = decide_transfer("CUST-AGED", "DEV-KNOWN", 500, "ACME")
    assert allowed["allowed"] is True
    assert allowed["ledger_guarded"]["balance"] == 7500


def test_pii_regions() -> None:
    set_scope("US", "v1", False)
    ssn = screen_text("My SSN is 123-45-6789.", "US", "v1", False)
    assert ssn["blocked"] is True
    assert ssn["model_call"] is False

    clear_request()
    other = screen_text("My SSN is 123-45-6789.", "SG", "v1", False)
    assert other["blocked"] is False

    clear_request()
    everywhere = screen_text("My SSN is 123-45-6789.", "SG", "v1", True)
    assert everywhere["blocked"] is True

    clear_request()
    hours = screen_text("What are your branch hours?", "US", "v1", True)
    assert hours["blocked"] is False

    clear_request()
    nric_v1 = screen_text("My NRIC is S1234567A.", "SG", "v1", False)
    assert nric_v1["blocked"] is True

    clear_request()
    nric_v3 = screen_text("My NRIC is S1234567A.", "SG", "v3", False)
    assert nric_v3["blocked"] is False

    clear_request()
    nric_v2_without_word = screen_text("Number S1234567A is on the form.", "SG", "v2", False)
    assert nric_v2_without_word["blocked"] is False

    assert card_luhn("4111111111111111") is True
    assert sg_nric("S0000001I") is True
    assert sg_nric("S1234567A") is False
    clear_request()


def test_config_builds() -> None:
    path = build_active_config()
    assert (path / "config.yml").is_file()
    assert (path / "checks.co").is_file()
    assert (path / "payment_check.co").is_file()
    assert (path / "regional_reply.co").is_file()
    from nemoguardrails import RailsConfig

    RailsConfig.from_path(str(path))


if __name__ == "__main__":
    test_payment_gate()
    test_pii_regions()
    test_config_builds()
    print("demo checks passed")
    print("sample aadhaar valid", aadhaar("234123412341"))
