#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/green-zkillz/archive.py
fi
exec python scripts/green-zkillz/archive.py
