#!/usr/bin/env bash
# REQ-SK04-03. Flatten chapters listed in MANUSCRIPT.json into MANUSCRIPT.md.
set -euo pipefail
MAN="${1:-MANUSCRIPT.json}"
OUT="${2:-MANUSCRIPT.md}"
[[ -r "$MAN" ]] || { echo "ERROR_TOKEN: FS_PERMISSION_DENIED $MAN" >&2; exit 2; }
python3 - "$MAN" "$OUT" <<'PY'
import json, sys, pathlib
man_path, out_path = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
man = json.loads(man_path.read_text(encoding="utf-8"))
parts = []
title = man.get("title") or "Manuscript"
ver = man.get("version") or ""
parts.append(f"# {title}")
if ver:
    parts.append(f"_version {ver}_\n")
for ch in man.get("chapters") or []:
    cid = ch.get("id") or ""
    ctitle = ch.get("title") or cid
    parts.append(f"## {ctitle}")
    if cid:
        parts.append(f"`{cid}`")
    prose = (ch.get("prose") or "").rstrip()
    if prose:
        parts.append(prose)
    for src in ch.get("sources") or []:
        sp = pathlib.Path(src)
        parts.append(f"### Source `{src}`")
        if sp.is_file():
            body = sp.read_text(encoding="utf-8", errors="replace")
            ext = sp.suffix.lstrip(".") or "text"
            parts.append(f"```{ext}\n{body.rstrip()}\n```")
        else:
            parts.append(f"_missing source {src}_")
    parts.append("")
out_path.write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")
print(f"OK {out_path}")
PY
