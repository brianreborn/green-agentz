#!/usr/bin/env bash
# REQ-SK01-05 / REQ-SYS-06. Parse a compiler log into a minimal JSON error matrix.
# Usage: compiler-proxy.sh [logfile]
set -euo pipefail
ROOT="${GREEN_WORKSPACE:-.}"
RUNTIME="$ROOT/.runtime"
mkdir -p "$RUNTIME" 2>/dev/null || true
SEEN="$RUNTIME/compiler_seen.txt"
touch "$SEEN" 2>/dev/null || SEEN="/tmp/green-compiler-seen.txt"

log="${TMPDIR:-/tmp}/green-compiler-log.$$"
trap 'rm -f "$log"' EXIT
if [[ -n "${1:-}" && -f "${1:-}" ]]; then
  cat "$1" > "$log"
else
  cat > "$log"
fi

python3 - "$log" "$SEEN" <<'PY'
import json, re, sys, hashlib, pathlib
log = pathlib.Path(sys.argv[1]).read_text(errors="replace")
seen_path = pathlib.Path(sys.argv[2])
try:
    seen = set(x for x in seen_path.read_text().splitlines() if x)
except OSError:
    seen = set()

pat = re.compile(
    r'(?P<file>[^\s:]+?\.[A-Za-z0-9+]+):(?P<line>\d+)(?::(?P<col>\d+))?'
    r'(?::\s*)?(?P<code>error|warning|Error|Warning|FAILED|error\[[^\]]+\])[:\s]+(?P<msg>.+)'
)
rust = re.compile(r'-->\s+(?P<file>\S+):(?P<line>\d+):(?P<col>\d+)')
items = []
last_file = {}
for line in log.splitlines():
    m = pat.search(line)
    if m:
        items.append({
            "file": m.group("file"),
            "line": int(m.group("line")),
            "col": int(m.group("col") or 0),
            "code": m.group("code"),
            "msg": m.group("msg").strip()[:200],
        })
        continue
    rm = rust.search(line)
    if rm:
        last_file = rm.groupdict()
    if "error[" in line or line.strip().startswith("error:"):
        items.append({
            "file": last_file.get("file", ""),
            "line": int(last_file.get("line") or 0),
            "col": int(last_file.get("col") or 0),
            "code": "error",
            "msg": line.strip()[:200],
        })

new_items, repeats = [], []
for it in items:
    key = hashlib.sha256(json.dumps(it, sort_keys=True).encode()).hexdigest()[:16]
    if key in seen:
        repeats.append(it)
    else:
        seen.add(key)
        new_items.append(it)

try:
    seen_path.write_text("\n".join(sorted(seen)) + "\n")
except OSError:
    pass

if items and not new_items:
    line = repeats[0].get("line", 0) if repeats else 0
    print(json.dumps({"status": "ERROR_MUTATION_FAILED", "token": "ERROR_MUTATION_FAILED: LINE_%d" % line, "count": len(repeats)}))
else:
    print(json.dumps({"status": "NEW" if new_items else "CLEAN", "errors": new_items, "repeat_count": len(repeats)}))
PY
