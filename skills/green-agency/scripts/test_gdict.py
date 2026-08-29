#!/usr/bin/env python3
"""Smoke + conformance tests for gdict_lru.py and gdict_usage.py.

Run: python test_gdict.py   (exit 0 = pass)
No network, no deps. Uses a throwaway GREEN_WORKSPACE per test.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
LRU = HERE / "gdict_lru.py"
USAGE = HERE / "gdict_usage.py"
FAILURES: list[str] = []


def run(script: Path, *args: str, ws: Path) -> subprocess.CompletedProcess:
    env = dict(os.environ, GREEN_WORKSPACE=str(ws))
    return subprocess.run([sys.executable, str(script), *args], capture_output=True, text=True, env=env)


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"{'ok  ' if cond else 'FAIL'} {name}{'  -- ' + detail if detail and not cond else ''}")
    if not cond:
        FAILURES.append(name)


def test_lru_roundtrip() -> None:
    with tempfile.TemporaryDirectory() as d:
        ws = Path(d)
        assert run(LRU, "put", "code", "def process_batch(", "p1", ws=ws).returncode == 0
        assert run(LRU, "put", "code", "return json.dumps(", "p2", ws=ws).returncode == 0
        r = run(LRU, "hit", "p1", ws=ws)
        check("lru hit increments", "hits=2" in r.stdout, r.stdout)
        r = run(LRU, "get", "p1", ws=ws)
        check("lru get resolves id", "def process_batch(" in r.stdout, r.stdout)
        before = run(LRU, "list", ws=ws).stdout.count("\thits=")
        r = run(LRU, "evict", "1", ws=ws)
        check("lru evict reports one eviction", "evicted=1" in r.stdout, r.stdout)
        after = run(LRU, "list", ws=ws).stdout.count("\thits=")
        check("lru evict drops exactly one entry", before - after == 1, f"{before}->{after}")
        # NOTE: which entry is evicted is unstable when put/hit land in the same
        # wall-clock second (tie-break falls through to dict order). Minor; see
        # docs/architecture reconciliation notes.


def test_usage_openmetrics_conformance() -> None:
    with tempfile.TemporaryDirectory() as d:
        ws = Path(d)
        assert run(USAGE, "record", "prompt", "compress", "500", "180",
                   "gdict-session=12:500:180", ws=ws).returncode == 0
        assert run(USAGE, "record", "response", "decompress", "90", "300",
                   "cdn=3:90:300", ws=ws).returncode == 0
        r = run(USAGE, "usage", "both", ws=ws)
        check("usage command succeeds", r.returncode == 0, r.stderr)
        prom_path = ws / ".runtime" / "gdict-usage.prom"
        check("prom file written", prom_path.is_file())
        raw = prom_path.read_bytes()
        check("prom is LF-only (no CR)", b"\r" not in raw, repr(raw[:80]))
        text = raw.decode()
        check("prom ends with '# EOF\\n' (OpenMetrics 1.0)", text.endswith("# EOF\n"), repr(text[-20:]))
        check("every sampled family has a # TYPE",
              all(f"# TYPE {m} " in text
                  for m in ("gdict_usage_window_events", "gdict_usage_window_seconds",
                            "gdict_usage_window_messages", "gdict_usage_pre_tokens",
                            "gdict_usage_hits")))
        check("provider rollup present", 'provider="gdict-session"' in text and 'provider="cdn"' in text)
        check("saved math (compress 500->180 = 320)",
              'gdict_usage_saved_tokens{direction="compress",role="",provider=""} 320' in text, text)


def test_usage_window_config() -> None:
    with tempfile.TemporaryDirectory() as d:
        ws = Path(d)
        r = run(USAGE, "usage-config", "show", ws=ws)
        cfg = json.loads(r.stdout)
        check("default window is last hour OR last 100 msgs",
              cfg["window_seconds"] == 3600 and cfg["window_messages"] == 100 and cfg["window_mode"] == "or")
        assert run(USAGE, "usage-config", "set", "window_mode=and", ws=ws).returncode == 0
        r = run(USAGE, "usage-config", "show", ws=ws)
        check("window_mode persists", json.loads(r.stdout)["window_mode"] == "and")


for fn in (test_lru_roundtrip, test_usage_openmetrics_conformance, test_usage_window_config):
    fn()

print(f"\n{len(FAILURES)} failure(s)" if FAILURES else "\nall passed")
sys.exit(1 if FAILURES else 0)
