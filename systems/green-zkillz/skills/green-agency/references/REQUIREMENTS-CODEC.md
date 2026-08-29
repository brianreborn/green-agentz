# Green Agency — Codec, repository, and usage addendum

Status: proposed + partial implementation (GDICT LRU/Bloom, usage ledger).
Does not replace REQ-SYS-01..06. Human prose and comments are never encoded.

Sources: X conversation `2092659311680147958` and the local GDICT/usage design.

---

## REQ-CODEC-10 — Idempotent savings proof

Token savings are measured by **one offline expansion** of a saved proxied transcript.

- Compare reconstructed full form vs coded form (delta / head-tail / codebook).
- Forbidden: run the same build or transport the same payload twice to “prove” savings.
- Receipt: `SAVINGS raw=N coded=M delta=N-M ratio=… transcript=PATH`.

## REQ-CODEC-11 — Promotion criteria

| Class | Default rule | Destination |
|--------|----------------|-------------|
| `TRIVIAL` | length ≤ `GDICT_PROMOTE_MAX` (120) and hits ≥ n and not hash-like | local session / user / static table |
| `EXTREME` | longer than max, or whole-file / multi-line block | CDN / git / magnet / NFT |
| `REFUSE` | comments, prose, secrets, raw hashes | pass-through |

GitHub file tokens are `EXTREME` even when short: the **file** is the token.

## REQ-CODEC-12 — Extreme CDN codebook

Top 10 000 exact-match code lines and diagnostics → 2–4 byte index or private-use codepoint.

- Encoder: exact match only.
- Decoder: one edge-cache fetch per unseen id, then local.
- Idempotent and offline-expandable.
- Hooks REQ-SYS-06.

## REQ-CODEC-13 — Prior-art long-match (optional)

Extreme-length matching must use documented prior art (block match, DWT / wavelet packet). Wavelet path only on `EXTREME` payloads. If it does not beat exact-match + git-delta on fixtures: `WAVELET=SKIP reason=…`.

## REQ-CODEC-14 — Scope lock

Encode STATUS, cache tuples, compiler/proxy lines, audit lines, path indexes, file tokens. No LZMA/base64 in the prompt.

## REQ-CODEC-15 — Usage ledger (implemented)

Append one JSONL row per **prompt** and per **response** to `.runtime/gdict-usage.jsonl`.

`saved = pre - post`. Budget with `usage compress` only. Providers: `gdict-static`, `gdict-session`, `gdict-user`, `cdn`, `git`, `magnet`, `nft`, `passthrough`.

CLI: `gdict-lru.sh record|usage|usage-config`.

## REQ-CODEC-16 — Sliding window aggregation

Config keys: `window_seconds=3600`, `window_messages=100`, `window_mode=or`, `bucket_seconds=60`, `ask_on_change=true`.

Membership at report time (`now`):

```
age_ok(e)     = now - e.ts <= window_seconds
count_ok(e)   = e is among the last window_messages events
in_window(e)  = age_ok OR count_ok     if mode=or
              = age_ok AND count_ok    if mode=and
```

Sliding, not tumbling UTC hours. Aggregates: n, pre, post, saved, ratio, per direction/role/provider, rate = saved/span_seconds.

Buckets of `bucket_seconds` cover `[now-window_seconds, now]`; empty buckets kept as zeros.

## REQ-CODEC-17 — Dashboard / external monitors

Local: `.runtime/gdict-usage.jsonl`, `gdict-usage-window.json`, `gdict-usage.prom` (OpenMetrics).

Optional `dashboards[]`: prometheus_remote_write, webhook_json, opentelemetry_otlp_http. Empty = no network. Ask URLs on enable. Push window aggregate + latest bucket. Secrets only in env `GDICT_DASHBOARD_TOKEN`.

`usage compress` = budget. Do not sum compress+decompress for billing.

## REQ-REPO-01 — GitHub file tokens

Id: `git:<owner>/<repo>@<rev>:<path>#<blob_sha>`. Wire: rev + unified diff. Decompress from git at rev.

## REQ-REPO-02 — BitTorrent tokens

Key: `magnet:<xt>:<path-inside-torrent>`. Never put torrent bytes in model context.

## REQ-REPO-03 — NFT / ledger source

NFTs are pointers to codebook tables. Each run asks which ledgers. Empty disables.

## REQ-REPO-04 — Offline reopt

`gdict-lru.sh reopt`: offline, one task per repo, concurrent, restartable.

## REQ-REPO-05 — Config is not sticky on purpose

Re-invoking re-reads remotes, magnets, ledgers, windows, dashboard URLs.
