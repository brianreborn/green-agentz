#!/usr/bin/env python3
"""Lazy ARTEMIS SDK bridge for the artemis-android skill."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen

REPO_URL = "https://github.com/google/artemis.git"
PINNED_REV = "086078819209c7139d6f833cfdc6d5cc80d9f19a"
DEFAULT_BASE_URL = "http://127.0.0.1:8000"
CHILD_ENV = "ARTEMIS_SKILL_SDK_CHILD"
PROCESS_INSPECTOR = """\
import json
import psutil
import sys
pid = int(sys.argv[1])
port = int(sys.argv[2])
process = psutil.Process(pid)
connections = process.net_connections(kind="tcp")
environment = process.environ()
listening = any(
    connection.status == psutil.CONN_LISTEN
    and connection.laddr
    and connection.laddr.port == port
    for connection in connections
)
print(json.dumps({
    "pid": process.pid,
    "exe": process.exe(),
    "pyvenv_launcher": environment.get("__PYVENV_LAUNCHER__"),
    "virtual_env": environment.get("VIRTUAL_ENV"),
    "cwd": process.cwd(),
    "cmdline": process.cmdline(),
    "listening": listening,
}))
"""


def runtime_home() -> Path:
    configured = os.environ.get("ARTEMIS_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path.home() / ".local" / "share" / "hermes-artemis").resolve()


def venv_python(root: Path) -> Path:
    return root / ".venv" / "bin" / "python"


def runtime_ready(root: Path, *, runner: Any = subprocess.run) -> bool:
    """Require a checkout whose venv can import both the SDK and CLI entrypoint."""
    python = venv_python(root)
    if not (root / ".git").is_dir() or not python.is_file():
        return False
    try:
        completed = runner(
            [
                str(python),
                "-c",
                "import artemis_client; from artemis.interfaces.cli.main import cli",
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return completed.returncode == 0


def endpoint_port(base_url: str) -> int:
    """Validate a fully explicit loopback-only ARTEMIS endpoint and return its port."""
    parsed = urlparse(base_url)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "localhost"}
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or bool(parsed.params or parsed.query or parsed.fragment)
    ):
        raise ValueError("ARTEMIS_BASE_URL must be a plain http:// loopback address with a port")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("ARTEMIS_BASE_URL contains an invalid port") from exc
    if port is None:
        raise ValueError("ARTEMIS_BASE_URL must include an explicit port")
    return port


def tcp_port_open(port: int) -> bool:
    """Return whether the local loopback port already has a listener."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
        connection.settimeout(0.5)
        return connection.connect_ex(("127.0.0.1", port)) == 0


def install_steps(root: Path, *, checkout_exists: bool) -> list[list[str]]:
    """Build the reproducible command plan for the private ARTEMIS runtime."""
    steps: list[list[str]] = []
    if not checkout_exists:
        steps.append(
            ["git", "clone", "--no-checkout", "--filter=blob:none", REPO_URL, str(root)]
        )
    steps.extend(
        [
            ["git", "-C", str(root), "fetch", "--depth", "1", "origin", PINNED_REV],
            ["git", "-C", str(root), "checkout", "--detach", "FETCH_HEAD"],
            ["uv", "sync", "--frozen", "--no-dev"],
        ]
    )
    return steps


def execute_install(root: Path, *, checkout_exists: bool, runner: Any) -> None:
    """Execute the pinned install plan; dependency injection keeps this testable."""
    root.parent.mkdir(parents=True, exist_ok=True)
    for command in install_steps(root, checkout_exists=checkout_exists):
        runner(command, cwd=root if command[:2] == ["uv", "sync"] else None)


def ensure_server(
    root: Path,
    *,
    probe: Any,
    runner: Any,
    port: int = 8000,
    port_probe: Any = None,
) -> dict[str, Any]:
    """Start the loopback daemon only when its health endpoint is unavailable."""
    if probe():
        return {"healthy": True, "started": False}
    occupied = port_probe or tcp_port_open
    if occupied(port):
        raise RuntimeError(
            f"Port {port} is occupied by an unidentified service; refusing to stop or use it"
        )
    command = [
        "uv",
        "run",
        "artemis",
        "restart",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--no-open",
        "--daemon",
    ]
    runner(command, cwd=root)
    healthy = bool(probe())
    return {"healthy": healthy, "started": True}


