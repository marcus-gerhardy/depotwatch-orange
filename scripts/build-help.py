#!/usr/bin/env python3
"""Turn the help Markdown under content/help/ into lib/help/content.ts.

Why a generator rather than a Markdown loader (see lib/help/types.ts):
the app is a static export that has to work offline, so the content belongs in
the bundle; and a parsed structure renders as React elements, so no
documentation text can ever inject markup into the app.

The Markdown subset, complete:

    # Topic title            first line, once
    Summary line             the paragraph right after it, once
    ## Section {#anchor}     starts a section; the anchor is mandatory
    ### Sub-heading
    - bullet                 (consecutive lines form one list)
    1. numbered              (likewise)
    > note                   rendered as a callout box
    ![alt](path)             image; the alt text is mandatory
    plain paragraphs

Inline `**bold**`, `` `code` `` and `[text](target)` are left in the text and
parsed by the renderer, which is where they become elements.

Anchors are written by hand and never derived from a heading: a deep link into
the help is a URL somebody may have saved, and rewording a heading must not
break it. This script refuses to generate anything if an anchor is missing or
used twice, or if the two languages disagree about which sections exist —
a help page that exists in German only is a page that is missing in English.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "help"
OUT = ROOT / "lib" / "help" / "content.ts"
LOCALES = ("de", "en")

SECTION_RE = re.compile(r"^##\s+(.*?)\s*\{#([a-z0-9-]+)\}\s*$")
IMAGE_RE = re.compile(r"^!\[(.*?)\]\((.+?)\)\s*$")


class ContentError(Exception):
    pass


def strip_inline(text: str) -> str:
    """Plain text for the search index: markup off, words kept."""
    text = re.sub(r"!\[(.*?)\]\((.+?)\)", r"\1", text)
    text = re.sub(r"\[(.*?)\]\((.+?)\)", r"\1", text)
    text = text.replace("**", "").replace("`", "")
    return re.sub(r"\s+", " ", text).strip()


def parse_topic(path: Path) -> dict:
    lines = path.read_text(encoding="utf-8").split("\n")
    if not lines or not lines[0].startswith("# "):
        raise ContentError(f"{path}: must start with '# Title'")

    topic = {"id": path.stem, "title": lines[0][2:].strip(), "summary": "", "sections": []}
    section: dict | None = None
    buffer: list[str] = []
    list_items: list[str] = []
    list_kind: str | None = None

    def flush_paragraph() -> None:
        nonlocal buffer
        if not buffer:
            return
        text = " ".join(buffer).strip()
        buffer = []
        if not text:
            return
        if section is None:
            if not topic["summary"]:
                topic["summary"] = text
            else:
                raise ContentError(f"{path}: text before the first section")
        else:
            section["blocks"].append({"kind": "p", "text": text})

    def flush_list() -> None:
        nonlocal list_items, list_kind
        if not list_items:
            return
        if section is None:
            raise ContentError(f"{path}: list before the first section")
        section["blocks"].append({"kind": list_kind, "items": list_items})
        list_items = []
        list_kind = None

    for raw in lines[1:]:
        line = raw.rstrip()
        stripped = line.strip()

        m = SECTION_RE.match(stripped)
        if m:
            flush_paragraph()
            flush_list()
            section = {"id": m.group(2), "title": m.group(1), "blocks": []}
            topic["sections"].append(section)
            continue

        if stripped.startswith("## "):
            raise ContentError(f"{path}: section without an anchor: {stripped!r}")

        if not stripped:
            flush_paragraph()
            flush_list()
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            flush_list()
            section["blocks"].append({"kind": "h3", "text": stripped[4:].strip()})
            continue

        if stripped.startswith("> "):
            flush_paragraph()
            flush_list()
            section["blocks"].append({"kind": "note", "text": stripped[2:].strip()})
            continue

        image = IMAGE_RE.match(stripped)
        if image:
            flush_paragraph()
            flush_list()
            alt, src = image.group(1).strip(), image.group(2).strip()
            if not alt:
                raise ContentError(f"{path}: image without alt text: {src}")
            section["blocks"].append({"kind": "image", "src": src, "alt": alt})
            continue

        if stripped.startswith("- "):
            flush_paragraph()
            if list_kind == "ol":
                flush_list()
            list_kind = "ul"
            list_items.append(stripped[2:].strip())
            continue

        ordered = re.match(r"^\d+\.\s+(.*)$", stripped)
        if ordered:
            flush_paragraph()
            if list_kind == "ul":
                flush_list()
            list_kind = "ol"
            list_items.append(ordered.group(1).strip())
            continue

        buffer.append(stripped)

    flush_paragraph()
    flush_list()

    if not topic["summary"]:
        raise ContentError(f"{path}: no summary line under the title")
    if not topic["sections"]:
        raise ContentError(f"{path}: no sections")

    for s in topic["sections"]:
        parts: list[str] = []
        for block in s["blocks"]:
            if block["kind"] in ("p", "h3", "note"):
                parts.append(strip_inline(block["text"]))
            elif block["kind"] in ("ul", "ol"):
                parts.extend(strip_inline(i) for i in block["items"])
        s["text"] = " ".join(parts)

    return topic


def load_locale(locale: str) -> list[dict]:
    directory = CONTENT / locale
    if not directory.is_dir():
        raise ContentError(f"missing content directory: {directory}")
    order = (CONTENT / "order.txt").read_text(encoding="utf-8").split()
    topics = []
    for topic_id in order:
        path = directory / f"{topic_id}.md"
        if not path.is_file():
            raise ContentError(f"missing: {path}")
        topics.append(parse_topic(path))
    extra = {p.stem for p in directory.glob("*.md")} - set(order)
    if extra:
        raise ContentError(f"{locale}: not listed in order.txt: {sorted(extra)}")
    return topics


def check(all_topics: dict[str, list[dict]]) -> None:
    """Anchors unique per language, and the languages structurally identical."""
    for locale, topics in all_topics.items():
        seen: dict[str, str] = {}
        for topic in topics:
            for s in topic["sections"]:
                if s["id"] in seen:
                    raise ContentError(
                        f"{locale}: anchor {s['id']!r} used twice "
                        f"({seen[s['id']]} and {topic['id']})"
                    )
                seen[s["id"]] = topic["id"]

    reference = LOCALES[0]
    shape = {
        t["id"]: [s["id"] for s in t["sections"]] for t in all_topics[reference]
    }
    for locale in LOCALES[1:]:
        other = {t["id"]: [s["id"] for s in t["sections"]] for t in all_topics[locale]}
        if other != shape:
            for topic_id, ids in shape.items():
                if other.get(topic_id) != ids:
                    raise ContentError(
                        f"{locale}/{topic_id}: sections differ from {reference}\n"
                        f"  {reference}: {ids}\n  {locale}: {other.get(topic_id)}"
                    )
            raise ContentError(f"{locale}: topics differ from {reference}")


def main() -> int:
    try:
        content = {locale: load_locale(locale) for locale in LOCALES}
        check(content)
    except ContentError as e:
        print(f"help content error: {e}", file=sys.stderr)
        return 1

    body = json.dumps(content, ensure_ascii=False, indent=2)
    OUT.write_text(
        "// GENERATED by scripts/build-help.py — do not edit.\n"
        "// Source: content/help/<locale>/*.md (see the script for the subset).\n"
        "// Run `npm run help:build` after changing any of it.\n\n"
        'import type { HelpContent } from "./types";\n\n'
        f"export const HELP_CONTENT: HelpContent = {body};\n",
        encoding="utf-8",
    )
    counts = ", ".join(
        f"{locale}: {len(topics)} topics / "
        f"{sum(len(t['sections']) for t in topics)} sections"
        for locale, topics in content.items()
    )
    print(f"wrote {OUT.relative_to(ROOT)} ({counts})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
