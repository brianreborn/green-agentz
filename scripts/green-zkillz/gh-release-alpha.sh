#!/usr/bin/env bash
# Cut or refresh a prerelease; attaches the filtered pack zip. Requires gh auth.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if command -v python3 >/dev/null 2>&1; then PY=python3; else PY=python; fi
TAG="${1:-green-zkillz-v$("$PY" -c "from pathlib import Path; print(Path('docs/green-zkillz/VERSION').read_text().strip())")}"
NOTES="${2:-docs/green-zkillz/ALPHA.md}"
ZIP="$("$PY" scripts/green-zkillz/archive.py)"
if gh release view "$TAG" >/dev/null 2>&1; then
  gh release edit "$TAG" --notes-file "$NOTES" --prerelease
  gh release upload "$TAG" "$ZIP" --clobber
else
  gh release create "$TAG" --title "green-zkillz $TAG" --notes-file "$NOTES" --prerelease --generate-notes --target HEAD "$ZIP"
fi
if [ -z "${CI:-}" ] && [ -t 1 ]; then
  gh release view "$TAG" --web
fi
