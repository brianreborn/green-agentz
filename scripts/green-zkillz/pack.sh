#!/usr/bin/env bash
# git archive of pack/MANIFEST.json paths. Does not copy into green-roomz.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
VERSION="$(tr -d '[:space:]' < docs/green-zkillz/VERSION)"
mapfile -t PATHS < <(python3 - <<'PY'
import json
from pathlib import Path
m = json.loads(Path("pack/MANIFEST.json").read_text(encoding="utf-8"))
seen, out = set(), []
def add(p):
    if p not in seen:
        seen.add(p)
        out.append(p)
add("pack/MANIFEST.json")
add("pack/README.md")
for c in m.get("components", []):
    for p in c.get("paths", []):
        add(p)
for p in m.get("docs", []):
    add(p)
for p in m.get("installers", []):
    add(p)
print("\n".join(out))
PY
)
missing=0
for p in PATHS; do
  if [ ! -e "$p" ]; then
    echo "missing pack path: $p" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  exit 1
fi
mkdir -p dist
OUT="dist/green-zkillz-${VERSION}.zip"
git archive --format=zip -o "$OUT" HEAD "${PATHS[@]}"
echo "$OUT"
