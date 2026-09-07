#!/usr/bin/env python3
"""Build dist/green-zkillz-<VERSION>.zip from pack/MANIFEST.json via git archive."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def python_ok() -> None:
    if sys.version_info < (3, 10):
        sys.exit("python 3.10+ required")


def load_archive_paths() -> list[str]:
    manifest = json.loads((ROOT / "pack" / "MANIFEST.json").read_text(encoding="utf-8"))
    paths = manifest["archive"]
    if not isinstance(paths, list) or not paths:
        sys.exit("pack/MANIFEST.json archive must be a non-empty list")
    seen: set[str] = set()
    ordered: list[str] = []
    missing: list[str] = []
    for raw in paths:
        if not isinstance(raw, str) or not raw or raw.startswith("/") or ".." in raw.split("/"):
            sys.exit(f"illegal archive path: {raw!r}")
        if raw in seen:
            continue
        seen.add(raw)
        ordered.append(raw)
        if not (ROOT / raw).exists():
            missing.append(raw)
    if missing:
        sys.exit("missing pack paths:\n" + "\n".join(missing))
    return ordered


def version() -> str:
    return (ROOT / "docs" / "green-zkillz" / "VERSION").read_text(encoding="utf-8").strip()


def main() -> None:
    python_ok()
    paths = load_archive_paths()
    ver = version()
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    out = dist / f"green-zkillz-{ver}.zip"
    if out.exists():
        out.unlink()
    subprocess.run(
        ["git", "archive", "--format=zip", "-o", str(out), "HEAD", "--", *paths],
        cwd=ROOT,
        check=True,
    )
    print(out)


if __name__ == "__main__":
    main()
