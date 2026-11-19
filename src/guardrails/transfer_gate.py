"""Account-age and device check. The guard server owns this rule."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

ACCOUNTS_PATH = Path(__file__).resolve().parents[2] / "guardrails" / "catalog" / "accounts.yml"


def load_accounts() -> dict[str, Any]:
    with ACCOUNTS_PATH.open() as handle:
        return yaml.safe_load(handle) or {}


def find_account(customer_id: str) -> dict[str, Any] | None:
    for account in load_accounts().get("accounts") or []:
        if account.get("id") == customer_id:
            return account
    return None


def decide_transfer(customer_id: str, device_id: str, amount: float, payee: str) -> dict[str, Any]:
    data = load_accounts()
    minimum = float(data.get("min_account_age_hours", 24))
    account = find_account(customer_id)
    if account is None:
        return {
            "allowed": False,
            "reason": f"No account {customer_id} is on the demo ledger.",
            "ledger_before": None,
            "ledger_after": None,
        }
    before = {
        "customer_id": account["id"],
        "name": account["name"],
        "balance": account["balance"],
        "age_hours": account["age_hours"],
        "device_id": device_id,
    }
    known = set(account.get("known_devices") or [])
    if float(account.get("age_hours", 0)) < minimum:
        reason = f"The account is less than {minimum:.0f} hours old."
        allowed = False
    elif device_id not in known:
        reason = "The device is not a known device."
        allowed = False
    else:
        reason = "The account age and the device passed."
        allowed = True
    after = dict(before)
    if allowed:
        after["balance"] = round(float(account["balance"]) - float(amount), 2)
    unguarded = dict(before)
    unguarded["balance"] = round(float(account["balance"]) - float(amount), 2)
    return {
        "allowed": allowed,
        "reason": reason,
        "amount": amount,
        "payee": payee,
        "ledger_before": before,
        "ledger_guarded": after,
        "ledger_unguarded": unguarded,
    }
