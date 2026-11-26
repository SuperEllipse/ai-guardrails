#!/usr/bin/env python3
"""Install the demo's Python dependencies with this runtime's Python.

The AMP runs this in a session before starting the Applications. Run it again after
changing the project's runtime: compiled packages must match the runtime that runs them.
"""

import subprocess
import sys
from pathlib import Path


def _project_root() -> Path:
    """Resolve the project root in both script and AMP/IPython execution."""
    try:
        return Path(__file__).resolve().parents[1]
    except NameError:
        for candidate in (Path.cwd(), Path("/home/cdsw")):
            if (candidate / "requirements.txt").is_file():
                return candidate.resolve()
        raise RuntimeError(
            "Could not locate requirements.txt. Run this task from the project root."
        )


ROOT = _project_root()
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
