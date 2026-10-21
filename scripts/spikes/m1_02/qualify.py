"""Read-only M1-02 qualification; not production preflight or IDE evidence.

The parent owns the real run lock before launching bounded passive probes.
Only allowlisted metadata leaves the workers; no account or UI data is read.
"""

import argparse
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import plistlib
import re
import stat
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
APP = Path("/Applications/Visual Studio Code.app")
PROFILE = ROOT / "profiles/m1-00"


def select_executable(value, entries=None):
    """Qualification candidate: retain first rejection, never hide access errors."""
    candidates = [Path(value)] if "/" in str(value) else [
        Path(entry) / value for entry in (os.get_exec_path() if entries is None else entries)
    ]
    rejected = None
    for candidate in candidates:
        try:
            mode = candidate.stat().st_mode
            reason = ("wrong_kind" if not stat.S_ISREG(mode) else
                      "nonexecutable" if not os.access(candidate, os.X_OK) else None)
        except (FileNotFoundError, NotADirectoryError):
            continue
        except OSError:
            return {"status": "error", "reason": "inspection_unavailable"}
        if reason is None:
            return {"status": "selected", "path": str(candidate.resolve())}
        if rejected is None:
            rejected = {"status": "blocked", "reason": reason}
    return rejected or {"status": "blocked", "reason": "missing"}


def bounded(command, seconds, *, env=None):
    # File-backed output avoids unbounded PIPE accumulation. Never emit raw output.
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        try:
            with subprocess.Popen(command, stdout=output, stderr=errors, env=env) as child:
                try:
                    child.wait(timeout=seconds)
                except (subprocess.TimeoutExpired, KeyboardInterrupt):
                    child.kill()
                    child.wait()
                    raise
            output.seek(0)
            data = output.read(8193)
            if child.returncode or len(data) > 8192:
                return {"status": "error", "reason": "subprocess_failed_or_output_limit"}
            return {"status": "returned", "data": data.decode("utf-8")}
        except subprocess.TimeoutExpired:
            return {"status": "error", "reason": "timeout"}
        except (OSError, UnicodeError):
            return {"status": "error", "reason": "subprocess_unavailable"}


def session():
    import ApplicationServices as AX
    import Quartz

    observed = Quartz.CGSessionCopyCurrentDictionary()
    return {
        "session_dictionary_present": observed is not None,
        "on_console": bool(observed[Quartz.kCGSessionOnConsoleKey]) if observed is not None else None,
        "login_done": bool(observed[Quartz.kCGSessionLoginDoneKey]) if observed is not None else None,
        "same_uid": int(observed[Quartz.kCGSessionUserIDKey]) == os.getuid() if observed is not None else None,
        "accessibility_trusted": bool(AX.AXIsProcessTrusted()),
        "post_event_access": bool(Quartz.CGPreflightPostEventAccess()),
        "unlocked": "unqualified",
        "authentication": "not_assessed",
    }


