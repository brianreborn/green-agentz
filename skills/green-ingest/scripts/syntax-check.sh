#!/usr/bin/env bash
# REQ-SK02-03. Lightweight native syntax check. Prints compact tokens.
set -euo pipefail
FILE="${1:?file required}"
[[ -r "$FILE" ]] || { echo "ERROR_TOKEN: FS_PERMISSION_DENIED $FILE" >&2; exit 2; }

base="$(basename "$FILE")"
ext="${base##*.}"
status=OK
detail=""

case "$ext" in
  sh|bash)
    if bash -n "$FILE" 2>/tmp/green-syn.err; then status=OK; else status=FAIL; detail=$(head -n 3 /tmp/green-syn.err | tr '\n' ';'); fi
    ;;
  py)
    if python3 -m py_compile "$FILE" 2>/tmp/green-syn.err; then status=OK; else status=FAIL; detail=$(head -n 3 /tmp/green-syn.err | tr '\n' ';'); fi
    ;;
  json)
    if python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$FILE" 2>/tmp/green-syn.err; then status=OK; else status=FAIL; detail=$(head -n 3 /tmp/green-syn.err | tr '\n' ';'); fi
    ;;
  md|markdown|txt)
    status=OK
    detail="prose"
    ;;
  rs)
    if command -v rustc >/dev/null && rustc --edition 2021 --emit=metadata --crate-type lib "$FILE" -o /tmp/green-syn.rmeta 2>/tmp/green-syn.err; then status=OK; else
      if command -v rustc >/dev/null; then status=FAIL; detail=$(head -n 3 /tmp/green-syn.err | tr '\n' ';'); else status=SKIP; detail="no_rustc"; fi
    fi
    ;;
  c|h|cc|cpp)
    if command -v cc >/dev/null && cc -fsyntax-only "$FILE" 2>/tmp/green-syn.err; then status=OK; else
      if command -v cc >/dev/null; then status=FAIL; detail=$(head -n 3 /tmp/green-syn.err | tr '\n' ';'); else status=SKIP; detail="no_cc"; fi
    fi
    ;;
  mk|makefile|Makefile)
    status=OK
    detail="makefile_unchecked"
    ;;
  *)
    status=SKIP
    detail="no_native_checker"
    ;;
esac
printf 'syntax file=%s status=%s detail=%s\n' "$FILE" "$status" "${detail:-none}"
[[ "$status" != FAIL ]]
