"""Inert child for process-lock qualification; never drives the desktop."""

import sys
import time
from pathlib import Path

from ide_smoke.platforms.macos.run_lock import DesktopRunLock, RunLockBusy


def wait_for(path: Path) -> None:
    deadline = time.monotonic() + 10
    while not path.exists():
        if time.monotonic() >= deadline:
            raise TimeoutError("Qualification coordination timed out")
        time.sleep(0.01)


lock_path, ready, release, start = map(Path, sys.argv[1:])
wait_for(start)
lock = DesktopRunLock(_path=lock_path)
try:
    lock.acquire()
except RunLockBusy:
    raise SystemExit(3)
try:
    # A competing rejected process must never reach this inert action.
    ready.write_text("acquired\n")
    wait_for(release)
finally:
    lock.release()
