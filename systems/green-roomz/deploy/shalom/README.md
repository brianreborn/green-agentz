# deploy/shalom

Native Windows (SHALOM) bring-up for the green-roomz gateway. These scripts were
reconciled in from the former `master` branch (android-pack/grz-termux layout) and
the live `C:/LocalAI` deploy checkout on 2026-08-29. Full pre-reconcile history is
kept as tag `archive/master-localai-2026-08-29`.

- `shalom-start.ps1` — top-level launcher: starts the native backend (:8081) then
  the gateway (:8080), waits for health, optional `-SmokeTest`.
- `native-engines.ps1` — llama.cpp Vulkan/CPU engine launcher with tuning flags
  and CPU fallback.
- `start-gateway.ps1` — node gateway launcher.
- `parallel-fleet-bootstrap.ps1` — fan-out bootstrap across the host fleet.
- `qodesh-startup.ps1` / `qodesh-maintenance.ps1` — qodesh host lifecycle.
- `benchmark-all-models.ps1` — model sweep.
- `agents-bootstrap.json` — bootstrap manifest seed.

The runtime model store stays at `C:/LocalAI` (gguf files, not tracked here).
