#!/usr/bin/env bash
# Thin CLI over gdict_lru.py / gdict_usage.py
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export GREEN_WORKSPACE="${GREEN_WORKSPACE:-/home/workdir/artifacts}"
case "${1:-}" in
  record|usage|usage-config)
    exec python3 "$ROOT/gdict_usage.py" "$@"
    ;;
  *)
    exec python3 "$ROOT/gdict_lru.py" "$@"
    ;;
esac
