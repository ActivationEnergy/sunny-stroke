"""Audit the site glyph coverage against the user's GF 0023—2020 PDF.

Poppler's pdftotext must be available. This script extracts UCS identifiers and
the printed five-category stroke codes from page coordinates. It does not
infer stroke categories from SVG paths or certify stroke order.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from read_static_data import read_index

UCS = re.compile(r"(?:0[0-9A-F]{4}|2[0-9A-F]{4})\Z")
DIGIT = re.compile(r"[1-5]\Z")
SERIAL = re.compile(r"[0-9]{4}\Z")


@dataclass(frozen=True)
class Word:
    text: str
    x: float
    y: float


def extract_page(page: ET.Element, number: int) -> list[dict]:
    words = [
        Word((node.text or "").strip(), float(node.attrib["xMin"]), float(node.attrib["yMin"]))
        for node in page.iter()
        if node.tag.rsplit("}", 1)[-1] == "word"
    ]
    anchors = [word for word in words if UCS.fullmatch(word.text)]
    records = []
    for side in ("left", "right"):
        column = sorted(
            (word for word in anchors if (word.x < 350) == (side == "left")),
            key=lambda word: word.y,
        )
        for offset, anchor in enumerate(column):
            upper = (column[offset - 1].y + anchor.y) / 2 if offset else 130
            lower = (anchor.y + column[offset + 1].y) / 2 if offset + 1 < len(column) else 790
            digits = sorted(
                (
                    word for word in words
                    if upper <= word.y < lower
                    and anchor.x - 145 <= word.x <= anchor.x - 35
                    and DIGIT.fullmatch(word.text)
                ),
                key=lambda word: (round(word.y, 1), word.x),
            )
            serials = [
                word for word in words
                if upper <= word.y < lower
                and anchor.x - 36 <= word.x <= anchor.x - 10
                and SERIAL.fullmatch(word.text)
            ]
            serial = min(serials, key=lambda word: abs(word.y - anchor.y)).text if serials else None
            count_words = [
                word for word in words
                if upper <= word.y < lower
                and anchor.x - 174 <= word.x <= anchor.x - 144
                and "画" in word.text
            ]
            printed_count = None
            if count_words:
                count_word = min(count_words, key=lambda word: abs(word.y - anchor.y))
                match = re.search(r"([0-9]+)画", count_word.text)
                if match:
                    printed_count = int(match.group(1))
                else:
                    adjacent = [
                        word for word in words
                        if abs(word.y - count_word.y) < 1
                        and anchor.x - 174 <= word.x < count_word.x
                        and word.text.isdigit()
                    ]
                    if adjacent:
                        printed_count = int(max(adjacent, key=lambda word: word.x).text)
            records.append({
                "character": chr(int(anchor.text, 16)),
                "ucs": anchor.text,
                "serial": serial,
                "code": "".join(word.text for word in digits),
                "printedCount": printed_count,
                "page": number,
                "cellBounds": [anchor.x - 174, upper, anchor.x + 32, lower],
            })
    return records


def extract(pdf: Path) -> list[dict]:
    with tempfile.TemporaryDirectory(prefix="bishun-audit-") as temp:
        bbox = Path(temp) / "bbox.html"
        subprocess.run(["pdftotext", "-bbox-layout", str(pdf), str(bbox)], check=True)
        tree = ET.parse(bbox)
    pages = [node for node in tree.getroot().iter() if node.tag.rsplit("}", 1)[-1] == "page"]
    return [record for number, page in enumerate(pages, 1) for record in extract_page(page, number)]


def audit(records: list[dict], index: dict) -> dict:
    by_char = {record["character"]: record for record in records}
    if len(records) != 8105 or len(by_char) != 8105:
        raise ValueError(f"Expected 8105 unique standard records, got {len(records)} / {len(by_char)}")
    serials = {int(record["serial"]) for record in records if record["serial"]}
    if serials != set(range(1, 8106)):
        raise ValueError("Standard serial numbers are not exactly 1–8105")
    if any(record["printedCount"] != len(record["code"]) for record in records):
        raise ValueError("A printed stroke count disagrees with the extracted code length")
    counts = index["counts"]
    official = set(by_char)
    covered = official & counts.keys()
    missing = official - counts.keys()
    code_lengths = {char: len(by_char[char]["code"]) for char in covered}
    mismatches = [
        {"character": char, "page": by_char[char]["page"], "standard": code_lengths[char], "graphics": counts[char]}
        for char in sorted(covered)
        if code_lengths[char] != counts[char]
    ]
    suspicious = [
        {"character": char, "page": by_char[char]["page"], "code": by_char[char]["code"]}
        for char in sorted(official)
        if not by_char[char]["code"]
        or by_char[char]["serial"] is None
        or by_char[char]["printedCount"] != len(by_char[char]["code"])
    ]
    return {
        "standardCount": len(official),
        "graphicCount": len(counts),
        "coveredCount": len(covered),
        "missingCount": len(missing),
        "missingByPlane": dict(Counter("supplementary" if ord(c) > 0xFFFF else "BMP" for c in missing)),
        "extraGraphicCount": len(counts.keys() - official),
        "strokeCountMismatchCount": len(mismatches),
        "strokeCountMismatches": mismatches,
        "extractionWarnings": suspicious,
        "records": records,
    }


def write_log(directory: Path, result: dict, pdf: Path, index: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    site_index = read_index(index)
    counts = site_index["counts"]
    supplemented = set(site_index.get("supplement", {}).get("characters", []))
    manual = site_index.get("manualOverrides", {})
    rows = []
    for record in sorted(result["records"], key=lambda item: int(item["serial"])):
        character = record["character"]
        graphic_count = counts.get(character)
        status = (
            "missing_graphic" if graphic_count is None
            else "stroke_count_mismatch" if graphic_count != record["printedCount"]
            else "count_match_order_unverified"
        )
        rows.append({
            "serial": record["serial"],
            "character": character,
            "ucs": record["ucs"],
            "pdf_page": record["page"],
            "standard_stroke_count": record["printedCount"],
            "standard_stroke_code": record["code"],
            "graphic_stroke_count": "" if graphic_count is None else graphic_count,
            "graphic_source": (
                "none" if graphic_count is None else
                "manual_override" if character in manual else
                "animcjk" if character in supplemented else
                "makemeahanzi"
            ),
            "status": status,
        })
    with (directory / "character-audit.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    summary = {key: value for key, value in result.items() if key not in ("records", "strokeCountMismatches", "extractionWarnings")}
    summary["pdfSha256"] = hashlib.sha256(pdf.read_bytes()).hexdigest()
    summary["indexSha256"] = hashlib.sha256(index.read_bytes()).hexdigest()
    summary["statusMeaning"] = {
        "missing_graphic": "No SVG stroke paths; must be authored or sourced and reviewed",
        "stroke_count_mismatch": "Existing SVG stroke count differs from the printed standard",
        "count_match_order_unverified": "Stroke count agrees; shape, direction, and order still require review",
    }
    (directory / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("index", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--log-dir", type=Path)
    args = parser.parse_args()
    result = audit(extract(args.pdf), read_index(args.index))
    if args.output:
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.log_dir:
        write_log(args.log_dir, result, args.pdf, args.index)
    print(json.dumps({key: value for key, value in result.items() if key not in ("records", "strokeCountMismatches", "extractionWarnings")}, ensure_ascii=False, indent=2))
    print("Mismatch samples:", result["strokeCountMismatches"][:15])
    print("Extraction warnings:", result["extractionWarnings"][:10])


if __name__ == "__main__":
    main()
