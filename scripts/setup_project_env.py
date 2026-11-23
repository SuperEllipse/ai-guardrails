#!/usr/bin/env python3
"""View, check, and set this demo's environment variables in Cloudera AI project settings.

Project settings (Project Settings > Advanced > Environment Variables) are the place to
configure the demo. Every new session, job, and application in the project gets them, and
nothing secret has to live in the repository.

Run inside a Cloudera AI session of the project. The session already provides
CDSW_API_URL, CDSW_PROJECT_ID, and CDSW_APIV2_KEY, so no extra login is needed.

    python scripts/setup_project_env.py template          # variables this demo reads
    python scripts/setup_project_env.py show              # what the project has now
    eval "$(python scripts/setup_project_env.py env)"     # load them into this terminal, without a restart
    python scripts/setup_project_env.py apply KEY=VALUE ... [--unset KEY ...] [--dry-run]

Values must start and end with a letter or digit and only contain letters, digits, '-',
'_' and '.', which is what the Applications screen accepts. That is why addresses are
split into host, namespace, endpoint, and API path rather than given as one URL.
New values reach running sessions and applications only after they restart.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import sys

import httpx

VARIABLES: list[tuple[str, str, str]] = [
    ("CAIIS_HOST", "Answer model: inference service host name", "ml-xxxxxxxx-xxx.example.cloudera.site"),
    ("CAIIS_NAMESPACE", "Answer model: serving namespace", "serving-default"),
    ("CAIIS_ENDPOINT", "Answer model: endpoint name", "my-answer-model"),
    ("CAIIS_API_PATH", "Answer model: path before /v1 ('openai', or 'none' when the endpoint serves /v1 directly)", "openai"),
    ("CAIIS_MODEL_ORG", "Answer model id, part before the slash", "nvidia"),
    ("CAIIS_MODEL_NAME", "Answer model id, part after the slash", "nemotron-3-nano"),
    ("CAIIS_MAX_TOKENS", "Answer model: max tokens per reply (reasoning models need 1024 or more)", "1024"),
    ("DEFAULT_LLM_PROVIDER", "Model provider", "caiis"),
    ("LLAMA_GUARD_HOST", "Llama Guard judge: host name", "ml-xxxxxxxx-xxx.example.cloudera.site"),
    ("LLAMA_GUARD_NAMESPACE", "Llama Guard judge: serving namespace", "serving-default"),
    ("LLAMA_GUARD_ENDPOINT", "Llama Guard judge: endpoint name", "llama-guard-3"),
    ("LLAMA_GUARD_API_PATH", "Llama Guard judge: path before /v1", "openai"),
    ("LLAMA_GUARD_MODEL_ORG", "Llama Guard model id, part before the slash", "meta-llama"),
    ("LLAMA_GUARD_MODEL_NAME", "Llama Guard model id, part after the slash", "Llama-Guard-3-8B"),
    ("DEFAULT_SAFETY_MODE", "Default judge: self_check, llama_guard, or nim", "llama_guard"),
    ("GUARDRAILS_PORT", "Guard server port when started from a session", "8001"),
    ("GUARDRAILS_HOST", "Guard server host name when it runs as a separate application", "nemo-guardrails.example.cloudera.site"),
    ("NVIDIA_API_KEY", "Optional: token for the NVIDIA NIM judge", "nvapi-..."),
    ("CDP_TOKEN", "Optional: inference token. Leave unset in sessions; the session token in /tmp/jwt is used", ""),
]
KNOWN = {name for name, _, _ in VARIABLES}
SECRETS = {"CDP_TOKEN", "NVIDIA_API_KEY", "OPENAI_API_KEY"}
SAFE_VALUE = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$")


def _api() -> tuple[str, str, dict[str, str]]:
    missing = [k for k in ("CDSW_API_URL", "CDSW_PROJECT_ID", "CDSW_APIV2_KEY") if not os.getenv(k)]
    if missing:
        sys.exit(f"Run this inside a Cloudera AI session of the project. Missing: {', '.join(missing)}")
    base = os.environ["CDSW_API_URL"].split("/api/")[0] + "/api/v2"
    url = f"{base}/projects/{os.environ['CDSW_PROJECT_ID']}"
    return url, os.environ["CDSW_PROJECT_ID"], {"Authorization": f"Bearer {os.environ['CDSW_APIV2_KEY']}"}


def _load() -> tuple[str, dict[str, str]]:
    url, _, headers = _api()
    response = httpx.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    project = response.json()
    return str(project.get("name") or ""), json.loads(project.get("environment") or "{}")


def _shown(name: str, value: str) -> str:
    if name in SECRETS or name.endswith(("_TOKEN", "_KEY")):
        return f"<set, {len(value)} characters>" if value else "<empty>"
    return value


def cmd_template(_: argparse.Namespace) -> int:
    width = max(len(name) for name in KNOWN)
    for name, help_text, example in VARIABLES:
        print(f"{name:<{width}}  {example or '(leave unset)'}")
        print(f"{'':<{width}}  {help_text}")
    return 0


def cmd_show(_: argparse.Namespace) -> int:
    name, env = _load()
    print(f"Project: {name}")
    width = max([len(k) for k in env] + [len(k) for k in KNOWN])
    for key in sorted(set(env) | KNOWN):
        if key in env:
            print(f"  {key:<{width}}  {_shown(key, env[key])}")
        elif key not in SECRETS and key not in {"GUARDRAILS_HOST", "CDP_TOKEN"}:
            print(f"  {key:<{width}}  (not set)")
    return 0


def cmd_env(_: argparse.Namespace) -> int:
    _, env = _load()
    for key in sorted(KNOWN - SECRETS):
        value = env.get(key, "")
        if value and not key.endswith(("_TOKEN", "_KEY")) and SAFE_VALUE.match(value):
            print(f"export {key}={shlex.quote(value)}")
    print("unset CDP_TOKEN")
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    updates: dict[str, str] = {}
    problems: list[str] = []
    for pair in args.pairs:
        if "=" not in pair:
            problems.append(f"{pair}: use KEY=VALUE")
            continue
        key, value = pair.split("=", 1)
        key, value = key.strip(), value.strip()
        if key not in KNOWN:
            print(f"Note: {key} is not one of the demo's variables. It will still be set.")
        if not SAFE_VALUE.match(value):
            problems.append(f"{key}: value must start and end with a letter or digit and use only A-Z a-z 0-9 . _ -")
        updates[key] = value
    if problems:
        print("Nothing changed:")
        for problem in problems:
            print(f"  {problem}")
        return 2

    name, env = _load()
    merged = dict(env)
    merged.update(updates)
    for key in args.unset:
        merged.pop(key, None)

    print(f"Project: {name}")
    changed = False
    for key in sorted(set(env) | set(merged)):
        before, after = env.get(key), merged.get(key)
        if before == after:
            continue
        changed = True
        if after is None:
            print(f"  remove  {key}")
        elif before is None:
            print(f"  add     {key} = {_shown(key, after)}")
        else:
            print(f"  change  {key}: {_shown(key, before)} -> {_shown(key, after)}")
    if not changed:
        print("  Already up to date.")
        return 0
    if args.dry_run:
        print("Dry run: nothing saved.")
        return 0

    url, project_id, headers = _api()
    response = httpx.patch(
        url,
        headers=headers,
        json={"id": project_id, "environment": json.dumps(merged)},
        timeout=30,
    )
    if response.status_code >= 400:
        print(f"The project settings were not saved: {response.status_code} {response.text[:300]}")
        return 1
    print("Saved to project settings. Restart sessions and applications to pick up the new values.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("template", help="List the variables this demo reads").set_defaults(func=cmd_template)
    sub.add_parser("show", help="Show the project's variables, with secrets hidden").set_defaults(func=cmd_show)
    sub.add_parser(
        "env", help="Print export lines for the non-secret variables, for: eval \"$(... env)\""
    ).set_defaults(func=cmd_env)
    apply = sub.add_parser("apply", help="Add or change variables in project settings")
    apply.add_argument("pairs", nargs="*", metavar="KEY=VALUE")
    apply.add_argument("--unset", action="append", default=[], metavar="KEY", help="Remove a variable")
    apply.add_argument("--dry-run", action="store_true", help="Show the changes without saving them")
    apply.set_defaults(func=cmd_apply)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
