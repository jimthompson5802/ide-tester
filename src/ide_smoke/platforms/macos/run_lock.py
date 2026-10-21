"""Per-user advisory exclusion, held until release or process exit.

The file persists: unlinking it would allow contenders to lock different inodes.
Advisory locks protect only cooperating processes; they do not clean up IDEs.
"""

import sys
from pathlib import Path

if sys.platform != "darwin":
    raise RuntimeError("The desktop run lock currently supports macOS only.")

import fcntl
import os

from ide_smoke.guard import RunLockBusy


class DesktopRunLock:
    """Nonblocking OS-held lock. Reuse an instance only after releasing it.

    The optional path is an internal test seam, never a user configuration option.
    The production default is independent of checkout, config, and profile.
    """

    def __init__(self, *, _path: Path | None = None) -> None:
        self.path = _path if _path is not None else Path.home() / ".ide-smoke/desktop-run.lock"
        self._fd: int | None = None

    def acquire(self) -> None:
        if self._fd is not None:
            raise RuntimeError("This lock instance already owns a lock.")
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        # Do not truncate, write owner metadata, or unlink, even on rejection.
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR | os.O_CLOEXEC, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            raise RunLockBusy("Another ide-smoke run is active; wait for it to finish.") from None
        except BaseException:
            os.close(fd)
            raise
        self._fd = fd

    def release(self) -> None:
        if self._fd is not None:
            fd, self._fd = self._fd, None
            # Closing the descriptor releases flock, including on process exit.
            os.close(fd)
