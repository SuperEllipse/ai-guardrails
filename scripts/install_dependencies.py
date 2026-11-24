#!/usr/bin/env python3
"""Install the demo's Python dependencies with this runtime's Python.

The AMP runs this in a session before starting the Applications. Run it again after
changing the project's runtime: compiled packages must match the runtime that runs them.
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = ROOT / "requirements.txt"

print(f"Installing {REQUIREMENTS} with {sys.executable} ({sys.version.split()[0]})")
subprocess.check_call(
    [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--progress-bar",
        "off",
        "-r",
        str(REQUIREMENTS),
    ]
)
print("Dependencies installed.")
