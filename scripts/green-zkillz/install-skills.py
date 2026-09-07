#!/usr/bin/env python3
"""Point Grok [skills].paths at this clone. Merges an existing [skills] table."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILLS = (ROOT / "skills").as_posix()
BRAINZ = (ROOT / "systems" / "green-brainz").as_posix()
MARKER = ROOT / "skills" / "green-zkillz" / "SKILL.md"
CONFIG = Path.home() / ".grok" / "config.toml"
SKILLS_HEADER = re.compile(r"(?m)^\[skills\][ \t]*(?:\r?\n|$)")
NEXT_TABLE = re.compile(r"(?m)^\[{1,2}[A-Za-z]")
PATHS_OPEN = re.compile(r"paths\s*=\s*\[")


def _section_span(text: str) -> tuple[int, int] | None:
    header = SKILLS_HEADER.search(text)
    if not header:
        return None
    rest = text[header.end() :]
    nxt = NEXT_TABLE.search(rest)
    end = header.end() + nxt.start() if nxt else len(text)
    return header.start(), end


def _array_close(text: str, open_idx: int) -> int:
    depth = 0
    for i in range(open_idx, len(text)):
        ch = text[i]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return i
    raise ValueError("unclosed paths array in [skills]")


def merge_skills_paths(text: str, path: str) -> tuple[str, str]:
    quoted = '"' + path.replace("\\", "/") + '"'
    span = _section_span(text)
    if span is None:
        sep = "" if not text or text.endswith("\n") else "\n"
        return f"{text}{sep}[skills]\npaths = [{quoted}]\n", "appended"
    start, end = span
    section = text[start:end]
    opened = PATHS_OPEN.search(section)
    if opened is None:
        insert_at = start + len("[skills]")
        return text[:insert_at] + f"\npaths = [{quoted}]" + text[insert_at:], "merged"
    abs_open = start + opened.end() - 1
    abs_close = _array_close(text, abs_open)
    inner = text[abs_open + 1 : abs_close]
    if quoted in inner:
        return text, "already configured"
    return text[: abs_open + 1] + f"{quoted}, " + text[abs_open + 1 :], "merged"


def main() -> None:
    if not MARKER.is_file():
        sys.exit(f"not a green-agentz checkout: {ROOT}")
    if not CONFIG.is_file():
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        CONFIG.write_text(f"[skills]\npaths = [\"{SKILLS}\"]\n", encoding="utf-8")
        status = "wrote"
    else:
        raw = CONFIG.read_text(encoding="utf-8-sig")
        new, status = merge_skills_paths(raw, SKILLS)
        if new != raw:
            CONFIG.write_text(new, encoding="utf-8")
    print(f"{status} {CONFIG}")
    print(f"GREEN_BRAINZ_ROOT={BRAINZ}")
    print(f"GREEN_WORKSPACE={ROOT.as_posix()}")
    print(f"GDICT_STATIC={(ROOT / 'skills' / 'green-zkillz' / 'assets').as_posix()}")


def _selftest() -> None:
    path = "C:/example/skills"
    text, st = merge_skills_paths("", path)
    assert st == "appended" and path in text
    text, st = merge_skills_paths('[cli]\ninstaller = "internal"\n', path)
    assert st == "appended" and "[skills]" in text
    text, st = merge_skills_paths('[skills]\npaths = ["~/other"]\n', path)
    assert st == "merged" and path in text and "~/other" in text
    already = f'[skills]\npaths = ["{path}"]\n'
    text, st = merge_skills_paths(already, path)
    assert st == "already configured" and text == already
    text, st = merge_skills_paths('[skills]\npaths = ["~/a", "~/b"]\n[models]\ndefault = "x"\n', path)
    assert st == "merged" and path in text and text.index(path) < text.index("[models]")
    privacy = f'[privacy]\nprivacy_banner_acked = "x"\n[skills]\npaths = ["{path}"]\n'
    text, st = merge_skills_paths(privacy, path)
    assert st == "already configured"
    print("selftest_ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        os.chdir(ROOT)
        main()
