#!/usr/bin/env python3
"""Install the demo's Python dependencies with this runtime's Python.

The AMP runs this in a session before starting the Applications. Run it again after
changing the project's runtime: compiled packages must match the runtime that runs them.
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# NeMo Guardrails' PII extension requires exactly this spaCy model (about 560 MB).
SPACY_MODEL = "en_core_web_lg"

print(f"Installing {ROOT / 'requirements.txt'} with {sys.executable} ({sys.version.split()[0]})")
subprocess.check_call([sys.executable, "-m", "pip", "install", "--progress-bar", "off", "-r", str(ROOT / "requirements.txt")])
print(f"Installing the spaCy model {SPACY_MODEL} for NeMo's PII extension")
subprocess.check_call([sys.executable, "-m", "spacy", "download", SPACY_MODEL])
print("Dependencies installed.")
