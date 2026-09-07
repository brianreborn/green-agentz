#!/usr/bin/env bash
# Point Grok at this clone's skills/. Does not copy files into ~/.grok/skills or green-roomz.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILLS="$ROOT/skills"
BRAINZ="$ROOT/systems/green-brainz"
CONFIG="${HOME}/.grok/config.toml"
if [ ! -f "$SKILLS/green-zkillz/SKILL.md" ]; then
  echo "not a green-agentz checkout: $ROOT" >&2
  exit 1
fi
block="[skills]
paths = [\"$SKILLS\"]"
if [ ! -f "$CONFIG" ]; then
  mkdir -p "$(dirname "$CONFIG")"
  printf '%s\n' "$block" > "$CONFIG"
  echo "wrote $CONFIG"
elif grep -F -q "$SKILLS" "$CONFIG"; then
  echo "already configured: $SKILLS"
elif grep -q '^\[skills\]' "$CONFIG"; then
  echo "config already has [skills]; add paths = [\"$SKILLS\"] by hand: $CONFIG" >&2
  exit 1
else
  printf '\n%s\n' "$block" >> "$CONFIG"
  echo "appended [skills] to $CONFIG"
fi
echo "GREEN_BRAINZ_ROOT=$BRAINZ"
echo "GREEN_WORKSPACE=$ROOT"
echo "GDICT_STATIC=$ROOT/skills/green-zkillz/assets"
