#!/usr/bin/env bash
# REQ-SK02-01. Recursively index a workspace. Compact listing only.
# Usage: index-tree.sh [root] [--max 400]
set -euo pipefail
ROOT="${1:-.}"
MAX=400
if [[ "${2:-}" == "--max" ]]; then MAX="${3:-400}"; fi

if [[ ! -r "$ROOT" ]]; then
  echo "ERROR_TOKEN: FS_PERMISSION_DENIED $ROOT" >&2
  exit 2
fi

list="${TMPDIR:-/tmp}/green-index.$$"
trap 'rm -f "$list"' EXIT
find "$ROOT" \
  \( -name .git -o -name node_modules -o -name .venv -o -name target -o -name dist -o -name build -o -name .runtime -o -name __pycache__ \) -prune \
  -o -print 2>/dev/null | head -n $((MAX + 1)) > "$list"

count=$(wc -l < "$list" | tr -d ' ')
truncated=false
if [[ "$count" -gt "$MAX" ]]; then
  truncated=true
  count=$MAX
fi

echo "tree_root=$ROOT entries=$count truncated=$truncated"
n=0
while IFS= read -r p; do
  n=$((n + 1))
  [[ "$n" -gt "$MAX" ]] && break
  if [[ -d "$p" ]]; then
    printf 'D %s\n' "$p"
  elif [[ -f "$p" ]]; then
    sz=$(wc -c < "$p" 2>/dev/null | tr -d ' ' || echo 0)
    printf 'F %s %s\n' "$sz" "$p"
  else
    printf 'O %s\n' "$p"
  fi
done < "$list"
