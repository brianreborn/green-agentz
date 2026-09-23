#!/usr/bin/env python3
"""Cross-platform Zkillz runner for green-agentz (Issue #10).
Zero dependencies (standard library only). Runs on Windows, POSIX, Linux, macOS.

Subcommands:
  probe                 REQ-SK00-01..04 attestation and cache refresh
  safe-write            REQ-SYS-02/03 atomic snapshot and write
  index-tree            REQ-SK02-01 recursive compact workspace index
  syntax-check          REQ-SK02-03 lightweight native syntax check
  normalize-md          REQ-SK03-01 normalize markdown (whitespace, LF)
  flatten-manuscript    REQ-SK04-03 flatten chapters into MANUSCRIPT.md
  output-proxy          REQ-SYS-06 collapse raw compiler/test logs
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

def now() -> int:
    return int(time.time())

def get_workspace() -> Path:
    return Path(os.environ.get("GREEN_WORKSPACE", ".")).resolve()

def get_runtime() -> Path:
    p = get_workspace() / ".runtime"
    p.mkdir(parents=True, exist_ok=True)
    return p

# ---------------------------------------------------------------------------
# probe (REQ-SK00-01..04)
# ---------------------------------------------------------------------------
def cmd_probe(args: list[str]) -> int:
    root = get_workspace()
    runtime = get_runtime()
    cache_file = runtime / "probe_cache.json"
    audit_file = runtime / "audit.log"
    ttl = int(os.environ.get("GREEN_PROBE_TTL", "300"))
    ts = now()

    is_windows = os.name == "nt"
    tier = "STATELESS_CHAT"
    sandbox = "HOST_NATIVE" if is_windows else "STATELESS"
    fs = "NONE"
    net = False

    if os.environ.get("GITHUB_ACTIONS") or os.environ.get("CI"):
        tier = "AGY_SANDBOX"
        sandbox = "ISOLATED_LINUX"
    elif not is_windows and Path("/home/workdir").is_dir() and os.access("/home/workdir", os.W_OK):
        tier = "SUPERGROK_ENGINE"
        sandbox = "ISOLATED_LINUX"
        fs = "READ_WRITE"
        net = True
    elif os.access(root, os.W_OK):
        tier = "HOST_DEV" if is_windows else "AGY_SANDBOX"
        sandbox = "HOST_NATIVE" if is_windows else "ISOLATED_LINUX"
        fs = "READ_WRITE"
    elif os.access(root, os.R_OK):
        tier = "HOST_DEV" if is_windows else "AGY_SANDBOX"
        sandbox = "HOST_NATIVE" if is_windows else "ISOLATED_LINUX"
        fs = "READ_ONLY"

    if not net and any(os.environ.get(k) for k in ("http_proxy", "https_proxy", "SSH_CONNECTION")):
        net = True

    blind = False
    mech = "NONE"
    if os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN"):
        mech = "API_OAUTH_TOKEN"
    elif tier == "SUPERGROK_ENGINE":
        mech = "SYSTEM_PROMPT_ENFORCED"

    writable = os.access(runtime, os.W_OK)
    path_hash = hashlib.sha256(str(root).encode("utf-8")).hexdigest() if writable else "none"
    if writable:
        fs = "READ_WRITE"

    deps = []
    for pkg in ("bash", "make", "python3", "python", "git", "rustc", "cl", "gcc", "cc"):
        if shutil.which(pkg):
            deps.append({"package": pkg, "origin": "host", "signature_verified": False})

    expiry = ts + ttl
    attestation = {
        "host_tier": tier,
        "identity_posture": {"asserted_blindness": blind, "attestation_mechanism": mech},
        "capabilities": {"file_system": fs, "network_egress": net, "execution_sandbox": sandbox},
    }
    att_str = json.dumps(attestation, separators=(",", ":"))
    state_hash = hashlib.sha256(f"{att_str}{root}{ts}".encode("utf-8")).hexdigest()

    sys02_status = "PASS" if writable else "FAIL"
    sk02_status = "PASS" if writable else "FAIL"

    cache_data = {
        "cache_metadata": {
            "schema_version": "1.0.0",
            "last_probe_timestamp": ts,
            "global_state_hash": state_hash,
        },
        "environment_attestation": attestation,
        "deduplication_registry": {
            "file_systems": {str(root): {"writable": writable, "path_hash": path_hash}},
            "verified_dependencies": deps,
        },
        "short_circuit_tokens": {
            "REQ-SYS-02": {"status": sys02_status, "ttl_expiry": expiry},
            "REQ-SK00-01": {"status": "PASS", "ttl_expiry": expiry},
            "REQ-SK00-02": {"status": sk02_status, "ttl_expiry": expiry},
        },
    }

    if writable:
        cache_file.write_text(json.dumps(cache_data, indent=2) + "\n", encoding="utf-8")
        with audit_file.open("a", encoding="utf-8") as af:
            af.write(f"{ts} PROBE {cache_file} OK tier={tier}\n")

    cache_path_str = str(cache_file) if cache_file.exists() else "NONE"
    print(f"STATUS host_tier={tier} fs={fs} net={'true' if net else 'false'} sandbox={sandbox} "
          f"identity={mech} writable={'true' if writable else 'false'} hash={state_hash} cache={cache_path_str}")
    print(f"DEPS {json.dumps(deps)}")
    print("DEFAULTS block_unverified_codecs=true block_bulky_third_party=true")
    return 0

# ---------------------------------------------------------------------------
# safe-write (REQ-SYS-02/03)
# ---------------------------------------------------------------------------
def cmd_safe_write(args: list[str]) -> int:
    if not args:
        print("ERROR_TOKEN: safe-write requires target path", file=sys.stderr)
        return 2
    target = Path(args[0]).resolve()
    src = Path(args[1]).resolve() if len(args) > 1 else None

    runtime = get_runtime()
    audit_file = runtime / "audit.log"
    ts = now()

    def log_audit(action: str, target_p: str, result: str, note: str = ""):
        with audit_file.open("a", encoding="utf-8") as f:
            f.write(f"{ts} {action} {target_p} {result} {note}\n")

    parent = target.parent
    if not parent.exists():
        try:
            parent.mkdir(parents=True, exist_ok=True)
            log_audit("MKDIR", str(parent), "OK")
        except OSError:
            log_audit("MKDIR", str(parent), "FAIL")
            print(f"ERROR_TOKEN: FS_PERMISSION_DENIED {parent}", file=sys.stderr)
            return 2

    if not os.access(parent, os.W_OK):
        log_audit("PROBE", str(parent), "FAIL", "not_writable")
        print(f"ERROR_TOKEN: FS_PERMISSION_DENIED {parent}", file=sys.stderr)
        return 2

    if target.exists():
        if not os.access(target, os.R_OK):
            log_audit("PROBE", str(target), "FAIL", "not_readable")
            print(f"ERROR_TOKEN: FS_PERMISSION_DENIED {target}", file=sys.stderr)
            return 2
        bak = target.with_name(target.name + ".bak")
        if bak.exists():
            rot = target.with_name(f"{target.name}.bak.{ts}")
            shutil.copy2(bak, rot)
            log_audit("BACKUP", str(bak), "OK", f"rotated:{rot}")
        shutil.copy2(target, bak)
        log_audit("BACKUP", str(target), "OK", str(bak))

    if src:
        shutil.copy2(src, target)
    else:
        content = sys.stdin.read()
        target.write_text(content, encoding="utf-8")

    log_audit("WRITE", str(target), "OK")
    print(f"OK {target}")
    return 0

# ---------------------------------------------------------------------------
# index-tree (REQ-SK02-01)
# ---------------------------------------------------------------------------
def cmd_index_tree(args: list[str]) -> int:
    root = Path(args[0] if args else ".").resolve()
    max_entries = 400
    if len(args) >= 3 and args[1] == "--max":
        max_entries = int(args[2])

    if not os.access(root, os.R_OK):
        print(f"ERROR_TOKEN: FS_PERMISSION_DENIED {root}", file=sys.stderr)
        return 2

    prune = {".git", "node_modules", ".venv", "target", "dist", "build", ".runtime", "__pycache__"}
    entries = []

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in prune]
        rel_dir = os.path.relpath(dirpath, root)
        if rel_dir != ".":
            entries.append(("D", str(Path(dirpath))))
            if len(entries) > max_entries:
                break
        for f in filenames:
            fp = Path(dirpath) / f
            try:
                sz = fp.stat().st_size
            except OSError:
                sz = 0
            entries.append(("F", sz, str(fp)))
            if len(entries) > max_entries:
                break
        if len(entries) > max_entries:
            break

    truncated = len(entries) > max_entries
    if truncated:
        entries = entries[:max_entries]

    print(f"tree_root={root} entries={len(entries)} truncated={'true' if truncated else 'false'}")
    for item in entries:
        if item[0] == "D":
            print(f"D {item[1]}")
        else:
            print(f"F {item[1]} {item[2]}")
    return 0

# ---------------------------------------------------------------------------
# syntax-check (REQ-SK02-03)
# ---------------------------------------------------------------------------
def cmd_syntax_check(args: list[str]) -> int:
    if not args:
        print("ERROR_TOKEN: file required", file=sys.stderr)
        return 2
    target = Path(args[0]).resolve()
    if not target.is_file() or not os.access(target, os.R_OK):
        print(f"ERROR_TOKEN: FS_PERMISSION_DENIED {target}", file=sys.stderr)
        return 2

    ext = target.suffix.lstrip(".").lower()
    status = "OK"
    detail = "none"

    if ext in ("py",):
        import py_compile
        try:
            py_compile.compile(str(target), doraise=True)
        except py_compile.PyCompileError as e:
            status = "FAIL"
            detail = str(e).replace("\n", "; ")
    elif ext in ("json",):
        try:
            json.loads(target.read_text(encoding="utf-8"))
        except Exception as e:
            status = "FAIL"
            detail = str(e).replace("\n", "; ")
    elif ext in ("md", "markdown", "txt"):
        status = "OK"
        detail = "prose"
    elif ext in ("sh", "bash"):
        if shutil.which("bash"):
            import subprocess
            res = subprocess.run(["bash", "-n", str(target)], capture_output=True, text=True)
            if res.returncode != 0:
                status = "FAIL"
                detail = res.stderr.strip().replace("\n", "; ")
        else:
            status = "SKIP"
            detail = "no_bash"
    elif ext in ("rs",):
        if shutil.which("rustc"):
            import subprocess
            res = subprocess.run(["rustc", "--edition", "2021", "--emit=metadata", "--crate-type", "lib", str(target)], capture_output=True, text=True)
            if res.returncode != 0:
                status = "FAIL"
                detail = res.stderr.strip().replace("\n", "; ")
        else:
            status = "SKIP"
            detail = "no_rustc"
    elif ext in ("c", "h", "cc", "cpp"):
        cc = shutil.which("cc") or shutil.which("gcc") or shutil.which("cl")
        if cc:
            import subprocess
            cmd = [cc, "-fsyntax-only", str(target)] if "cl" not in cc.lower() else [cc, "/Zs", str(target)]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                status = "FAIL"
                detail = res.stderr.strip().replace("\n", "; ")
        else:
            status = "SKIP"
            detail = "no_cc"
    elif ext in ("mk", "makefile") or target.name.lower() == "makefile":
        status = "OK"
        detail = "makefile_unchecked"
    else:
        status = "SKIP"
        detail = "no_native_checker"

    print(f"syntax file={target} status={status} detail={detail}")
    return 0 if status != "FAIL" else 1

# ---------------------------------------------------------------------------
# normalize-md (REQ-SK03-01)
# ---------------------------------------------------------------------------
def cmd_normalize_md(args: list[str]) -> int:
    if not args:
        print("ERROR_TOKEN: markdown file required", file=sys.stderr)
        return 2
    p = Path(args[0]).resolve()
    if not p.is_file() or not os.access(p, os.R_OK):
        print(f"ERROR_TOKEN: FS_PERMISSION_DENIED {p}", file=sys.stderr)
        return 2

    text = p.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    lines = [ln.rstrip() for ln in text.split("\n")]
    out, blank = [], 0
    for ln in lines:
        if ln == "":
            blank += 1
            if blank <= 2:
                out.append(ln)
        else:
            blank = 0
            out.append(ln)
    while out and out[-1] == "":
        out.pop()
    sys.stdout.write("\n".join(out) + "\n")
    return 0

# ---------------------------------------------------------------------------
# flatten-manuscript (REQ-SK04-03)
# ---------------------------------------------------------------------------
def cmd_flatten_manuscript(args: list[str]) -> int:
    man_path = Path(args[0] if args else "MANUSCRIPT.json").resolve()
    out_path = Path(args[1] if len(args) > 1 else "MANUSCRIPT.md").resolve()
    if not man_path.is_file() or not os.access(man_path, os.R_OK):
        print(f"ERROR_TOKEN: FS_PERMISSION_DENIED {man_path}", file=sys.stderr)
        return 2

    man = json.loads(man_path.read_text(encoding="utf-8"))
    parts = []
    title = man.get("title") or "Manuscript"
    ver = man.get("version") or ""
    parts.append(f"# {title}")
    if ver:
        parts.append(f"_version {ver}_\n")
    for ch in man.get("chapters") or []:
        cid = ch.get("id") or ""
        ctitle = ch.get("title") or cid
        parts.append(f"## {ctitle}")
        if cid:
            parts.append(f"`{cid}`")
        prose = (ch.get("prose") or "").rstrip()
        if prose:
            parts.append(prose)
        for src in ch.get("sources") or []:
            sp = Path(src)
            parts.append(f"### Source `{src}`")
            if sp.is_file():
                body = sp.read_text(encoding="utf-8", errors="replace")
                ext = sp.suffix.lstrip(".") or "text"
                parts.append(f"```{ext}\n{body.rstrip()}\n```")
            else:
                parts.append(f"_missing source {src}_")
        parts.append("")
    out_path.write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")
    print(f"OK {out_path}")
    return 0

# ---------------------------------------------------------------------------
# output-proxy (REQ-SYS-06)
# ---------------------------------------------------------------------------
def cmd_output_proxy(args: list[str]) -> int:
    max_hits = 40
    if len(args) >= 2 and args[0] == "--max":
        max_hits = int(args[1])

    raw_text = sys.stdin.read()
    lines = raw_text.splitlines()
    unique_lines = sorted(set(lines))

    print(f"proxy_summary lines={len(lines)} unique={len(unique_lines)}")

    hit_re = re.compile(r"^[^:]+:\d+(?::\d+)?:.*(?:error|warning|Error|Warning|FAIL)", re.IGNORECASE)
    hits = [line for line in lines if hit_re.search(line)]

    if hits:
        print("diagnostics:")
        for h in hits[:max_hits]:
            print(h)
        if len(hits) > max_hits:
            print(f"diagnostics_omitted={len(hits) - max_hits}")

    payload_hash = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()
    print(f"payload_hash={payload_hash}")

    if not hits:
        print("head:")
        for line in unique_lines[:8]:
            print(line)
        print("tail:")
        for line in unique_lines[-8:]:
            print(line)
    return 0

# ---------------------------------------------------------------------------
# Main CLI Dispatcher
# ---------------------------------------------------------------------------
COMMANDS = {
    "probe": cmd_probe,
    "safe-write": cmd_safe_write,
    "index-tree": cmd_index_tree,
    "syntax-check": cmd_syntax_check,
    "normalize-md": cmd_normalize_md,
    "flatten-manuscript": cmd_flatten_manuscript,
    "output-proxy": cmd_output_proxy,
}

def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help", "help"):
        print(__doc__.strip())
        return 0
    cmd = sys.argv[1]
    handler = COMMANDS.get(cmd)
    if not handler:
        print(f"Unknown subcommand: {cmd}", file=sys.stderr)
        print(f"Available: {', '.join(sorted(COMMANDS.keys()))}", file=sys.stderr)
        return 1
    return handler(sys.argv[2:])

if __name__ == "__main__":
    sys.exit(main())
