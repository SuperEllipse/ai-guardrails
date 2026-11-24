"""SQLite version compatibility shim for ChromaDB/CrewAI."""

from __future__ import annotations

import sys

_MIN_SQLITE_VERSION = (3, 35, 0)


def _parse_version(version_str: str) -> tuple[int, int, int]:
    parts: list[int] = []
    for part in version_str.split("."):
        try:
            parts.append(int(part))
        except ValueError:
            break
    while len(parts) < 3:
        parts.append(0)
    return parts[0], parts[1], parts[2]


def _system_sqlite_version() -> tuple[int, int, int]:
    import sqlite3

    return _parse_version(sqlite3.sqlite_version)


def apply_sqlite3_compat() -> None:
    """Patch sys.modules['sqlite3'] with pysqlite3 when available.

    Raises RuntimeError with install instructions when pysqlite3 is missing
    and the system sqlite3 module is older than 3.35.0 (required by ChromaDB).
    """
    try:
        import pysqlite3

        sys.modules["sqlite3"] = pysqlite3
        return
    except ImportError:
        pass

    system_version = _system_sqlite_version()
    if system_version >= _MIN_SQLITE_VERSION:
        return

    version_label = ".".join(str(part) for part in system_version)
    min_label = ".".join(str(part) for part in _MIN_SQLITE_VERSION)
    raise RuntimeError(
        f"Unsupported SQLite version ({version_label}); ChromaDB requires sqlite3 >= {min_label}. "
        "Install the project's pinned dependencies with python scripts/install_dependencies.py."
    )