def metadata():
    contents = APP / "Contents"
    info = plistlib.loads((contents / "Info.plist").read_bytes())
    product = json.loads((contents / "Resources/app/product.json").read_text())
    package = json.loads((contents / "Resources/app/package.json").read_text())
    cli = contents / "Resources/app/bin/code"
    executable = contents / "MacOS" / info["CFBundleExecutable"]
    matches = []
    for path in (contents / "Resources/app/extensions").glob("*/package.json"):
        candidate = json.loads(path.read_text())
        if (candidate.get("publisher", "").lower(), candidate.get("name", "").lower()) == ("github", "copilot-chat"):
            matches.append(candidate)
    manifest = matches[0] if len(matches) == 1 else {}
    # Values are compared, not printed: unexpected strings never enter diagnostics.
    identity = (info.get("CFBundleIdentifier") == "com.microsoft.VSCode"
                and product.get("applicationName") == "code"
                and product.get("nameLong") == "Visual Studio Code")
    version = package.get("version", "")
    extension_version = manifest.get("version", "")
    settings_path = PROFILE / "user-data/User/settings.json"
    try:
        settings = json.loads(settings_path.read_text())
        value = settings.get("editor.accessibilitySupport")
        setting = value if value in ("on", "off", "auto") else "missing_or_unknown"
    except FileNotFoundError:
        setting = "missing"
    except (ValueError, OSError):
        setting = "unreadable_or_non_strict_json"
    registry = PROFILE / "extensions/extensions.json"
    # Registry structure only; do not emit extension/account inventory.
    user_inventory = json.loads(registry.read_text())
    return {
        "official_identity_metadata_matches": identity,
        "app_executable_runnable_bit": os.access(executable, os.X_OK),
        "cli_runnable_bit": os.access(cli, os.X_OK),
        "cli_symlink_association": Path("/usr/local/bin/code").resolve() == cli.resolve(),
        "version": version if re.fullmatch(r"\d+\.\d+\.\d+", version) else "unrecognized",
        "profile_root_no_symlink_components": all(not p.is_symlink() for p in [PROFILE, *PROFILE.parents]),
        "separate_layout_present": all((PROFILE / p).is_dir() for p in ("user-data", "extensions")),
        "dedication_marker_present": (PROFILE / ".ide-smoke-profile.json").exists(),
        "user_setting": setting,
        "effective_setting": "unqualified",
        "user_extensions_registry_empty": user_inventory == [],
        "bundled_copilot_identifier_matches": (manifest.get("publisher", "").lower(), manifest.get("name", "").lower()) == ("github", "copilot-chat"),
        "bundled_copilot_match_count": len(matches),
        "bundled_copilot_version": extension_version if re.fullmatch(r"\d+\.\d+\.\d+", extension_version) else "unrecognized",
        "activation_disabled_state_authentication": "not_assessed",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", choices=("session", "metadata"), help=argparse.SUPPRESS)
    parser.add_argument("--context", choices=("sandbox", "host"), default="sandbox")
    args = parser.parse_args()
    if sys.platform != "darwin" or Path(sys.prefix).resolve() != ROOT / ".venv":
        print(json.dumps({"status": "error", "reason": "macos_checkout_environment_required"}))
        return 4
    if args.worker:
        try:
            print(json.dumps(session() if args.worker == "session" else metadata()))
            return 0
        except Exception:
            print(json.dumps({"status": "error", "reason": "probe_unavailable"}))
            return 4
    from ide_smoke.guard import create_guard, RunLockBusy

    guard = create_guard()
    try:
        guard.acquire()
    except RunLockBusy:
        print(json.dumps({"status": "blocked", "reason": "run_lock_busy"}))
        return 3
    try:
        started = time.monotonic()
        report = {
            "context_label": args.context,
            "python": platform.python_version(),
            "architecture": platform.machine(),
            "macos": platform.mac_ver()[0],
            "checkout_environment": True,
            "packages": {},
        }
        for name in ("pyobjc-core", "pyobjc-framework-Cocoa", "pyobjc-framework-Quartz", "pyobjc-framework-ApplicationServices"):
            distribution = importlib.metadata.distribution(name)
            report["packages"][name] = {
                "version": distribution.version,
                "wheel_tags": [s[5:] for s in (distribution.read_text("WHEEL") or "").splitlines() if s.startswith("Tag: ")],
            }
        for worker in ("session", "metadata"):
            observation = bounded([sys.executable, __file__, "--worker", worker], 10)
            report[worker] = json.loads(observation["data"]) if observation["status"] == "returned" else observation
        # The inspected official CLI uses Electron's Node mode for --version.
        # Remove inherited remote/node hooks so it cannot redirect to another CLI.
        env = {k: v for k, v in os.environ.items() if k not in (
            "VSCODE_IPC_HOOK_CLI", "NODE_OPTIONS", "NODE_REPL_EXTERNAL_MODULE",
            "ELECTRON_RUN_AS_NODE", "VSCODE_NODE_OPTIONS", "VSCODE_NODE_REPL_EXTERNAL_MODULE",
        )}
        version = bounded([str(APP / "Contents/Resources/app/bin/code"), "--version"], 10, env=env)
        lines = version.pop("data", "").strip().splitlines()
        report["cli_version"] = {"status": "recognized"} if (
            version["status"] == "returned" and len(lines) == 3
            and re.fullmatch(r"\d+\.\d+\.\d+", lines[0])
            and re.fullmatch(r"[a-f0-9]{40}", lines[1]) and lines[2] in ("arm64", "x64")
        ) else {"status": "unqualified", "reason": version.get("reason", "unrecognized_version")}
        report["duration_seconds"] = round(time.monotonic() - started, 3)
        report["qualification"] = "incomplete_no_readiness_claim"
        destination = ROOT / "reports/m1-02" / f"{args.context}-qualification.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return 4
    finally:
        guard.release()


if __name__ == "__main__":
    raise SystemExit(main())
