#!/usr/bin/env bash
# Cut or refresh a prerelease from the current checkout.
# Attaches the filtered pack zip (skills + green-brainz). Requires: gh auth login
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TAG="${1:-green-zkillz-v$(tr -d '[:space:]' < docs/green-zkillz/VERSION)}"
NOTES="${2:-docs/green-zkillz/ALPHA.md}"
ZIP="$(bash scripts/green-zkillz/pack.sh)"
gh release view "$TAG" >/dev/null 2>&1 && MODE=edit || MODE=create
if [ "$MODE" = create ]; then
  gh release create "$TAG" --title "green-zkillz $TAG" --notes-file "$NOTES" --prerelease --generate-notes --target HEAD "$ZIP"
else
  gh release edit "$TAG" --notes-file "$NOTES" --prerelease
  gh release upload "$TAG" "$ZIP" --clobber
fi
gh release view "$TAG" --web
