#!/usr/bin/env python3
"""GDICT LRU codebook store — control-plane strings only.

Commands (argv):
  put   KIND PHRASE [ID]   — insert/refresh; may evict
  hit   ID                 — record use
  get   ID | PHRASE        — lookup
  evict [N]                — force-evict N LRU entries (default 1)
  list                     — dump entries oldest-first
  stats                    — rollup hits / sizes
  session-end              — flush SESSION_END stats lines
  promote ID               — session → user (if present)

Env:
  GREEN_WORKSPACE  workspace root (default /home/workdir/artifacts)
  GDICT_SESSION_CAP  default 512
  GDICT_USER_CAP     default 512
  GDICT_BLOOM_M      bit-array size (default 8192 counters)
  GDICT_BLOOM_K      hash functions (default 4)
"""
from __future__ import annotations

import json
import os
import sys
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any
import hashlib

# --- Counting Bloom filter (deletes-safe for LRU) -----------------------------
# Classic Bloom cannot delete; we use 8-bit counters so evict can decrement.
# False positives possible; false negatives are not (unless counter saturates).

class CountingBloom:
    """Membership sketch for control-plane phrases.

    m counters, k hash probes. Optimized for negative lookups on put/get
    so we skip scanning OrderedDict when the phrase was never inserted.
    """

    __slots__ = ("m", "k", "counters", "inserts", "negatives", "positives")

    def __init__(self, m: int | None = None, k: int | None = None,
                 counters: list[int] | None = None):
        self.m = int(m or os.environ.get("GDICT_BLOOM_M", "8192"))
        self.k = int(k or os.environ.get("GDICT_BLOOM_K", "4"))
        if self.m < 64:
            self.m = 64
        if self.k < 1:
            self.k = 1
        if counters is not None and len(counters) == self.m:
            self.counters = [int(c) & 0xFF for c in counters]
        else:
            self.counters = [0] * self.m
        self.inserts = 0
        self.negatives = 0
        self.positives = 0

    def _indexes(self, phrase: str) -> list[int]:
        raw = phrase.encode("utf-8", errors="replace")
        h1 = int.from_bytes(hashlib.blake2b(raw, digest_size=8).digest(), "little")
        h2 = int.from_bytes(hashlib.blake2b(raw + b"\x01", digest_size=8).digest(), "little") or 1
        return [(h1 + i * h2) % self.m for i in range(self.k)]

    def add(self, phrase: str) -> None:
        for idx in self._indexes(phrase):
            if self.counters[idx] < 255:
                self.counters[idx] += 1
        self.inserts += 1

    def remove(self, phrase: str) -> None:
        for idx in self._indexes(phrase):
            if self.counters[idx] > 0:
                self.counters[idx] -= 1

    def might_contain(self, phrase: str) -> bool:
        for idx in self._indexes(phrase):
            if self.counters[idx] == 0:
                self.negatives += 1
                return False
        self.positives += 1
        return True

    def to_json(self) -> dict:
        nz = {str(i): c for i, c in enumerate(self.counters) if c}
        return {
            "m": self.m,
            "k": self.k,
            "nz": nz,
            "inserts": self.inserts,
            "negatives": self.negatives,
            "positives": self.positives,
        }

    @classmethod
    def from_json(cls, data: dict | None) -> "CountingBloom":
        if not data:
            return cls()
        m = int(data.get("m", 8192))
        k = int(data.get("k", 4))
        counters = [0] * m
        for i_str, c in data.get("nz", {}).items():
            i = int(i_str)
            if 0 <= i < m:
                counters[i] = int(c) & 0xFF
        bf = cls(m=m, k=k, counters=counters)
        bf.inserts = int(data.get("inserts", 0))
        bf.negatives = int(data.get("negatives", 0))
        bf.positives = int(data.get("positives", 0))
        return bf

    def approx_fill(self) -> float:
        nonzero = sum(1 for c in self.counters if c)
        return nonzero / self.m if self.m else 0.0


SCHEMA = "1.0.0"
DEFAULT_SESSION_CAP = int(os.environ.get("GDICT_SESSION_CAP", "512"))
DEFAULT_USER_CAP = int(os.environ.get("GDICT_USER_CAP", "512"))


