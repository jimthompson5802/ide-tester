"""Exercise the actual CLI admission boundary using only internal inert actions."""

import sys
import time
from pathlib import Path

from ide_smoke import cli, orchestrator, workspace
from ide_smoke.orchestrator import run_attempt
from ide_smoke.platforms.macos.run_lock import DesktopRunLock
from ide_smoke.results import TEST_IDS, Outcome, Reason, Result

lock_path, marker, release, config_path = map(Path, sys.argv[1:5])
scenario = sys.argv[5] if len(sys.argv) > 5 else ""


synthetic_checkout = marker.parent / "source-checkout"
synthetic_checkout.mkdir()
workspace.source_checkout = lambda: synthetic_checkout

original_profile_check = orchestrator.check_configured_profile


def observed_profile_check(*args):
    marker.with_suffix(".profile-check").write_text("inspected under exclusion\n")
    return original_profile_check(*args)


orchestrator.check_configured_profile = observed_profile_check


def first(context, timeout):
    context.register_cleanup(lambda: marker.with_suffix(".cleanup").write_text("cleaned\n"))
    marker.write_text(str(context.workspace_path) + "\n")
    deadline = time.monotonic() + 15
    while not release.exists():
        if time.monotonic() >= deadline:
            raise TimeoutError
        time.sleep(0.01)
    return Result(Outcome.PASS, Reason.PASSED)


def passed(context, timeout):
    return Result(Outcome.PASS, Reason.PASSED)


actions = dict.fromkeys(TEST_IDS, passed)
actions["T01"] = first
class InertSession:
    """Cross-process fixture for production orchestration; no native imports."""
    requires_workspace_retention = False

    def __init__(self, executable, profile):
        self.deadline = None

    def get_version(self, *, deadline):
        self.deadline = deadline
        return "1.135.0"

    def launch(self, workspace_path, *, deadline):
        from ide_smoke.adapters.base import LifecycleError, LifecycleReason
        assert deadline == self.deadline
        self.requires_workspace_retention = True
        marker.write_text(str(workspace_path) + "\n")
        if scenario == "startup_failure":
            raise LifecycleError(LifecycleReason.LAUNCH_FAILED)

    def wait_ready(self, *, deadline):
        from ide_smoke.adapters.base import LifecycleError, LifecycleReason
        assert deadline == self.deadline
        if scenario == "readiness_timeout":
            while time.monotonic() < deadline:
                time.sleep(.01)
            raise LifecycleError(LifecycleReason.READINESS_TIMEOUT)
        if scenario == "interrupt":
            while not release.exists():
                time.sleep(.01)

    def close(self):
        from ide_smoke.adapters.base import CleanupError
        marker.with_suffix(".cleanup").write_text("cleaned\n")
        if scenario == "cleanup_failure":
            raise CleanupError()


options = {"_session_factory": InertSession} if scenario else {"_operations": actions}
cli.run_attempt = lambda ide, config: run_attempt(
    ide, config, _guard_factory=lambda: DesktopRunLock(_path=lock_path), **options,
)
raise SystemExit(cli.main(["run", "--ide", "vscode", "--config", str(config_path)]))
