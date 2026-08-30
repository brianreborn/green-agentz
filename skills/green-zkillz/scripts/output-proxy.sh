#!/usr/bin/env bash
# REQ-SYS-06. Collapse a raw log on stdin into a compact delta.
# Usage: cmd 2>&1 | output-proxy.sh [--max 40]
set -euo pipefail
MAX=40
if [[ "${1:-}" == "--max" ]]; then MAX="${2:-40}"; fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cat > "$tmp"

lines=$(wc -l < "$tmp" | tr -d ' ')
uniq_count=$(sort -u "$tmp" | wc -l | tr -d ' ')

echo "proxy_summary lines=$lines unique=$uniq_count"

# Extract compiler-like hits: file:line[:col]: error/warning
hits=$(grep -E -n '^[^:]+:[0-9]+(:[0-9]+)?:.*(error|warning|Error|Warning|FAIL)' "$tmp" || true)
if [[ -n "$hits" ]]; then
  echo "diagnostics:"
  echo "$hits" | awk -v m="$MAX" 'NR<=m {print}'
  extra=$(echo "$hits" | awk -v m="$MAX" 'NR>m {c++} END {print c+0}')
  [[ "$extra" -gt 0 ]] && echo "diagnostics_omitted=$extra"
fi

# Dedup fingerprint
hash=$( (command -v sha256sum >/dev/null && sha256sum "$tmp" | awk '{print $1}') || cksum "$tmp" | awk '{print $1}' )
echo "payload_hash=$hash"

# Keep first and last unique lines if no diagnostics
if [[ -z "$hits" ]]; then
  echo "head:"
  sort -u "$tmp" | head -n 8
  echo "tail:"
  sort -u "$tmp" | tail -n 8
fi
