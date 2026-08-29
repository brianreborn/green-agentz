#!/usr/bin/env bash
# REQ-SK00-01..04. Emit a compact status array and refresh .runtime/probe_cache.json.
set -euo pipefail

ROOT="${GREEN_WORKSPACE:-.}"
RUNTIME="$ROOT/.runtime"
CACHE="$RUNTIME/probe_cache.json"
AUDIT="$RUNTIME/audit.log"
TTL="${GREEN_PROBE_TTL:-300}"
NOW="$(date +%s)"

mkdir -p "$RUNTIME" 2>/dev/null || true

digest_str() {
  printf '%s' "$1" | openssl dgst -sha256 2>/dev/null | awk '{print $NF}'
}

# --- host tier ---
tier="STATELESS_CHAT"
sandbox="STATELESS"
fs="NONE"
net="false"

if [[ -n "${GITHUB_ACTIONS:-}" || -n "${CI:-}" ]]; then
  tier="AGY_SANDBOX"
  sandbox="ISOLATED_LINUX"
fi
if [[ -d /home/workdir && -w /home/workdir ]]; then
  tier="SUPERGROK_ENGINE"
  sandbox="ISOLATED_LINUX"
  fs="READ_WRITE"
  net="true"
elif [[ -w "${ROOT}" ]]; then
  tier="AGY_SANDBOX"
  sandbox="ISOLATED_LINUX"
  fs="READ_WRITE"
elif [[ -r "${ROOT}" ]]; then
  tier="AGY_SANDBOX"
  sandbox="ISOLATED_LINUX"
  fs="READ_ONLY"
fi

if [[ "$net" != "true" ]]; then
  if [[ -n "${http_proxy:-}${https_proxy:-}${SSH_CONNECTION:-}" ]]; then
    net="true"
  fi
fi

blind="false"
mech="NONE"
if [[ -n "${GITHUB_TOKEN:-}${GH_TOKEN:-}" ]]; then
  mech="API_OAUTH_TOKEN"
elif [[ "$tier" == "SUPERGROK_ENGINE" ]]; then
  mech="SYSTEM_PROMPT_ENFORCED"
fi

writable="false"
path_hash="none"
if mkdir -p "$RUNTIME" 2>/dev/null && [[ -w "$RUNTIME" ]]; then
  writable="true"
  path_hash="$(digest_str "$ROOT")"
  fs="READ_WRITE"
fi

deps="[]"
add_dep() {
  local pkg="$1" origin="$2" sig="$3"
  if [[ "$deps" == "[]" ]]; then
    deps="[{\"package\":\"$pkg\",\"origin\":\"$origin\",\"signature_verified\":$sig}]"
  else
    deps="${deps%]}, {\"package\":\"$pkg\",\"origin\":\"$origin\",\"signature_verified\":$sig}]"
  fi
}
command -v bash >/dev/null && add_dep "bash" "host" false
command -v make >/dev/null && add_dep "make" "host" false
command -v python3 >/dev/null && add_dep "python3" "host" false
command -v git >/dev/null && add_dep "git" "host" false
command -v rustc >/dev/null && add_dep "rustc" "host" false
command -v cc >/dev/null && add_dep "cc" "host" false

expiry=$((NOW + TTL))
attestation=$(printf '%s' "{\"host_tier\":\"$tier\",\"identity_posture\":{\"asserted_blindness\":$blind,\"attestation_mechanism\":\"$mech\"},\"capabilities\":{\"file_system\":\"$fs\",\"network_egress\":$net,\"execution_sandbox\":\"$sandbox\"}}")
state_hash="$(digest_str "${attestation}${ROOT}${NOW}")"
sys02_status="FAIL"
sk02_status="FAIL"
if [[ "$writable" == "true" ]]; then
  sys02_status="PASS"
  sk02_status="PASS"
fi

json=$(cat <<EOF
{
  "cache_metadata": {
    "schema_version": "1.0.0",
    "last_probe_timestamp": $NOW,
    "global_state_hash": "$state_hash"
  },
  "environment_attestation": $attestation,
  "deduplication_registry": {
    "file_systems": {
      "$ROOT": { "writable": $writable, "path_hash": "$path_hash" }
    },
    "verified_dependencies": $deps
  },
  "short_circuit_tokens": {
    "REQ-SYS-02": { "status": "$sys02_status", "ttl_expiry": $expiry },
    "REQ-SK00-01": { "status": "PASS", "ttl_expiry": $expiry },
    "REQ-SK00-02": { "status": "$sk02_status", "ttl_expiry": $expiry }
  }
}
EOF
)

if [[ "$writable" == "true" ]]; then
  printf '%s\n' "$json" > "$CACHE"
  printf '%s PROBE %s OK tier=%s\n' "$NOW" "$CACHE" "$tier" >> "$AUDIT"
fi

printf 'STATUS host_tier=%s fs=%s net=%s sandbox=%s identity=%s writable=%s hash=%s cache=%s\n' \
  "$tier" "$fs" "$net" "$sandbox" "$mech" "$writable" "$state_hash" \
  "$([[ -f $CACHE ]] && echo "$CACHE" || echo NONE)"
printf 'DEPS %s\n' "$deps"
echo "DEFAULTS block_unverified_codecs=true block_bulky_third_party=true"
