"""Exercise the actual CLI admission boundary using only internal inert actions."""

import sys
import time
from pathlib import Path

from ide_smoke import cli
from ide_smoke.orchestrator import run_attempt
from ide_smoke.platforms.macos.run_lock import DesktopRunLock
from ide_smoke.results import TEST_IDS, Outcome, Reason, Result

lock_path, marker, release, config_path = map(Path, sys.argv[1:])


def first(context, timeout):
    context.register_cleanup(lambda: marker.with_suffix(".cleanup").write_text("cleaned\n"))
    marker.write_text("action\n")
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
cli.run_attempt = lambda ide, config: run_attempt(
    ide, config, _guard_factory=lambda: DesktopRunLock(_path=lock_path), _operations=actions,
)
raise SystemExit(cli.main(["run", "--ide", "vscode", "--config", str(config_path)]))
