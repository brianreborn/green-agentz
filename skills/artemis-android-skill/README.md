# ARTEMIS Android Skill for Hermes Agent

An on-demand [Hermes Agent](https://github.com/NousResearch/hermes-agent) skill for Android automation through [Google ARTEMIS](https://github.com/google/artemis). It uses the lightweight ARTEMIS Python SDK instead of registering a permanent MCP server, so ARTEMIS tool schemas do not consume context in unrelated conversations.

## How it works

1. Hermes loads `SKILL.md` only for Android work.
2. `scripts/artemis.py` installs a pinned ARTEMIS runtime into a private user-data directory on first use.
3. The helper starts the loopback ARTEMIS daemon only when an SDK command needs it.
4. SDK responses are reduced to compact JSON; large raw payloads are omitted.

No `mcp_servers.artemis` entry is created or required.

## Install

```bash
git clone https://github.com/pank-su/artemis-android-skill.git \
  "${HERMES_HOME:-$HOME/.hermes}/skills/autonomous-ai-agents/artemis-android"
```

Start a new Hermes session after installing so the skill catalog is refreshed.

## Prerequisites

- Linux or macOS
- Git and [`uv`](https://docs.astral.sh/uv/)
- Android device with USB debugging authorized, or a running emulator
- An ARTEMIS-supported model credential stored locally in the ARTEMIS `.env` file

Never paste model keys into chat. The helper reports the exact private `.env` path from `setup` and `doctor`.

## Usage

Normally, ask Hermes directly:

> Check on Android whether the profile settings screen opens. Do not change anything.

Manual diagnostics are also available:

```bash
SKILL_DIR="${HERMES_HOME:-$HOME/.hermes}/skills/autonomous-ai-agents/artemis-android"
python3 "$SKILL_DIR/scripts/artemis.py" setup
python3 "$SKILL_DIR/scripts/artemis.py" doctor
python3 "$SKILL_DIR/scripts/artemis.py" devices
python3 "$SKILL_DIR/scripts/artemis.py" run --profile flash --goal "Open Settings"
python3 "$SKILL_DIR/scripts/artemis.py" server stop
```

Commands: `setup`, `doctor`, `devices`, `run`, `submit`, `status`, `stop`, and `server`. Every operational command emits one compact JSON object.

## Profiles

- `flash`: routine deterministic navigation.
- `pro`: exploratory testing, deeper reasoning, and checkpoint verification.

## Reproducibility

The bootstrap pins ARTEMIS revision `086078819209c7139d6f833cfdc6d5cc80d9f19a`. Updating ARTEMIS is an explicit source change instead of an invisible first-run upgrade.

## Test

```bash
python3 -m unittest scripts/test_artemis.py -v
python3 -m py_compile scripts/artemis.py scripts/test_artemis.py
```

The tests do not require a phone, model key, network connection, or running ARTEMIS daemon.

## Security

- The daemon binds to loopback.
- `ARTEMIS_BASE_URL` is restricted to loopback, and its port is used consistently for startup, SDK calls, status, and shutdown.
- Existing listeners are trusted only when lifecycle metadata, live PID, runtime interpreter,
  working directory, daemon command, listening port, and ARTEMIS identity endpoint all match.
- Unidentified occupied ports are never stopped or used.
- Subprocesses use argument arrays, never `shell=True`.
- Credentials stay in ARTEMIS's local `.env`.
- The skill requires explicit confirmation before purchases, messages, account changes, destructive actions, or publishing.

## License

Apache-2.0. ARTEMIS is a separate Google project distributed under Apache-2.0.
