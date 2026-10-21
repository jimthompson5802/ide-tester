"""Shared guard selection without importing macOS mechanisms on other hosts."""

import sys


class RunLockBusy(Exception):
    """Another cooperating run holds the desktop lock."""


class UnsupportedPlatform(Exception):
    """This host platform is not implemented."""


def create_guard():
    if sys.platform != "darwin":
        raise UnsupportedPlatform
    from ide_smoke.platforms.macos.run_lock import DesktopRunLock

    return DesktopRunLock()
