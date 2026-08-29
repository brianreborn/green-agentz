#!/usr/bin/env python3
"""Per-turn codec usage ledger for /usage-style budgeting.

Commands: record, usage, usage-config
Defaults: window last 3600s OR last 100 messages.
"""
from __future__ import annotations

import json, os, sys, time
from pathlib import Path
from typing import Any

DEFAULT_WINDOW_SECONDS = 3600
DEFAULT_WINDOW_MESSAGES = 100
DEFAULT_MODE = "or"
SCHEMA = "1.0.0"
PROVIDERS = ("gdict-static", "gdict-session", "gdict-user", "cdn", "git", "magnet", "nft", "passthrough")

def workspace() -> Path:
    return Path(os.environ.get("GREEN_WORKSPACE", "/home/workdir/artifacts"))

def runtime() -> Path:
    p = workspace() / ".runtime"
    p.mkdir(parents=True, exist_ok=True)
    return p

def path_log() -> Path:
    return runtime() / "gdict-usage.jsonl"

def path_cfg() -> Path:
    return runtime() / "gdict-usage-config.json"

def now() -> int:
    return int(time.time())

def default_cfg() -> dict[str, Any]:
    return {"schema_version": SCHEMA, "window_seconds": DEFAULT_WINDOW_SECONDS, "window_messages": DEFAULT_WINDOW_MESSAGES, "window_mode": DEFAULT_MODE, "bucket_seconds": 60, "ask_on_change": True, "dashboards": [], "updated_ts": 0}

def load_cfg() -> dict[str, Any]:
    cfg = default_cfg()
    p = path_cfg()
    if p.is_file():
        try:
            raw = json.loads(p.read_text())
            cfg.update({k: raw[k] for k in raw if k in cfg or k == "schema_version"})
        except (json.JSONDecodeError, OSError):
            pass
    cfg["window_seconds"] = int(cfg.get("window_seconds", DEFAULT_WINDOW_SECONDS))
    cfg["window_messages"] = int(cfg.get("window_messages", DEFAULT_WINDOW_MESSAGES))
    mode = str(cfg.get("window_mode", DEFAULT_MODE)).lower()
    cfg["window_mode"] = mode if mode in ("or", "and") else DEFAULT_MODE
    return cfg

def save_cfg(cfg: dict[str, Any]) -> None:
    cfg = dict(cfg)
    cfg["updated_ts"] = now()
    cfg["schema_version"] = SCHEMA
    tmp = path_cfg().with_suffix(".tmp")
    tmp.write_text(json.dumps(cfg, indent=2) + "\n")
    tmp.replace(path_cfg())

def load_events() -> list[dict[str, Any]]:
    p = path_log()
    if not p.is_file():
        return []
    out = []
    for line in p.read_text().splitlines():
        if not line.strip():
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out

def windowed(events: list[dict[str, Any]], cfg: dict[str, Any]) -> list[dict[str, Any]]:
    if not events:
        return []
    tcut = now() - int(cfg["window_seconds"])
    last_n = events[-int(cfg["window_messages"]):]
    last_ids = {id(e) for e in last_n}
    mode = cfg["window_mode"]
    picked = []
    for e in events:
        in_time = int(e.get("ts", 0)) >= tcut
        in_n = id(e) in last_ids
        ok = (in_time or in_n) if mode == "or" else (in_time and in_n)
        if ok:
            picked.append(e)
    return picked

def parse_provider(spec: str):
    if "=" not in spec:
        return None
    name, rest = spec.split("=", 1)
    parts = rest.split(":")
    return name.strip(), {"hits": int(parts[0]) if parts else 0, "pre": int(parts[1]) if len(parts) > 1 else 0, "post": int(parts[2]) if len(parts) > 2 else 0}

def cmd_record(argv: list[str]) -> int:
    if len(argv) < 5:
        print("usage: record ROLE DIRECTION PRE POST [provider=hits:pre:post ...]", file=sys.stderr)
        return 2
    role, direction, pre_s, post_s = argv[1], argv[2], argv[3], argv[4]
    if role not in ("prompt", "response") or direction not in ("compress", "decompress"):
        print("ERROR role/direction", file=sys.stderr)
        return 2
    pre, post = int(pre_s), int(post_s)
    providers = {}
    for spec in argv[5:]:
        parsed = parse_provider(spec)
        if parsed:
            providers[parsed[0]] = parsed[1]
    ev = {"schema_version": SCHEMA, "ts": now(), "turn_id": f"{now()}-{role[0]}-{direction[0]}", "role": role, "direction": direction, "pre_tokens": pre, "post_tokens": post, "saved_tokens": pre - post, "ratio": (round(pre / post, 4) if post else None), "providers": providers}
    with path_log().open("a") as f:
        f.write(json.dumps(ev, separators=(",", ":")) + "\n")
    print(f"OK recorded {role}/{direction} pre={pre} post={post} saved={pre - post} providers={len(providers)}")
    return 0

