---
name: artemis-android
description: Control Android through ARTEMIS only when requested.
version: 0.1.0
author: Vasya Pankov, Hermes Agent
license: Apache-2.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [android, automation, testing, artemis, sdk]
    related_skills: []
---

# ARTEMIS Android Skill

Use ARTEMIS through its Python SDK only for Android work. Do not register the ARTEMIS MCP server in Hermes; this skill deliberately keeps its tool schemas out of unrelated conversations.

## When to Use

- Operate, inspect, or test a connected Android phone or emulator.
- Reproduce an Android UI bug, verify a workflow, or collect an ARTEMIS trace.
- Do not use for ordinary macOS, browser, or iOS automation.

## Prerequisites

- `uv` and Git must be available.
- A USB-debugging-authorized Android device or running emulator is required for device actions.
- ARTEMIS model credentials remain in its private `.env`; never request or transmit credentials through chat.
- The helper script installs a pinned ARTEMIS revision under `ARTEMIS_HOME` or the user's application-data directory. It does not configure Hermes MCP.

## How to Run

Resolve this skill's absolute `skill_dir` from `skill_view`, then invoke its helper through `terminal`:

```bash
python3 <skill_dir>/scripts/artemis.py setup
python3 <skill_dir>/scripts/artemis.py doctor
python3 <skill_dir>/scripts/artemis.py devices
python3 <skill_dir>/scripts/artemis.py run --profile flash --goal "Open Settings and report the battery percentage"
```

Every command prints one compact JSON object to stdout. Parse that object rather than narrating terminal logs.

## Procedure

1. Run `setup` if the private ARTEMIS installation is absent. Completion: JSON has `ok: true` and an `artemis_home`.
2. Run `doctor` before the first device action in a conversation or after any failure. Completion: diagnosis identifies credentials and at least one ready device; otherwise follow its reported remediation without guessing.
3. Run `devices`. If more than one ready device exists and the user did not identify one, ask which serial to use. Completion: exactly one target serial is selected.
4. Choose `flash` for routine deterministic navigation; choose `pro` for exploratory testing, checkpoint verification, or ambiguous workflows.
5. Use `run` for normal synchronous work. Use `submit`, followed by `status`, for long-running work. Completion: retain the returned `task_id` until the task reaches a terminal state.
6. Report the actual status, output, device serial, task ID, and available artifact paths. Never claim success from process exit alone.

## Quick Reference

```bash
python3 <skill_dir>/scripts/artemis.py server start
python3 <skill_dir>/scripts/artemis.py server status
python3 <skill_dir>/scripts/artemis.py server stop
python3 <skill_dir>/scripts/artemis.py submit --goal "..." --profile pro --device SERIAL
python3 <skill_dir>/scripts/artemis.py status TASK_ID
python3 <skill_dir>/scripts/artemis.py stop TASK_ID
```

Optional run controls: `--expected-output`, `--app-package`, `--app-path`, `--verification-level`, `--explorer-mode`, and `--timeout`.

## Safety

- Require explicit user authorization immediately before purchases, financial actions, account changes, destructive deletion, message sending, or publishing.
- Never accept permission dialogs, enter passwords, reveal secrets, or disable device security on the user's behalf.
- When the task only asks to inspect or test, keep the interaction read-only wherever possible.
- Stop and report if the observed app, account, or target differs from the user's request.

## Pitfalls

- `artemis-client` is remote-only: the helper starts a loopback ARTEMIS daemon on demand.
- The first setup downloads the full ARTEMIS runtime and can take several minutes; later invocations reuse it.
- A running local daemon consumes resources but adds no MCP schemas to Hermes context. Stop it with `server stop` when no longer needed.
- The helper refuses non-loopback `ARTEMIS_BASE_URL` values and refuses to use or stop an unidentified process occupying the selected port. It cross-checks lifecycle metadata with the live PID, runtime, working directory, daemon command, listening port, and ARTEMIS identity endpoint.
- Android authorization and Accessibility prompts require the user to act on the device.

## Verification

- `server status` reports a healthy loopback server.
- `doctor` reports no blocking issue.
- `devices` returns the intended serial in state `device` or the server's equivalent ready state.
- A harmless `flash` task such as opening Settings returns a terminal successful status and a trace/task ID.
