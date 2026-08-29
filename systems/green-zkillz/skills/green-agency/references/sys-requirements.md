# System-wide contracts (REQ-SYS-01..06)

Canonical source: `brianreborn/green-agency` REQUIREMENTS.md.

## REQ-SYS-01 — State engine and audit log

- Keep session state in conversation or in `.runtime/audit.log` (append-only).
- Every file create, overwrite, backup, delete, or permission probe must append one line:

```
UNIX_TS OP PATH RESULT DETAIL
```

`OP` is one of `PROBE READ WRITE BACKUP DELETE MKDIR CACHE`. `RESULT` is `OK` or `FAIL`.

Do not rewrite this skill file to store state.

## REQ-SYS-02 — Sandbox file check

Before any modification routine:

1. Confirm the parent directory exists (create only if the host is `READ_WRITE`).
2. Confirm the target is readable if it exists.
3. Confirm the parent (or target) is writable.
4. On failure, halt and emit `ERROR_TOKEN: FS_PERMISSION_DENIED PATH`.

Query `.runtime/probe_cache.json` first (REQ-SYS-04). If a live short-circuit token exists for `REQ-SYS-02` on that path, skip the live probe.

## REQ-SYS-03 — Backup protocol (DAR)

Before overwriting an existing file:

1. Copy it to `PATH.bak` (immutable snapshot for this write).
2. If `PATH.bak` already exists, rotate to `PATH.bak.UNIX_TS` then write the new `.bak`.
3. Never write the live file until the snapshot exists and is readable.
4. Append the backup to the audit log.

New files do not need a `.bak`.

## REQ-SYS-04 — Short-circuit cache

Path: `.runtime/probe_cache.json` relative to the active workspace root.

- Create `.runtime/` if missing and the host is writable.
- Before repeating a global check (permissions, host-tier, CI tags), read the cache.
- Honor `short_circuit_tokens.<REQ_ID>.ttl_expiry`. If `status=PASS` and `ttl_expiry` is in the future, skip the live check.
- Default TTL is 300 seconds unless the caller sets another value.

## REQ-SYS-05 — Cache schema

The cache file must match the schema in `green-probe/references/cache-schema.json`. Required top-level keys:

- `cache_metadata` — `schema_version` (`1.0.0`), `last_probe_timestamp` (unix int), `global_state_hash` (hex digest)
- `environment_attestation` — `host_tier`, `identity_posture`, `capabilities`
- `deduplication_registry` — `file_systems`, `verified_dependencies`
- `short_circuit_tokens` — map of requirement id to `{status, ttl_expiry}`

`host_tier` enum: `STATELESS_CHAT`, `AGY_SANDBOX`, `SUPERGROK_ENGINE`.

`attestation_mechanism` enum: `NONE`, `SYSTEM_PROMPT_ENFORCED`, `API_OAUTH_TOKEN`, `CRYPTOGRAPHIC_ENCLAVE`.

`file_system` enum: `NONE`, `READ_ONLY`, `READ_WRITE`.

`execution_sandbox` enum: `STATELESS`, `ISOLATED_LINUX`, `HOST_NATIVE`.

`global_state_hash` is a SHAKE256 (fallback SHA-256) hex digest of the attestation + registry. Do not invent an ML-DSA public key.

## REQ-SYS-06 — Local output proxy

Never dump raw stdout/stderr, compiler tails, or recursive `find` listings into the model context.

- Run the matching `scripts/*-proxy.sh` or `scripts/output-proxy.sh`.
- Pass only abstracted deltas: unique error codes, file:line, counts, first/last unique message.
- Identical payloads across retries become `ERROR_MUTATION_FAILED: LINE_N` (or the relevant token). Do not re-transmit the full block.