def _agg(events: list[dict[str, Any]]) -> dict[str, Any]:
    total_pre = total_post = 0
    by_dir = {"compress": {"n": 0, "pre": 0, "post": 0}, "decompress": {"n": 0, "pre": 0, "post": 0}}
    by_role = {"prompt": {"n": 0, "pre": 0, "post": 0}, "response": {"n": 0, "pre": 0, "post": 0}}
    by_prov: dict[str, dict[str, int]] = {}
    for e in events:
        pre = int(e.get("pre_tokens", 0)); post = int(e.get("post_tokens", 0))
        total_pre += pre; total_post += post
        d = e.get("direction") or "compress"
        by_dir.setdefault(d, {"n": 0, "pre": 0, "post": 0})
        by_dir[d]["n"] += 1; by_dir[d]["pre"] += pre; by_dir[d]["post"] += post
        r = e.get("role") or "response"
        by_role.setdefault(r, {"n": 0, "pre": 0, "post": 0})
        by_role[r]["n"] += 1; by_role[r]["pre"] += pre; by_role[r]["post"] += post
        for name, st in (e.get("providers") or {}).items():
            slot = by_prov.setdefault(name, {"hits": 0, "pre": 0, "post": 0})
            slot["hits"] += int(st.get("hits", 0)); slot["pre"] += int(st.get("pre", 0)); slot["post"] += int(st.get("post", 0))
    return {"n": len(events), "pre": total_pre, "post": total_post, "saved": total_pre - total_post, "ratio": (round(total_pre / total_post, 4) if total_post else None), "by_direction": by_dir, "by_role": by_role, "by_provider": by_prov}

