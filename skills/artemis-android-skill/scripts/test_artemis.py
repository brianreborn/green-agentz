import asyncio
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("artemis.py")


def load_bridge():
    spec = importlib.util.spec_from_file_location("artemis_skill_bridge", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ArtemisSkillTests(unittest.TestCase):
    def test_bridge_script_exists(self) -> None:
        self.assertTrue(SCRIPT.is_file(), "scripts/artemis.py must exist")

    def test_compact_task_omits_raw_payload(self) -> None:
        bridge = load_bridge()
        task = SimpleNamespace(
            task_id="task-1",
            status="completed",
            goal="Open Settings",
            profile="flash",
            device_serial="emulator-5554",
            output={"battery": "80%"},
            error=None,
            turns=3,
            succeeded=True,
            done=True,
            raw={"large": "payload"},
        )

        payload = bridge.compact_task(task)

        self.assertEqual(payload["task_id"], "task-1")
        self.assertEqual(payload["output"], {"battery": "80%"})
        self.assertNotIn("raw", payload)
    def test_install_plan_clones_pinned_revision(self) -> None:
        bridge = load_bridge()
        root = Path("/tmp/artemis-private")

        steps = bridge.install_steps(root, checkout_exists=False)

        self.assertEqual(
            steps,
            [
                ["git", "clone", "--no-checkout", "--filter=blob:none", bridge.REPO_URL, str(root)],
                ["git", "-C", str(root), "fetch", "--depth", "1", "origin", bridge.PINNED_REV],
                ["git", "-C", str(root), "checkout", "--detach", "FETCH_HEAD"],
                ["uv", "sync", "--frozen", "--no-dev"],
            ],
        )

    def test_parser_accepts_run_controls(self) -> None:
        bridge = load_bridge()

        args = bridge.build_parser().parse_args(
            [
                "run",
                "--goal",
                "Open Settings",
                "--profile",
                "pro",
                "--device",
                "emulator-5554",
                "--verification-level",
                "strict",
                "--explorer-mode",
                "ultra",
                "--expected-output",
                "Battery percentage",
                "--app-package",
                "com.android.settings",
                "--app-path",
                "/tmp/app.apk",
                "--timeout",
                "120",
            ]
        )

        self.assertEqual(args.command, "run")
        self.assertEqual(args.goal, "Open Settings")
        self.assertEqual(args.profile, "pro")
        self.assertEqual(args.device, "emulator-5554")
        self.assertEqual(args.verification_level, "strict")
        self.assertEqual(args.explorer_mode, "ultra")
        self.assertEqual(args.expected_output, "Battery percentage")
        self.assertEqual(args.app_package, "com.android.settings")
        self.assertEqual(args.app_path, "/tmp/app.apk")
        self.assertEqual(args.timeout, 120.0)

    def test_parser_exposes_lazy_sdk_workflow(self) -> None:
        bridge = load_bridge()
        parser = bridge.build_parser()
        cases = [
            (["setup"], "setup"),
            (["doctor", "--fix"], "doctor"),
            (["devices"], "devices"),
            (["submit", "--goal", "Inspect Settings"], "submit"),
            (["status", "task-1"], "status"),
            (["stop", "task-1"], "stop"),
            (["server", "start"], "server"),
            (["server", "status"], "server"),
            (["server", "stop"], "server"),
        ]

        for argv, expected in cases:
            with self.subTest(argv=argv):
                self.assertEqual(parser.parse_args(argv).command, expected)

    def test_sdk_run_returns_compact_result(self) -> None:
        bridge = load_bridge()
        args = bridge.build_parser().parse_args(
            ["run", "--goal", "Open Settings", "--device", "emulator-5554"]
        )

        class FakeClient:
            def __init__(self) -> None:
                self.kwargs = None

            async def run(self, goal, **kwargs):
                self.kwargs = {"goal": goal, **kwargs}
                return SimpleNamespace(
                    task_id="task-7",
                    status="completed",
                    goal=goal,
                    profile=kwargs["profile"],
                    device_serial=kwargs["device_serial"],
                    output="done",
                    error=None,
                    turns=2,
                    succeeded=True,
                    done=True,
                )

        client = FakeClient()
        payload = asyncio.run(bridge.dispatch_sdk(args, client))

        self.assertTrue(payload["ok"])
        self.assertEqual(payload["task"]["task_id"], "task-7")
        self.assertEqual(client.kwargs["device_serial"], "emulator-5554")
        self.assertEqual(client.kwargs["profile"], "flash")

    def test_sdk_dispatches_devices_submit_status_and_stop(self) -> None:
        bridge = load_bridge()

        class FakeClient:
            async def list_devices(self):
                return (
                    SimpleNamespace(
                        serial="device-1", state="device", model="Pixel", product="pixel", busy=False
                    ),
                )

            async def submit(self, goal, **kwargs):
                return SimpleNamespace(
                    task_id="task-8", status="queued", device_serial=kwargs["device_serial"]
                )

            async def get_task(self, task_id):
                return SimpleNamespace(
                    task_id=task_id,
                    status="running",
                    goal="Inspect",
                    profile="flash",
                    device_serial="device-1",
                    output=None,
                    error=None,
                    turns=1,
                    succeeded=False,
                    done=False,
                )

            async def stop(self, task_id):
                return task_id == "task-8"

        client = FakeClient()
        parser = bridge.build_parser()
        devices = asyncio.run(bridge.dispatch_sdk(parser.parse_args(["devices"]), client))
        submitted = asyncio.run(
            bridge.dispatch_sdk(
                parser.parse_args(
                    ["submit", "--goal", "Inspect", "--device", "device-1"]
                ),
                client,
            )
        )
        status = asyncio.run(
            bridge.dispatch_sdk(parser.parse_args(["status", "task-8"]), client)
        )
        stopped = asyncio.run(
            bridge.dispatch_sdk(parser.parse_args(["stop", "task-8"]), client)
        )

        self.assertEqual(devices["devices"][0]["serial"], "device-1")
        self.assertEqual(submitted["task"]["task_id"], "task-8")
        self.assertEqual(status["task"]["status"], "running")
        self.assertEqual(stopped, {"ok": True, "task_id": "task-8", "stopped": True})

    def test_execute_install_runs_uv_inside_checkout(self) -> None:
        bridge = load_bridge()
        calls = []

        def fake_runner(command, *, cwd=None):
            calls.append((command, cwd))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "artemis"
            bridge.execute_install(root, checkout_exists=False, runner=fake_runner)

        self.assertEqual(calls[0][0][:2], ["git", "clone"])
        self.assertIsNone(calls[0][1])
        self.assertEqual(calls[-1][0], ["uv", "sync", "--frozen", "--no-dev"])
        self.assertEqual(calls[-1][1], root)

    def test_runtime_ready_rejects_partial_virtual_environment(self) -> None:
        bridge = load_bridge()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "artemis"
            (root / ".git").mkdir(parents=True)
            python = root / ".venv/bin/python"
            python.parent.mkdir(parents=True)
            python.write_text("not an interpreter", encoding="utf-8")

            self.assertFalse(bridge.runtime_ready(root))

    def test_ensure_server_starts_only_when_probe_is_down(self) -> None:
        bridge = load_bridge()
        root = Path("/tmp/artemis-private")
        probe_states = iter([False, True])
        calls = []

        result = bridge.ensure_server(
            root,
            probe=lambda: next(probe_states),
            runner=lambda command, cwd=None: calls.append((command, cwd)),
            port=8123,
            port_probe=lambda port: False,
        )

        self.assertTrue(result["started"])
        self.assertTrue(result["healthy"])
        self.assertEqual(calls[0][0][0:3], ["uv", "run", "artemis"])
        self.assertIn("restart", calls[0][0])
        self.assertIn("8123", calls[0][0])
        self.assertEqual(calls[0][1], root)

    def test_ensure_server_refuses_unidentified_occupied_port(self) -> None:
        bridge = load_bridge()

        with self.assertRaisesRegex(RuntimeError, "unidentified service"):
            bridge.ensure_server(
                Path("/tmp/artemis-private"),
                probe=lambda: False,
                runner=lambda command, cwd=None: self.fail("must not start"),
                port=8123,
                port_probe=lambda port: True,
            )

    def test_health_probe_rejects_unidentified_http_listener(self) -> None:
        bridge = load_bridge()

        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return b'{"status":"idle","model_info":{"architecture":"ARTEMIS Flash"}}'

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            healthy = bridge.health_probe(
                "http://127.0.0.1:8123",
                root,
                opener=lambda *args, **kwargs: FakeResponse(),
            )

        self.assertFalse(healthy)

    def test_endpoint_accepts_only_loopback_and_returns_port(self) -> None:
        bridge = load_bridge()

        self.assertEqual(bridge.endpoint_port("http://127.0.0.1:8123"), 8123)
        invalid = [
            "https://example.com:8123",
            "http://[::1]:8123",
            "http://localhost/path",
            "http://localhost",
            "http://user:secret@127.0.0.1:8123",
        ]
        for endpoint in invalid:
            with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                bridge.endpoint_port(endpoint)

    def test_stop_refuses_unidentified_listener_without_invoking_cli(self) -> None:
        bridge = load_bridge()
        with (
            patch.object(bridge, "health_probe", return_value=False),
            patch.object(bridge, "tcp_port_open", return_value=True),
            patch.object(bridge.subprocess, "run") as run,
            self.assertRaisesRegex(RuntimeError, "unidentified service"),
        ):
            bridge.server_action(
                Path("/tmp/artemis-private"),
                "stop",
                "http://127.0.0.1:8123",
            )
        run.assert_not_called()

    def test_process_identity_requires_matching_executable_cwd_command_and_port(self) -> None:
        bridge = load_bridge()
        root = Path("/tmp/artemis-private")
        inspected = {
            "pid": 123,
            "exe": str((root / ".venv/bin/python").resolve()),
            "cwd": str(root.resolve()),
            "cmdline": [
                str(root / ".venv/bin/python"),
                "-m",
                "apps.admin_console.server",
                "--host",
                "127.0.0.1",
                "--port",
                "8123",
            ],
            "listening": True,
        }
        def fake_runner(*args, **kwargs):
            return SimpleNamespace(returncode=0, stdout=__import__("json").dumps(inspected))

        matched = bridge.process_identity_matches(
            root,
            123,
            8123,
            runner=fake_runner,
        )

        self.assertTrue(matched)
        inspected["cwd"] = "/tmp/other"
        self.assertFalse(
            bridge.process_identity_matches(
                root,
                123,
                8123,
                runner=fake_runner,
            )
        )

    def test_process_identity_accepts_macos_pyvenv_launcher(self) -> None:
        bridge = load_bridge()
        root = Path("/tmp/artemis-private")
        inspected = {
            "pid": 123,
            "exe": "/opt/homebrew/Python.app/Contents/MacOS/Python",
            "pyvenv_launcher": str(root / ".venv/bin/python"),
            "virtual_env": str(root / ".venv"),
            "cwd": str(root),
            "cmdline": [
                "/opt/homebrew/Python.app/Contents/MacOS/Python",
                "-m",
                "apps.admin_console.server",
                "--host",
                "127.0.0.1",
                "--port",
                "8123",
            ],
            "listening": True,
        }

        def fake_runner(*args, **kwargs):
            return SimpleNamespace(returncode=0, stdout=__import__("json").dumps(inspected))

        self.assertTrue(
            bridge.process_identity_matches(root, 123, 8123, runner=fake_runner)
        )

    def test_process_identity_treats_inspector_timeout_as_untrusted(self) -> None:
        bridge = load_bridge()

        def timeout_runner(*args, **kwargs):
            raise subprocess.TimeoutExpired(cmd=args[0], timeout=5)

        self.assertFalse(
            bridge.process_identity_matches(
                Path("/tmp/artemis-private"),
                123,
                8123,
                runner=timeout_runner,
            )
        )

    def test_executable_help_lists_public_commands(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "--help"],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(completed.returncode, 0)
        self.assertIn("setup", completed.stdout)
        self.assertIn("devices", completed.stdout)
        self.assertIn("server", completed.stdout)


if __name__ == "__main__":
    unittest.main()