def add_task_arguments(parser: argparse.ArgumentParser, *, include_timeout: bool) -> None:
    parser.add_argument("--goal", required=True)
    parser.add_argument("--profile", choices=("flash", "pro"), default="flash")
    parser.add_argument("--device")
    parser.add_argument(
        "--verification-level", choices=("off", "final", "checkpoints", "strict")
    )
    parser.add_argument("--explorer-mode", choices=("flash", "pro", "ultra"))
    parser.add_argument("--expected-output")
    parser.add_argument("--app-package")
    parser.add_argument("--app-path")
    if include_timeout:
        parser.add_argument("--timeout", type=float, default=1800.0)


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line interface without importing the Artemis SDK."""
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("setup", help="Install the pinned private ARTEMIS runtime")
    doctor = subparsers.add_parser("doctor", help="Run ARTEMIS readiness diagnostics")
    doctor.add_argument("--fix", action="store_true")
    subparsers.add_parser("devices", help="List devices through the ARTEMIS SDK")

    run_parser = subparsers.add_parser("run", help="Submit a task and wait for its result")
    add_task_arguments(run_parser, include_timeout=True)
    submit_parser = subparsers.add_parser("submit", help="Submit a task without waiting")
    add_task_arguments(submit_parser, include_timeout=False)

    status = subparsers.add_parser("status", help="Read one task state")
    status.add_argument("task_id")
    stop = subparsers.add_parser("stop", help="Stop one task")
    stop.add_argument("task_id")

    server = subparsers.add_parser("server", help="Manage the loopback ARTEMIS daemon")
    server.add_argument("server_action", choices=("start", "status", "stop"))
    return parser


def task_kwargs(args: argparse.Namespace) -> dict[str, Any]:
    """Translate CLI field names to the public ArtemisClient API."""
    return {
        "profile": args.profile,
        "device_serial": args.device,
        "expected_output": args.expected_output,
        "locked_app_package": args.app_package,
        "app_path": args.app_path,
        "verification_level": args.verification_level,
        "explorer_mode": args.explorer_mode,
    }


async def dispatch_sdk(args: argparse.Namespace, client: Any) -> dict[str, Any]:
    """Execute one parsed SDK command against an ArtemisClient-compatible object."""
    if args.command == "devices":
        devices = await client.list_devices()
        compact = [
            {
                "serial": device.serial,
                "state": device.state,
                "model": device.model,
                "product": device.product,
                "busy": bool(device.busy),
            }
            for device in devices
        ]
        return {"ok": True, "count": len(compact), "devices": compact}
    if args.command == "run":
        task = await client.run(args.goal, timeout=args.timeout, **task_kwargs(args))
        return {"ok": bool(task.succeeded), "task": compact_task(task)}
    if args.command == "submit":
        handle = await client.submit(args.goal, **task_kwargs(args))
        return {
            "ok": True,
            "task": {
                "task_id": handle.task_id,
                "status": handle.status,
                "device_serial": handle.device_serial,
            },
        }
    if args.command == "status":
        task = await client.get_task(args.task_id)
        return {"ok": True, "task": compact_task(task)}
    if args.command == "stop":
        stopped = bool(await client.stop(args.task_id))
        return {"ok": stopped, "task_id": args.task_id, "stopped": stopped}
    raise ValueError(f"Unsupported SDK command: {args.command}")


def compact_task(task: Any) -> dict[str, Any]:
    """Return the useful TaskResult fields without its potentially large raw payload."""
    keys = (
        "task_id",
        "status",
        "goal",
        "profile",
        "device_serial",
        "output",
        "error",
        "turns",
        "succeeded",
        "done",
    )
    return {key: getattr(task, key, None) for key in keys}


def run_checked(command: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess:
    """Run a helper command without leaking its logs into the JSON stdout protocol."""
    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        check=True,
        capture_output=True,
        text=True,
    )


def setup_runtime(root: Path) -> dict[str, Any]:
    """Install or verify the pinned full ARTEMIS host runtime."""
    missing = [name for name in ("git", "uv") if shutil.which(name) is None]
    if missing:
        raise RuntimeError(f"Missing required command(s): {', '.join(missing)}")

    checkout_exists = (root / ".git").is_dir()
    if root.exists() and not checkout_exists and any(root.iterdir()):
        raise RuntimeError(f"ARTEMIS_HOME exists but is not an Artemis Git checkout: {root}")

    if checkout_exists:
        origin = run_checked(["git", "-C", str(root), "remote", "get-url", "origin"]).stdout.strip()
        if origin.rstrip("/") != REPO_URL.rstrip("/"):
            raise RuntimeError(f"Refusing to modify non-ARTEMIS checkout at {root}")
        head = run_checked(["git", "-C", str(root), "rev-parse", "HEAD"]).stdout.strip()
        if head == PINNED_REV and runtime_ready(root):
            return {
                "ok": True,
                "installed": True,
                "changed": False,
                "artemis_home": str(root),
                "revision": head,
                "env_file": str(root / ".env"),
            }

    execute_install(root, checkout_exists=checkout_exists, runner=run_checked)
    if not runtime_ready(root):
        raise RuntimeError("ARTEMIS installation finished without a usable virtual environment")
    head = run_checked(["git", "-C", str(root), "rev-parse", "HEAD"]).stdout.strip()
    if head != PINNED_REV:
        raise RuntimeError(f"Installed unexpected ARTEMIS revision: {head}")
    return {
        "ok": True,
        "installed": True,
        "changed": True,
        "artemis_home": str(root),
        "revision": head,
        "env_file": str(root / ".env"),
    }


def process_identity_matches(
    root: Path,
    pid: int,
    port: int,
    *,
    runner: Any = subprocess.run,
) -> bool:
    """Inspect the live process through pinned-runtime psutil, not metadata alone."""
    try:
        completed = runner(
            [str(venv_python(root)), "-c", PROCESS_INSPECTOR, str(pid), str(port)],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if completed.returncode != 0:
            return False
        inspected = json.loads(completed.stdout)
        command = inspected.get("cmdline") or []
        pyvenv_launcher = inspected.get("pyvenv_launcher")
        virtual_env = inspected.get("virtual_env")
        expected_venv = root / ".venv"
        executable_matches = (
            Path(inspected.get("exe", "")).resolve() == venv_python(root).resolve()
            or (
                isinstance(pyvenv_launcher, str)
                and isinstance(virtual_env, str)
                and Path(pyvenv_launcher).absolute() == venv_python(root).absolute()
                and Path(virtual_env).resolve() == expected_venv.resolve()
            )
        )
        module_pair = ["-m", "apps.admin_console.server"]
        module_index = next(
            index
            for index in range(len(command) - 1)
            if command[index : index + 2] == module_pair
        )
        port_index = command.index("--port")
        host_index = command.index("--host")
        return (
            inspected.get("pid") == pid
            and executable_matches
            and Path(inspected.get("cwd", "")).resolve() == root.resolve()
            and module_index >= 0
            and command[port_index + 1] == str(port)
            and command[host_index + 1] == "127.0.0.1"
            and inspected.get("listening") is True
        )
    except (
        IndexError,
        OSError,
        StopIteration,
        TypeError,
        ValueError,
        json.JSONDecodeError,
        subprocess.SubprocessError,
    ):
        return False


def server_metadata_matches(root: Path, port: int) -> bool:
    """Verify ARTEMIS-owned lifecycle metadata before trusting a local listener."""
    try:
        metadata = json.loads((root / ".artemis_server.json").read_text(encoding="utf-8"))
        pid = metadata["pid"]
        if not isinstance(pid, int) or pid <= 0:
            return False
        os.kill(pid, 0)
        command = metadata.get("cmdline") or []
        return (
            metadata.get("port") == port
            and metadata.get("host") in {"127.0.0.1", "localhost"}
            and Path(metadata.get("cwd", "")).resolve() == root.resolve()
            and Path(metadata.get("sys_executable", "")).resolve() == venv_python(root).resolve()
            and isinstance(command, list)
            and bool(command)
            and Path(command[0]).resolve() == (root / "apps" / "admin_console" / "server.py").resolve()
            and isinstance(metadata.get("lifecycle_token"), str)
            and bool(metadata["lifecycle_token"])
            and process_identity_matches(root, pid, port)
        )
    except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError):
        return False


def health_probe(base_url: str, root: Path, *, opener: Any = urlopen) -> bool:
    """Authenticate a local daemon by owned metadata, process, and API signature."""
    try:
        port = endpoint_port(base_url)
        if not server_metadata_matches(root, port):
            return False
        with opener(
            f"{base_url.rstrip('/')}/api/system/server-status", timeout=1.5
        ) as response:
            if not 200 <= response.status < 300:
                return False
            payload = json.loads(response.read().decode("utf-8"))
            metadata = json.loads((root / ".artemis_server.json").read_text(encoding="utf-8"))
            return (
                payload.get("running") is True
                and payload.get("port") == port
                and payload.get("current_pid") == metadata.get("pid")
            )
    except (AttributeError, OSError, TypeError, URLError, TimeoutError, json.JSONDecodeError):
        return False


def parse_json_output(text: str) -> Any:
    stripped = text.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return stripped[-6000:]


def doctor_runtime(root: Path, *, attempt_fix: bool) -> dict[str, Any]:
    command = ["uv", "run", "artemis", "doctor", "--json"]
    if attempt_fix:
        command.append("--fix")
    completed = subprocess.run(
        command, cwd=str(root), check=False, capture_output=True, text=True
    )
    diagnosis = parse_json_output(completed.stdout)
    if diagnosis is None and completed.stderr:
        diagnosis = completed.stderr.strip()[-6000:]
    return {
        "ok": completed.returncode == 0,
        "exit_code": completed.returncode,
        "diagnosis": diagnosis,
        "artemis_home": str(root),
    }


def server_action(root: Path, action: str, base_url: str) -> dict[str, Any]:
    port = endpoint_port(base_url)
    probe = lambda: health_probe(base_url, root)
    identified = probe()
    if action == "status":
        return {"ok": identified, "action": action, "healthy": identified}
    if action == "start":
        state = ensure_server(root, probe=probe, runner=run_checked, port=port)
        return {"ok": bool(state["healthy"]), "action": action, **state}
    if not identified:
        if tcp_port_open(port):
            raise RuntimeError(
                f"Port {port} is occupied by an unidentified service; refusing to stop it"
            )
        return {"ok": True, "action": action, "healthy": False, "output": ""}
    completed = subprocess.run(
        ["uv", "run", "artemis", "stop", "--port", str(port)],
        cwd=str(root),
        check=False,
        capture_output=True,
        text=True,
    )
    healthy = probe()
    return {
        "ok": completed.returncode == 0 and not healthy,
        "action": action,
        "healthy": healthy,
        "output": (completed.stdout or completed.stderr).strip()[-3000:],
    }


def emit(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, default=str, separators=(",", ":")))


def run_sdk_in_venv(args: argparse.Namespace, base_url: str) -> dict[str, Any]:
    from artemis_client import ArtemisClient

    client = ArtemisClient(base_url, request_timeout=60.0, poll_interval=1.0)
    return asyncio.run(dispatch_sdk(args, client))


def main(argv: Any = None) -> int:
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    args = build_parser().parse_args(raw_argv)
    root = runtime_home()
    base_url = os.environ.get("ARTEMIS_BASE_URL", DEFAULT_BASE_URL).rstrip("/")

    try:
        if args.command == "setup":
            emit(setup_runtime(root))
            return 0

        if args.command == "server" and args.server_action in {"status", "stop"}:
            if not runtime_ready(root):
                payload = {
                    "ok": args.server_action == "stop",
                    "action": args.server_action,
                    "installed": False,
                    "healthy": False,
                }
            else:
                payload = server_action(root, args.server_action, base_url)
            emit(payload)
            return 0 if payload["ok"] else 1

        if os.environ.get(CHILD_ENV) != "1":
            setup_runtime(root)

        if args.command == "doctor":
            payload = doctor_runtime(root, attempt_fix=args.fix)
            emit(payload)
            return 0 if payload["ok"] else 1

        if args.command == "server":
            payload = server_action(root, args.server_action, base_url)
            emit(payload)
            return 0 if payload["ok"] else 1

        if os.environ.get(CHILD_ENV) != "1":
            state = ensure_server(
                root,
                probe=lambda: health_probe(base_url, root),
                runner=run_checked,
                port=endpoint_port(base_url),
            )
            if not state["healthy"]:
                raise RuntimeError("ARTEMIS daemon did not become healthy")
            environment = dict(os.environ)
            environment[CHILD_ENV] = "1"
            completed = subprocess.run(
                [str(venv_python(root)), str(Path(__file__).resolve()), *raw_argv],
                check=False,
                capture_output=True,
                text=True,
                env=environment,
            )
            if completed.stdout:
                sys.stdout.write(completed.stdout)
            else:
                emit(
                    {
                        "ok": False,
                        "error": "ARTEMIS SDK child returned no JSON",
                        "exit_code": completed.returncode,
                    }
                )
            return completed.returncode

        payload = run_sdk_in_venv(args, base_url)
        emit(payload)
        return 0 if payload.get("ok", False) else 1
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "").strip()[-3000:]
        emit(
            {
                "ok": False,
                "error": f"Command failed with exit code {exc.returncode}",
                "command": exc.cmd,
                "detail": detail,
            }
        )
        return 1
    except Exception as exc:  # noqa: BLE001 - CLI boundary must always emit JSON
        emit({"ok": False, "error": str(exc), "error_type": type(exc).__name__})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
