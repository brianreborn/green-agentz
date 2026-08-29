#!/usr/bin/env bash
# REQ-SK03-01. Normalize a markdown file in place via stdout.
# Strips trailing whitespace, collapses 3+ blank lines, forces LF, keeps fences.
set -euo pipefail
FILE="${1:?markdown file required}"
[[ -r "$FILE" ]] || { echo "ERROR_TOKEN: FS_PERMISSION_DENIED $FILE" >&2; exit 2; }
python3 - "$FILE" <<'PY'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
lines = [ln.rstrip() for ln in text.split("\n")]
out, blank = [], 0
for ln in lines:
    if ln == "":
        blank += 1
        if blank <= 2:
            out.append(ln)
    else:
        blank = 0
        out.append(ln)
while out and out[-1] == "":
    out.pop()
sys.stdout.write("\n".join(out) + "\n")
PY
