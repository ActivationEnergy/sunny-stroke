"""Publish coverage, counts, and five-category stroke codes from the audit."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def build(log: Path, summary: Path, output: Path) -> None:
    rows = list(csv.DictReader(log.open(encoding="utf-8-sig")))
    stats = json.loads(summary.read_text(encoding="utf-8"))
    if len(rows) != stats["standardCount"] or len(rows) != 8105:
        raise ValueError("Audit log and summary do not contain the full standard")
    counts = {row["character"]: int(row["standard_stroke_count"]) for row in rows}
    codes = {row["character"]: row["standard_stroke_code"] for row in rows}
    data = {
        "source": "GF 0023—2020, extracted from the user-supplied PDF on 2026-09-27",
        "status": "GF five-category codes are transcribed from the PDF; SVG stroke paths remain unverified",
        "standardCounts": counts,
        "standardCodes": codes,
        "coveredCount": stats["coveredCount"],
        "missingCount": stats["missingCount"],
    }
    output.write_text(
        "window.HANZI_AUDIT=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("log", type=Path)
    parser.add_argument("summary", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.log, args.summary, args.output)
