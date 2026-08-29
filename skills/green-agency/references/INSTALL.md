# Install and test green-agency skills on another host

Repo: https://github.com/brianreborn/green-agency

## What you get

Five-stage pipeline plus GDICT control-plane codec. Skills: probe, bootstrap, ingest, format, deploy, plus orchestrator `green-agency`.

Needs: bash, python3, sha256sum. No pip packages.

```bash
git clone https://github.com/brianreborn/green-agency.git
export GREEN_WORKSPACE="$PWD"
export GDICT_STATIC="$PWD/skills/green-agency/assets"
chmod +x skills/*/scripts/*.sh skills/green-agency/scripts/*.py
# Point the host skill dir at skills/green-{probe,bootstrap,ingest,format,deploy,agency}
```

Smoke: see this file in-repo for the /tmp/green-smoke block.

## SuperGrok Files setup (REQ-REPO-06)

Private EXTREME store only. Not a public CDN. Token: `grokfile:<file_id>#<sha256>`.

### 1. Account surface

1. Sign in at https://grok.com on SuperGrok or Heavy.
2. Open https://grok.com/files and create or upload the codebook blob (plain text / JSON). Stay under the Files API cap (~48–50 MB).
3. Optional Heavy: set Grok Computer as “where Grok will work” instead of Drive.
4. Keep the file name and, if the Files API returns one, the `file_id`.
5. `sha256sum` the exact bytes uploaded. That hash is part of the token.

### 2. Enable in this project

```bash
skills/green-agency/scripts/gdict-lru.sh usage-config ask
skills/green-agency/scripts/gdict-lru.sh usage-config set grok_files=on
```

Local only (`$GREEN_WORKSPACE/.runtime/gdict-usage-config.json`, not git):

```
grok_files: on
grok_files_ids:
  - id: "<file_id or name>"
    sha256: "<hex>"
    role: extreme-table
```

No API keys in that file.

### 3. Use

Encoder writes `grokfile:<file_id>#<sha256>`. Decoder fetches via Files UI / API / Grok Computer outside the prompt, verifies sha256, interns locally. Forbidden: paste the file body into chat. Quota: delete unused assets at grok.com/files (Profile → Settings → Data Controls).

### 4. Leave it off

Default off. Empty `grok_files_ids` disables the provider. `assets/` static tables still load.
