#!/usr/bin/env bash
# REQ-SYS-02 + REQ-SYS-03. Usage:
#   safe-write.sh <target-path> [source-file]
# If source-file is omitted, reads stdin.
set -euo pipefail

TARGET="${1:?target path required}"
SRC="${2:-}"
ROOT="${GREEN_WORKSPACE:-.}"
AUDIT="$ROOT/.runtime/audit.log"
mkdir -p "$(dirname "$AUDIT")" "$ROOT/.runtime"

ts() { date +%s; }
log() { printf '%s %s %s %s %s\n' "$(ts)" "$1" "$2" "$3" "${4:-}" >> "$AUDIT"; }

parent="$(dirname "$TARGET")"
if [[ ! -d "$parent" ]]; then
  if mkdir -p "$parent" 2>/dev/null; then
    log MKDIR "$parent" OK
  else
    log MKDIR "$parent" FAIL
    echo "ERROR_TOKEN: FS_PERMISSION_DENIED $parent" >&2
    exit 2
  fi
fi

if [[ ! -w "$parent" ]]; then
  log PROBE "$parent" FAIL not_writable
  echo "ERROR_TOKEN: FS_PERMISSION_DENIED $parent" >&2
  exit 2
fi

if [[ -e "$TARGET" ]]; then
  [[ -r "$TARGET" ]] || { log PROBE "$TARGET" FAIL not_readable; echo "ERROR_TOKEN: FS_PERMISSION_DENIED $TARGET" >&2; exit 2; }
  bak="${TARGET}.bak"
  if [[ -e "$bak" ]]; then
    rot="${TARGET}.bak.$(ts)"
    cp -p -- "$bak" "$rot"
    log BACKUP "$bak" OK "rotated:$rot"
  fi
  cp -p -- "$TARGET" "$bak"
  log BACKUP "$TARGET" OK "$bak"
fi

if [[ -n "$SRC" ]]; then
  cp -- "$SRC" "$TARGET"
else
  cat > "$TARGET"
fi
log WRITE "$TARGET" OK
echo "OK $TARGET"
