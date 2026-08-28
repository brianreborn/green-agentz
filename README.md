# Green-Roomz

Green-Roomz is a local, OpenAI-compatible agent gateway that maps stable functional aliases to host-qualified inference backends. It is llama.cpp-first, but runtime-agnostic: Whisper, Piper/Kokoro, stable-diffusion.cpp, native Android sidecars, and future engines use the same adapter contract.

This is the first executable implementation. It includes:

- a validated ten-agent manifest;
- truthful native and gateway capability reporting;
- structural image/audio routing and session affinity;
- owned subprocess lifecycle management without killing unrelated processes;
- concurrent backends with `responsive`, `balanced`, and `maximize` policies;
- health-driven cold starts and safe pre-stream retries;
- benchmark caching and multi-pass profile selection;
- Windows and Android host fingerprints;
- a dependency-free Node gateway and test suite.

## Quick start on this host

Use the bundled Node executable discovered by Codex:

Models stay on disk under `C:\LocalAI` (not in this repo). Node 24+ is enough.

```powershell
git clone https://github.com/brianreborn/green-roomz.git
cd green-roomz
node --test .\test\*.test.mjs
node .\bin\green-roomz.mjs validate
node .\bin\green-roomz.mjs serve
# or: .\scripts\start-green-roomz.cmd
```

The default manifest is `config/agents.windows.json`. It points at the llama.cpp Vulkan build and existing Qwen/Mistral GGUF files under `C:\LocalAI`. Missing model/runtime artifacts are reported as unavailable; they do not make the registry invalid.

The gateway listens on `127.0.0.1:8080` by default. Set `GREEN_ROOMZ_API_KEY` to require bearer authentication. Public binding is rejected unless an API key is configured and `GREEN_ROOMZ_ALLOW_PUBLIC=1` is explicitly set.

## Commands

```text
green-roomz validate [--manifest path]
green-roomz serve [--manifest path] [--host address] [--port number]
green-roomz benchmark [alias|all] [--manifest path] [--quick] [--force]
green-roomz deploy [--manifest path] [--quick]
green-roomz fingerprint
```

Benchmarking never runs on every request. Results are cached by host fingerprint, driver/runtime identity, agent manifest digest, artifact identity, and candidate profile. A changed fingerprint causes requalification.

## Current scope

The existing text models can be launched after their profiles are qualified. Vision, ASR, embeddings, reranking, safety, TTS, and image generation remain unavailable until their declared artifacts/runtimes are installed. Logical tool routing runs inside the gateway and requires no model for deterministic routes.

Android support currently defines the host/sidecar protocol and fingerprint boundary. The recommended mobile deployment places the gateway in Termux or a container and exposes accelerator-backed inference through a native Android sidecar.