def workspace() -> Path:
    return Path(os.environ.get("GREEN_WORKSPACE", "/home/workdir/artifacts"))


def runtime() -> Path:
    p = workspace() / ".runtime"
    p.mkdir(parents=True, exist_ok=True)
    return p


def path_session() -> Path:
    return runtime() / "gdict-session.json"


def path_user() -> Path:
    return runtime() / "gdict-user.json"


def path_stats() -> Path:
    return runtime() / "gdict-stats.log"


def path_static() -> Path:
    here = Path(__file__).resolve().parent.parent / "assets" / "gdict-1.0.0.txt"
    return here


def now() -> int:
    return int(time.time())


def empty_store(kind: str, cap: int) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA,
        "kind": kind,
        "cap": cap,
        "next_id": 1,
        "entries": OrderedDict(),
        "bloom": CountingBloom(),
    }


def load_store(path: Path, kind: str, cap: int) -> dict[str, Any]:
    if not path.is_file():
        return empty_store(kind, cap)
    try:
        raw = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return empty_store(kind, cap)
    entries = OrderedDict()
    for eid, ent in raw.get("entries", {}).items():
        entries[eid] = ent
    ordered = OrderedDict(
        sorted(entries.items(), key=lambda kv: (kv[1].get("last_ts", 0), kv[0]))
    )
    bloom = CountingBloom.from_json(raw.get("bloom"))
    if ordered and bloom.inserts == 0 and not any(bloom.counters):
        for ent in ordered.values():
            ph = ent.get("phrase") or ""
            if ph:
                bloom.add(ph)
    return {
        "schema_version": raw.get("schema_version", SCHEMA),
        "kind": kind,
        "cap": int(raw.get("cap", cap)),
        "next_id": int(raw.get("next_id", 1)),
        "entries": ordered,
        "bloom": bloom,
    }


