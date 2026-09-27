"""Read the JSON payloads inside the site's local-script data files."""

from __future__ import annotations

import json
from pathlib import Path


def _read_assignment(path: Path, prefix: str) -> dict:
    source = path.read_text(encoding="utf-8").strip()
    if not source.startswith(prefix) or not source.endswith(";"):
        raise ValueError(f"Unexpected static data format: {path}")
    return json.loads(source[len(prefix):-1])


def read_index(path: Path) -> dict:
    return _read_assignment(path, "window.HANZI_INDEX=")


def read_shard(directory: Path, shard: str) -> dict:
    prefix = f"window.HANZI_SHARDS=window.HANZI_SHARDS||{{}};window.HANZI_SHARDS[{json.dumps(shard)}]="
    return _read_assignment(directory / f"{shard}.js", prefix)
