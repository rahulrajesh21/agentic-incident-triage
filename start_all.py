"""Unified launcher for the TraceGate local stack.

Starts the leaf MCP servers (:8001-:8004), the read-only MCP gateway (:8010),
the FastAPI control plane via Uvicorn (:8000), and optionally the React UI
dev server (:5173) in dependency order with graceful shutdown on Ctrl+C.
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


@dataclass
class ServiceSpec:
    name: str
    port: int
    cmd: list[str]
    cwd: Path = BASE_DIR
    env: dict[str, str] | None = None
    critical: bool = True


@dataclass
class RunningService:
    spec: ServiceSpec
    proc: subprocess.Popen[str]


_print_lock = threading.Lock()


def log(prefix: str, message: str) -> None:
    with _print_lock:
        print(f"[{prefix:<15}] {message}", flush=True)


def resolve_python() -> str:
    """Prefer the workspace .venv Python when available."""
    venv_python = BASE_DIR / ".venv" / "bin" / "python"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable


def is_port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.35):
            return True
    except OSError:
        return False


def wait_for_port(service: RunningService, host: str, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        code = service.proc.poll()
        if code is not None:
            raise RuntimeError(
                f"Service '{service.spec.name}' exited early with code {code} before port :{service.spec.port} opened."
            )
        if is_port_open(host, service.spec.port):
            return
        time.sleep(0.2)

    raise TimeoutError(
        f"Timed out after {timeout:.0f}s waiting for '{service.spec.name}' on :{service.spec.port}."
    )


def wait_for_http_health(service: RunningService, url: str, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        code = service.proc.poll()
        if code is not None:
            raise RuntimeError(
                f"Service '{service.spec.name}' exited early with code {code} before passing health check."
            )
        try:
            with urllib.request.urlopen(url, timeout=0.75) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        time.sleep(0.25)

    raise TimeoutError(
        f"Timed out after {timeout:.0f}s waiting for health check at {url}."
    )


def stream_output(service: RunningService) -> None:
    label = f"{service.spec.name}:{service.spec.port}"
    assert service.proc.stdout is not None
    try:
        for line in service.proc.stdout:
            clean = line.rstrip("\r\n")
            if clean:
                log(label, clean)
    except Exception:
        pass


def spawn_service(spec: ServiceSpec, base_env: dict[str, str]) -> RunningService:
    env = base_env.copy()
    env["PYTHONUNBUFFERED"] = "1"
    if spec.env:
        env.update(spec.env)

    proc = subprocess.Popen(
        spec.cmd,
        cwd=str(spec.cwd),
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        start_new_session=True,
    )
    svc = RunningService(spec=spec, proc=proc)
    thread = threading.Thread(target=stream_output, args=(svc,), daemon=True)
    thread.start()
    return svc


def terminate_all(services: list[RunningService]) -> None:
    if not services:
        return

    log("launcher", "Stopping all TraceGate services...")
    # Stop top-level orchestrators/UI before leaf MCP servers
    for svc in reversed(services):
        if svc.proc.poll() is None:
            try:
                os.killpg(svc.proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass

    deadline = time.monotonic() + 5.0
    for svc in reversed(services):
        remaining = max(0.0, deadline - time.monotonic())
        if svc.proc.poll() is None:
            try:
                svc.proc.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(svc.proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                svc.proc.wait(timeout=1.0)


def check_preflight(python_bin: str, ports: list[tuple[str, int]]) -> None:
    if not (BASE_DIR / "sandbox" / "telemetry.db").exists() or not (BASE_DIR / "sandbox" / "mock_repo").exists():
        raise RuntimeError(
            "Sandbox data is missing. Seed it first with: python seed_sandbox.py"
        )

    probe = subprocess.run(
        [python_bin, "-c", "import uvicorn, fastmcp, rank_bm25, api.main"],
        cwd=str(BASE_DIR),
        capture_output=True,
        text=True,
        check=False,
    )
    if probe.returncode != 0:
        err = (probe.stderr or probe.stdout).strip()
        raise RuntimeError(
            f"Backend dependency check failed using {python_bin}:\n{err}"
        )

    busy = [(name, port) for name, port in ports if is_port_open("127.0.0.1", port)]
    if busy:
        details = ", ".join(f"{name} (:{port})" for name, port in busy)
        raise RuntimeError(f"Ports already in use: {details}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Start all TraceGate MCP servers, Uvicorn API, and Operator Console."
    )
    parser.add_argument("--host", default="127.0.0.1", help="Bind host for API/UI (default: 127.0.0.1)")
    parser.add_argument("--api-port", type=int, default=8000, help="FastAPI Uvicorn port (default: 8000)")
    parser.add_argument("--ui-port", type=int, default=5173, help="Vite dev server port (default: 5173)")
    parser.add_argument("--no-ui", action="store_true", help="Do not start the React frontend dev server")
    parser.add_argument("--reload", action="store_true", help="Enable Uvicorn --reload for api.main:app")
    parser.add_argument("--timeout", type=float, default=35.0, help="Startup readiness timeout per stage (sec)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    python_bin = resolve_python()
    base_env = os.environ.copy()

    # Load .env cleanly for launcher awareness while child processes also load_dotenv()
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        log("launcher", "Warning: .env not found (copy .env.example to .env for API keys).")

    leaf_specs = [
        ServiceSpec("telemetry", 8001, [python_bin, "-u", "-m", "mcp_server.servers.telemetry_server"]),
        ServiceSpec("git", 8002, [python_bin, "-u", "-m", "mcp_server.servers.git_server"]),
        ServiceSpec("runbook", 8003, [python_bin, "-u", "-m", "mcp_server.servers.runbook_server"]),
        ServiceSpec("remediate", 8004, [python_bin, "-u", "-m", "mcp_server.servers.remediation_server"]),
    ]
    gateway_spec = ServiceSpec(
        "gateway", 8010, [python_bin, "-u", "-m", "mcp_server.gateway.gateway_server"]
    )

    api_cmd = [
        python_bin,
        "-u",
        "-m",
        "uvicorn",
        "api.main:app",
        "--host",
        args.host,
        "--port",
        str(args.api_port),
    ]
    if args.reload:
        api_cmd.append("--reload")
    api_spec = ServiceSpec("api", args.api_port, api_cmd)

    ui_spec: ServiceSpec | None = None
    if not args.no_ui:
        ui_dir = BASE_DIR / "ui"
        npm_bin = shutil.which("npm")
        if not npm_bin:
            log("launcher", "Warning: 'npm' not found on PATH; skipping UI dev server.")
        elif not (ui_dir / "node_modules").exists():
            log("launcher", "Warning: ui/node_modules missing (run 'cd ui && npm install'); skipping UI.")
        else:
            ui_spec = ServiceSpec(
                name="ui",
                port=args.ui_port,
                cmd=[npm_bin, "run", "dev", "--", "--host", args.host, "--port", str(args.ui_port), "--strictPort"],
                cwd=ui_dir,
                env={"VITE_API_BASE_URL": f"http://{args.host}:{args.api_port}"},
                critical=False,
            )

    required_ports = [(s.name, s.port) for s in [*leaf_specs, gateway_spec, api_spec]]
    if ui_spec:
        required_ports.append((ui_spec.name, ui_spec.port))

    try:
        check_preflight(python_bin, required_ports)
    except RuntimeError as exc:
        log("launcher", f"Preflight failed: {exc}")
        return 1

    running: list[RunningService] = []
    stop_event = threading.Event()

    def _handle_signal(_signum: int, _frame: object) -> None:
        stop_event.set()

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    try:
        log("launcher", f"Using Python: {python_bin}")

        # Stage 1: Leaf MCP Servers (:8001-:8004)
        log("launcher", "Starting leaf MCP servers (:8001, :8002, :8003, :8004)...")
        leaf_services = [spawn_service(spec, base_env) for spec in leaf_specs]
        running.extend(leaf_services)
        for svc in leaf_services:
            wait_for_port(svc, "127.0.0.1", args.timeout)

        # Stage 2: Read-Only Gateway (:8010)
        log("launcher", "Starting read-only MCP gateway (:8010)...")
        gw_svc = spawn_service(gateway_spec, base_env)
        running.append(gw_svc)
        wait_for_port(gw_svc, "127.0.0.1", args.timeout)

        # Stage 3: FastAPI Control Plane via Uvicorn (:8000)
        log("launcher", f"Starting TraceGate FastAPI Uvicorn server (:{args.api_port})...")
        api_svc = spawn_service(api_spec, base_env)
        running.append(api_svc)
        wait_for_http_health(api_svc, f"http://{args.host}:{args.api_port}/health", args.timeout)

        # Stage 4: Operator Console UI (:5173)
        if ui_spec:
            log("launcher", f"Starting TraceGate Operator Console (:{ui_spec.port})...")
            ui_svc = spawn_service(ui_spec, base_env)
            running.append(ui_svc)
            wait_for_port(ui_svc, args.host, args.timeout)

        log("launcher", "------------------------------------------------------------")
        log("launcher", f"FastAPI API : http://{args.host}:{args.api_port}")
        log("launcher", "Read Gateway: http://127.0.0.1:8010/mcp")
        log("launcher", "Write Gate  : http://127.0.0.1:8004/mcp")
        if ui_spec:
            log("launcher", f"Console UI  : http://{args.host}:{ui_spec.port}")
        log("launcher", "Press Ctrl+C to stop all services.")
        log("launcher", "------------------------------------------------------------")

        while not stop_event.is_set():
            for svc in running:
                code = svc.proc.poll()
                if code is not None and svc.spec.critical:
                    log(
                        "launcher",
                        f"Critical service '{svc.spec.name}' exited unexpectedly (code {code}). Shutting down.",
                    )
                    return 1
            time.sleep(0.4)

        return 0
    except Exception as exc:
        log("launcher", f"Startup error: {exc}")
        return 1
    finally:
        terminate_all(running)
        log("launcher", "All services stopped.")


if __name__ == "__main__":
    raise SystemExit(main())
