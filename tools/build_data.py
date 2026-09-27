"""Convert pinned Make Me a Hanzi graphics and dictionary into static assets."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

SOURCE = "https://github.com/skishore/makemeahanzi"
REVISION = "bddc96d41bef78427ed0e034e9f7e31d71fd1b92"
SOURCE_SHA256 = "a28c478b5178e98f67f510b2d52fde08a69dc664654ef43498253b9b764d46ee"
DICTIONARY_SHA256 = "744bb05d5b0742e9ee35c37791f94d56a173349b3367569e7ca11e510364d203"
SUPPLEMENT_REVISION = "ec5e17cca76c87587790bcbce5ea0b4d4fb753d6"
SUPPLEMENT_SHA256 = "5a5c157fddd0fd9bfaf5580b25c20a1ba2b0cabc0b7142e09f6149cbd5547798"
DATE = "2026-09-27"
NOTICE = (
    "Modified on 2026-09-27: extracted ordered SVG stroke paths and medians from "
    "Make Me a Hanzi graphics.txt, and grouped characters "
    "by Unicode codepoint high byte for static loading. Data remains under "
    "the Arphic Public License; see ../ARPHICPL.TXT."
)
SUPPLEMENT_NOTICE = (
    "Modified on 2026-09-27: added previously missing stroke paths from "
    "AnimCJK graphicsZhHans.txt, only where its path count matches the "
    "GF 0023—2020 printed stroke count. Stroke order and glyph shape remain "
    "unverified. Data remains under the Arphic Public License; see "
    "../ARPHICPL.TXT."
)


def build(
    source: Path,
    output: Path,
    supplement: Path | None = None,
    standard_csv: Path | None = None,
    overrides_dir: Path | None = None,
) -> None:
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError("Input graphics.txt does not match the pinned upstream file")
    shards: dict[str, dict[str, list[str]]] = defaultdict(dict)
    median_shards: dict[str, dict[str, list]] = defaultdict(dict)
    counts: dict[str, int] = {}
    for line_number, line in enumerate(raw.decode("utf-8").splitlines(), 1):
        record = json.loads(line)
        character = record["character"]
        strokes = record["strokes"]
        medians = record.get("medians")
        if len(character) != 1 or not strokes or not all(isinstance(path, str) for path in strokes):
            raise ValueError(f"Invalid character or strokes at line {line_number}")
        if not isinstance(medians, list) or len(medians) != len(strokes):
            raise ValueError(f"Invalid medians at line {line_number}")
        if character in counts:
            raise ValueError(f"Duplicate character: {character}")
        shard = f"{ord(character) >> 8:04x}"
        shards[shard][character] = strokes
        median_shards[shard][character] = medians
        counts[character] = len(strokes)

    supplemented: list[str] = []
    added: list[str] = []
    if supplement:
        if standard_csv is None:
            raise ValueError("--standard-csv is required with --supplement")
        import csv

        standard = {row["character"]: row for row in csv.DictReader(standard_csv.open(encoding="utf-8-sig"))}
        extra_raw = supplement.read_bytes()
        if hashlib.sha256(extra_raw).hexdigest() != SUPPLEMENT_SHA256:
            raise ValueError("Supplement data does not match the pinned AnimCJK file")
        for line in extra_raw.decode("utf-8").splitlines():
            record = json.loads(line)
            character = record["character"]
            strokes = record["strokes"]
            medians = record.get("medians")
            expected = standard.get(character)
            if character in counts or expected is None or len(strokes) != int(expected["standard_stroke_count"]):
                continue
            if not isinstance(medians, list) or len(medians) != len(strokes):
                raise ValueError(f"Invalid AnimCJK medians: {character}")
            added.append(character)
            shard = f"{ord(character) >> 8:04x}"
            shards[shard][character] = strokes
            median_shards[shard][character] = medians
            counts[character] = len(strokes)
            supplemented.append(character)

    manual: dict[str, dict] = {}
    if overrides_dir:
        if standard_csv is None:
            raise ValueError("--standard-csv is required with --overrides-dir")
        import csv

        standard = {row["character"]: row for row in csv.DictReader(standard_csv.open(encoding="utf-8-sig"))}
        for file in sorted(overrides_dir.glob("*.json")):
            record = json.loads(file.read_text(encoding="utf-8"))
            character = record["character"]
            paths = record["strokes"]
            if character != file.stem or character not in standard:
                raise ValueError(f"Invalid manual override filename or character: {file}")
            if not paths or not all(isinstance(path, str) and path.startswith("M ") for path in paths):
                raise ValueError(f"Invalid manual paths in {file}")
            if len(paths) != int(standard[character]["standard_stroke_count"]):
                raise ValueError(f"Manual override stroke count differs from standard: {character}")
            shard = f"{ord(character) >> 8:04x}"
            shards[shard][character] = paths
            if isinstance(record.get("medians"), list) and len(record["medians"]) == len(paths):
                median_shards[shard][character] = record["medians"]
            else:
                median_shards[shard].pop(character, None)
            counts[character] = len(paths)
            style = record.get("strokeStyle", {})
            if any(not 1 <= number <= len(paths) for number in style.get("numbers", [])):
                raise ValueError(f"Invalid manual stroke style in {file}")
            manual[character] = {"notice": record["notice"], "strokeStyle": style}

    output.mkdir(parents=True, exist_ok=True)
    for shard, characters in sorted(shards.items()):
        supplement_chars = [char for char in characters if char in supplemented]
        manual_chars = [char for char in characters if char in manual]
        data = {
            "_notice": NOTICE + (" " + SUPPLEMENT_NOTICE if supplement_chars else "")
            + (" " + " ".join(manual[char]["notice"] for char in manual_chars) if manual_chars else ""),
            "characters": characters,
            "medians": median_shards[shard],
        }
        if supplement_chars:
            data["supplemented"] = supplement_chars
        if manual_chars:
            data["manualOverrides"] = manual_chars
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        (output / f"{shard}.js").write_text(
            f"window.HANZI_SHARDS=window.HANZI_SHARDS||{{}};window.HANZI_SHARDS[{json.dumps(shard)}]={payload};\n",
            encoding="utf-8",
        )
    index = {
        "source": SOURCE,
        "revision": REVISION,
        "sourceSha256": SOURCE_SHA256,
        "modified": DATE,
        "license": "Arphic Public License",
        "notice": NOTICE,
        "counts": counts,
    }
    if supplement:
        index["supplement"] = {
            "source": "https://github.com/parsimonhi/animCJK/blob/master/graphicsZhHans.txt",
            "revision": SUPPLEMENT_REVISION,
            "sourceSha256": SUPPLEMENT_SHA256,
            "notice": SUPPLEMENT_NOTICE,
            "characters": supplemented,
            "added": added,
        }
    if manual:
        index["manualOverrides"] = manual
    index_payload = json.dumps(index, ensure_ascii=False, separators=(",", ":"))
    (output / "index.js").write_text(f"window.HANZI_INDEX={index_payload};\n", encoding="utf-8")
    print(f"Generated {len(counts)} characters in {len(shards)} shards ({len(added)} additions, {len(manual)} confirmed overrides)")


def build_dictionary(source: Path, output: Path) -> None:
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != DICTIONARY_SHA256:
        raise ValueError("Input dictionary.txt does not match the pinned upstream file")
    entries = {}
    for line in raw.decode("utf-8").splitlines():
        record = json.loads(line)
        entries[record["character"]] = {
            "pinyin": record.get("pinyin") or [],
            "definition": record.get("definition") or "",
        }
    data = {
        "_notice": (
            "Modified on 2026-09-27: extracted pinyin and English definitions from "
            "Make Me a Hanzi dictionary.txt; omitted other fields. Licensed under "
            "LGPL v3 or later; see ../LGPL.txt and ../GPL-3.0.txt."
        ),
        "entries": entries,
    }
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    (output / "dictionary.js").write_text(f"window.HANZI_DICTIONARY={payload};\n", encoding="utf-8")
    print(f"Generated {len(entries)} dictionary entries")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--dictionary", type=Path)
    parser.add_argument("--supplement", type=Path)
    parser.add_argument("--standard-csv", type=Path)
    parser.add_argument("--overrides-dir", type=Path)
    args = parser.parse_args()
    build(args.source, args.output, args.supplement, args.standard_csv, args.overrides_dir)
    if args.dictionary:
        build_dictionary(args.dictionary, args.output)