def _buckets(events, cfg):
    bucket = max(1, int(cfg.get("bucket_seconds") or 60))
    width = int(cfg["window_seconds"]); tnow = now(); start = tnow - width
    n_b = max(1, (width + bucket - 1) // bucket)
    out = []
    for i in range(n_b - 1, -1, -1):
        lo = max(start, tnow - (i + 1) * bucket); hi = tnow - i * bucket
        rec = _agg([e for e in events if lo <= int(e.get("ts", 0)) < hi])
        rec["lo"] = lo; rec["hi"] = hi
        out.append(rec)
    return out

def write_exports(cfg, filt, win, agg):
    span = 0
    if win:
        ts = [int(e.get("ts", 0)) for e in win]
        span = max(0, max(ts) - min(ts))
    payload = {"schema_version": SCHEMA, "computed_ts": now(), "filter": filt, "window_seconds": cfg["window_seconds"], "window_messages": cfg["window_messages"], "window_mode": cfg["window_mode"], "span_seconds": span, "rate_saved_per_s": round(agg["saved"] / max(1, span or cfg["window_seconds"]), 6), "aggregate": agg, "buckets": _buckets(win, cfg)}
    wp = runtime() / "gdict-usage-window.json"
    tmp = wp.with_suffix(".tmp"); tmp.write_text(json.dumps(payload) + "\n"); tmp.replace(wp)
    lines = ["# TYPE gdict_usage_pre_tokens gauge", "# TYPE gdict_usage_post_tokens gauge", "# TYPE gdict_usage_saved_tokens gauge", "# TYPE gdict_usage_hits gauge", "# TYPE gdict_usage_window_events gauge", f'gdict_usage_window_events {agg["n"]}', f'gdict_usage_window_seconds {cfg["window_seconds"]}', f'gdict_usage_window_messages {cfg["window_messages"]}']
    for d, st in agg["by_direction"].items():
        lines.append(f'gdict_usage_pre_tokens{{direction="{d}",role="",provider=""}} {st["pre"]}')
        lines.append(f'gdict_usage_post_tokens{{direction="{d}",role="",provider=""}} {st["post"]}')
        lines.append(f'gdict_usage_saved_tokens{{direction="{d}",role="",provider=""}} {st["pre"]-st["post"]}')
    for name, st in sorted(agg["by_provider"].items()):
        lines.append(f'gdict_usage_pre_tokens{{direction="",role="",provider="{name}"}} {st["pre"]}')
        lines.append(f'gdict_usage_post_tokens{{direction="",role="",provider="{name}"}} {st["post"]}')
        lines.append(f'gdict_usage_saved_tokens{{direction="",role="",provider="{name}"}} {st["pre"]-st["post"]}')
        lines.append(f'gdict_usage_hits{{provider="{name}"}} {st["hits"]}')
    pp = runtime() / "gdict-usage.prom"
    tmpp = pp.with_suffix(".tmp"); tmpp.write_text("\n".join(lines) + "\n"); tmpp.replace(pp)

def cmd_usage(filt: str) -> int:
    cfg = load_cfg(); events = load_events(); win = windowed(events, cfg)
    if filt in ("compress", "decompress"):
        win = [e for e in win if e.get("direction") == filt]
    agg = _agg(win)
    print(f"USAGE n={agg['n']} window={cfg['window_seconds']}s|{cfg['window_messages']}msg mode={cfg['window_mode']}")
    print(f"TOTAL pre={agg['pre']} post={agg['post']} saved={agg['saved']} ratio={agg['ratio']}")
    for d, st in agg["by_direction"].items():
        if st["n"]:
            ratio = round(st["pre"] / st["post"], 4) if st["post"] else None
            print(f"DIR {d} n={st['n']} pre={st['pre']} post={st['post']} saved={st['pre']-st['post']} ratio={ratio}")
    for r, st in agg["by_role"].items():
        if st["n"]:
            print(f"ROLE {r} n={st['n']} pre={st['pre']} post={st['post']} saved={st['pre']-st['post']}")
    if not agg["by_provider"]:
        print("PROVIDER NONE")
    for name in sorted(agg["by_provider"]):
        st = agg["by_provider"][name]
        ratio = round(st["pre"] / st["post"], 4) if st["post"] else None
        print(f"PROVIDER {name} hits={st['hits']} pre={st['pre']} post={st['post']} saved={st['pre']-st['post']} ratio={ratio}")
    write_exports(cfg, filt, win, agg)
    print(f"EXPORT window={runtime() / 'gdict-usage-window.json'} prom={runtime() / 'gdict-usage.prom'}")
    return 0

def cmd_config_show() -> int:
    print(json.dumps(load_cfg(), indent=2)); return 0

def cmd_config_ask() -> int:
    cfg = load_cfg()
    print("CONFIG_PROMPT change codec usage window? defaults below; reply to change.")
    print(f"  window_seconds={cfg['window_seconds']}  (last hour = 3600)")
    print(f"  window_messages={cfg['window_messages']}  (last 100 messages)")
    print(f"  window_mode={cfg['window_mode']}  (or | and)")
    print("  leave unchanged to keep defaults.")
    return 0

def cmd_config_set(pairs: list[str]) -> int:
    cfg = load_cfg(); allowed = {"window_seconds", "window_messages", "window_mode", "ask_on_change", "bucket_seconds"}; changed = []
    for pair in pairs:
        if "=" not in pair:
            continue
        k, v = pair.split("=", 1)
        if k not in allowed:
            print(f"SKIP unknown {k}", file=sys.stderr); continue
        if k in ("window_seconds", "window_messages", "bucket_seconds"):
            cfg[k] = int(v)
        elif k == "window_mode":
            if v not in ("or", "and"):
                return 2
            cfg[k] = v
        elif k == "ask_on_change":
            cfg[k] = v.lower() in ("1", "true", "yes")
        changed.append(k)
    save_cfg(cfg); print(f"OK config set {','.join(changed) or 'none'}"); return 0

def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr); return 2
    cmd = argv[1]
    if cmd == "record":
        return cmd_record(argv[1:])
    if cmd == "usage":
        filt = argv[2] if len(argv) > 2 else "both"
        if filt not in ("compress", "decompress", "both"):
            return 2
        return cmd_usage(filt)
    if cmd == "usage-config":
        if len(argv) < 3 or argv[2] == "show":
            return cmd_config_show()
        if argv[2] == "ask":
            return cmd_config_ask()
        if argv[2] == "set":
            return cmd_config_set(argv[3:])
        return 2
    return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv))
