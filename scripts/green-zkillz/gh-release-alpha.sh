#!/usr/bin/env bash
# Cut or refresh a prerelease from the current checkout.
# Requires: gh auth login
set -euo pipefail
TAG="${1:-green-zkillz-v$(tr -d '[:space:]' < docs/green-zkillz/VERSION)}"
NOTES="${2:-docs/green-zkillz/ALPHA.md}"
gh release view "$TAG" >/dev/null 2>&1 && MODE=edit || MODE=create
if [ "$MODE" = create ]; then
  gh release create "$TAG" --title "green-zkillz $TAG" --notes-file "$NOTES" --prerelease --generate-notes
else
  gh release edit "$TAG" --notes-file "$NOTES" --prerelease
fi
gh release view "$TAG" --web