def save_store(path: Path, store: dict[str, Any]) -> None:
    bloom = store.get("bloom") or CountingBloom()
    payload = {
        "schema_version": store["schema_version"],
        "kind": store["kind"],
        "cap": store["cap"],
        "next_id": store["next_id"],
        "entries": dict(store["entries"]),
        "bloom": bloom.to_json() if hasattr(bloom, "to_json") else {},
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n")
    tmp.replace(path)


def append_stat(event: str, eid: str, kind: str, hits: int, tok_save: int, note: str = "") -> None:
    line = f"{now()} {event} {eid} {kind} {hits} {tok_save} {note}\n"
    with path_stats().open("a") as f:
        f.write(line)


def est_tokens(phrase: str) -> int:
    if not phrase:
        return 0
    parts = [p for p in phrase.replace("=", " ").replace("/", " ").split() if p]
    return max(1, len(parts))


def est_save(phrase: str, eid: str) -> int:
    return max(0, est_tokens(phrase) - 1)


def touch(store: dict[str, Any], eid: str) -> None:
    entries: OrderedDict = store["entries"]
    if eid not in entries:
        return
    ent = entries.pop(eid)
    ent["last_ts"] = now()
    entries[eid] = ent


def evict_lru(store: dict[str, Any], n: int = 1) -> list[dict[str, Any]]:
    entries: OrderedDict = store["entries"]
    evicted = []
    for _ in range(min(n, len(entries))):
        eid, ent = entries.popitem(last=False)
        phrase = ent.get("phrase", "") or ""
        bloom = store.get("bloom")
        if bloom is not None and phrase:
            bloom.remove(phrase)
        save = est_save(phrase, eid) * int(ent.get("hits", 0))
        append_stat("DELETE", eid, ent.get("kind", store["kind"]), int(ent.get("hits", 0)), save, "lru")
        evicted.append({"id": eid, **ent})
    return evicted


def ensure_cap(store: dict[str, Any]) -> list[dict[str, Any]]:
    evicted = []
    while len(store["entries"]) > store["cap"]:
        evicted.extend(evict_lru(store, 1))
    return evicted


def alloc_id(store: dict[str, Any], prefix: str) -> str:
    n = store["next_id"]
    store["next_id"] = n + 1
    return f"{prefix}{n}"


def find_by_phrase(store: dict[str, Any], phrase: str) -> str | None:
    for eid, ent in store["entries"].items():
        if ent.get("phrase") == phrase:
            return eid
    return None


def cmd_put(kind: str, phrase: str, forced_id: str | None = None) -> int:
    if not phrase or len(phrase) > 2048:
        print("ERROR put: empty or too long", file=sys.stderr)
        return 1
    if len(phrase) >= 32 and all(c in "0123456789abcdefABCDEF" for c in phrase):
        print("SKIP put: hash-like", file=sys.stderr)
        return 0

    store = load_store(path_session(), "session", DEFAULT_SESSION_CAP)
    bloom = store.get("bloom") or CountingBloom()
    store["bloom"] = bloom
    if not bloom.might_contain(phrase):
        existing = None
    else:
        existing = find_by_phrase(store, phrase)
    if existing:
        touch(store, existing)
        store["entries"][existing]["hits"] = int(store["entries"][existing].get("hits", 0)) + 1
        save_store(path_session(), store)
        append_stat("HIT", existing, kind, store["entries"][existing]["hits"], est_save(phrase, existing), "put-refresh")
        print(f"OK id={existing} hits={store['entries'][existing]['hits']} action=refresh")
        return 0

    eid = forced_id or alloc_id(store, "s")
    if eid in store["entries"]:
        touch(store, eid)
        store["entries"][eid]["phrase"] = phrase
        store["entries"][eid]["kind"] = kind
        store["entries"][eid]["hits"] = int(store["entries"][eid].get("hits", 0)) + 1
        action = "update"
    else:
        store["entries"][eid] = {
            "phrase": phrase,
            "kind": kind,
            "hits": 1,
            "created_ts": now(),
            "last_ts": now(),
            "source": "session",
        }
        bloom.add(phrase)
        action = "add"
        append_stat("ADD", eid, kind, 1, 0, "session")

    evicted = ensure_cap(store)
    save_store(path_session(), store)
    extra = f" evicted={len(evicted)}" if evicted else ""
    print(f"OK id={eid} hits={store['entries'][eid]['hits']} action={action}{extra}")
    return 0


def cmd_hit(eid: str) -> int:
    store = load_store(path_session(), "session", DEFAULT_SESSION_CAP)
    user = load_store(path_user(), "user", DEFAULT_USER_CAP)
    target = None
    which = None
    if eid in store["entries"]:
        target, which = store, "session"
    elif eid in user["entries"]:
        target, which = user, "user"
    else:
        print(f"MISS id={eid}")
        return 1
    touch(target, eid)
    target["entries"][eid]["hits"] = int(target["entries"][eid].get("hits", 0)) + 1
    hits = target["entries"][eid]["hits"]
    phrase = target["entries"][eid].get("phrase", "")
    append_stat("HIT", eid, target["entries"][eid].get("kind", which), hits, est_save(phrase, eid), which)
    if which == "session":
        save_store(path_session(), target)
    else:
        save_store(path_user(), target)
    print(f"OK id={eid} hits={hits} store={which}")
    return 0


def cmd_get(key: str) -> int:
    stores = [
        ("session", load_store(path_session(), "session", DEFAULT_SESSION_CAP), path_session()),
        ("user", load_store(path_user(), "user", DEFAULT_USER_CAP), path_user()),
    ]
    for name, store, spath in stores:
        if key in store["entries"]:
            ent = store["entries"][key]
            print(f"OK store={name} id={key} kind={ent.get('kind')} hits={ent.get('hits')} phrase={ent.get('phrase')}")
            return 0
        bloom = store.get("bloom") or CountingBloom()
        store["bloom"] = bloom
        if not bloom.might_contain(key):
            save_store(spath, store)
            continue
        found = find_by_phrase(store, key)
        save_store(spath, store)
        if found:
            ent = store["entries"][found]
            print(f"OK store={name} id={found} kind={ent.get('kind')} hits={ent.get('hits')} phrase={ent.get('phrase')}")
            return 0
    print("MISS")
    return 1


def cmd_evict(n: int) -> int:
    store = load_store(path_session(), "session", DEFAULT_SESSION_CAP)
    before = len(store["entries"])
    evicted = evict_lru(store, n)
    save_store(path_session(), store)
    print(f"OK evicted={len(evicted)} before={before} after={len(store['entries'])}")
    for e in evicted:
        print(f"EVICT id={e['id']} hits={e.get('hits')} kind={e.get('kind')}")
    return 0


def cmd_list() -> int:
    store = load_store(path_session(), "session", DEFAULT_SESSION_CAP)
    print(f"session size={len(store['entries'])} cap={store['cap']} (LRU oldest first)")
    for eid, ent in store["entries"].items():
        print(f"{eid}\thits={ent.get('hits')}\tlast={ent.get('last_ts')}\t{ent.get('kind')}\t{ent.get('phrase')[:80]}")
    user = load_store(path_user(), "user", DEFAULT_USER_CAP)
    print(f"user size={len(user['entries'])} cap={user['cap']}")
    for eid, ent in user["entries"].items():
        print(f"{eid}\thits={ent.get('hits')}\tlast={ent.get('last_ts')}\t{ent.get('kind')}\t{ent.get('phrase')[:80]}")
    return 0


def cmd_stats() -> int:
    store = load_store(path_session(), "session", DEFAULT_SESSION_CAP)
    user = load_store(path_user(), "user", DEFAULT_USER_CAP)
    def rollup(name, st):
        total_hits = sum(int(e.get("hits", 0)) for e in st["entries"].values())
        total_save = sum(est_save(e.get("phrase", ""), i) * int(e.get("hits", 0)) for i, e in st["entries"].items())
        print(f"{name} size={len(st['entries'])} cap={st['cap']} hits={total_hits} est_tok_saved={total_save}")
    rollup("session", store)
    rollup("user", user)
    for name, st in (("session", store), ("user", user)):
        bloom = st.get("bloom")
        if bloom is not None:
            print(f"bloom_{name} m={bloom.m} k={bloom.k} fill={bloom.approx_fill():.4f} inserts={bloom.inserts} neg={bloom.negatives} pos={bloom.positives}")
    sp = path_stats()
    if sp.is_file():
        lines = sp.read_text().strip().splitlines()
        print(f"stats_log lines={len(lines)} path={sp}")
    else:
        print("stats_log lines=0")
    return 0


def cmd_session_end() -> int:
    store = load_store(path_session(), "session", DEFAULT_SESSION_CAP)
    user = load_store(path_user(), "user", DEFAULT_USER_CAP)
    for name, st in (("session", store), ("user", user)):
        for eid, ent in st["entries"].items():
            append_stat("SESSION_END", eid, ent.get("kind", name), int(ent.get("hits", 0)), est_save(ent.get("phrase", ""), eid) * int(ent.get("hits", 0)), name)
    print(f"OK session-end session={len(store['entries'])} user={len(user['entries'])}")
    return 0


def cmd_promote(eid: str) -> int:
    store = load_store(path_session(), "session", DEFAULT_SESSION_CAP)
    if eid not in store["entries"]:
        print(f"MISS id={eid}")
        return 1
    ent = store["entries"].pop(eid)
    user = load_store(path_user(), "user", DEFAULT_USER_CAP)
    uid = eid if eid.startswith("u") else f"u{eid.lstrip('s')}"
    ent["source"] = "user"
    ent["last_ts"] = now()
    user["entries"][uid] = ent
    ensure_cap(user)
    save_store(path_session(), store)
    save_store(path_user(), user)
    append_stat("PROMOTE", uid, ent.get("kind", "user"), int(ent.get("hits", 0)), 0, eid)
    print(f"OK promoted {eid} -> {uid}")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    cmd = argv[1]
    if cmd == "put":
        if len(argv) < 4:
            print("usage: put KIND PHRASE [ID]", file=sys.stderr)
            return 2
        kind, phrase = argv[2], argv[3]
        forced = argv[4] if len(argv) > 4 else None
        return cmd_put(kind, phrase, forced)
    if cmd == "hit":
        return cmd_hit(argv[2]) if len(argv) > 2 else 2
    if cmd == "get":
        return cmd_get(argv[2]) if len(argv) > 2 else 2
    if cmd == "evict":
        n = int(argv[2]) if len(argv) > 2 else 1
        return cmd_evict(n)
    if cmd == "list":
        return cmd_list()
    if cmd == "stats":
        return cmd_stats()
    if cmd == "session-end":
        return cmd_session_end()
    if cmd == "promote":
        return cmd_promote(argv[2]) if len(argv) > 2 else 2
    print(f"unknown command: {cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
