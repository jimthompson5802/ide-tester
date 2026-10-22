"""Portable session contract and controlled lifecycle failures."""
from enum import Enum
from pathlib import Path
from typing import Protocol


class IDE(Protocol):
    @property
    def requires_workspace_retention(self) -> bool: ...
    def get_version(self, *, deadline: float) -> str: ...
    def launch(self, workspace: Path, *, deadline: float) -> None: ...
    def wait_ready(self, *, deadline: float) -> None: ...
    def close(self) -> None: ...


class LifecycleReason(str, Enum):
    WORKBENCH_READY = "workbench_ready"
    PROFILE_BUSY = "profile_busy"
    NATIVE_PREREQUISITE_MISSING = "native_prerequisite_missing"
    UNSUPPORTED_LAUNCHER = "unsupported_launcher"
    UNSUPPORTED_PROFILE_PATH = "unsupported_profile_path"
    LAUNCH_FAILED = "launch_failed"
    EARLY_EXIT = "early_exit"
    READINESS_TIMEOUT = "readiness_timeout"
    NATIVE_TIMEOUT = "native_timeout"
    OWNERSHIP_UNCERTAIN = "ownership_uncertain"
    OBSTRUCTED = "obstructed"
    UNKNOWN_DIALOG = "unknown_dialog"
    VERSION_UNAVAILABLE = "version_unavailable"
    INTERRUPTED = "interrupted"


class LifecycleError(Exception):
    """A closed reason; native exception text is never its public message."""

    def __init__(self, reason: LifecycleReason | str, *, stage: str | None = None):
        self.reason = LifecycleReason(reason)
        stages = {
            "process_identity", "application_identity", "window_association",
            "ax_exposure", "ax_attribute", "tree_traversal",
        }
        self.stage = stage if isinstance(stage, str) and stage in stages else None
        super().__init__(self.reason.value)


class CleanupError(Exception):
    """Unconfirmed owned shutdown with optional local inspection diagnostics.

    These values are diagnostic hints, never authority for recovery or deletion.
    The creator must obtain them from the current in-memory owner.
    """

    def __init__(self, *, owned_pid: int | None = None,
                 owned_birth: str | None = None, workspace: Path | None = None):
        import re

        if owned_pid is not None and (type(owned_pid) is not int or owned_pid <= 0):
            raise ValueError("invalid owned process identity")
        if owned_birth is not None and (
            not isinstance(owned_birth, str)
            or re.fullmatch(r"[0-9]+:[0-9]+", owned_birth) is None
        ):
            raise ValueError("invalid owned process identity")
        if workspace is not None and (
            not isinstance(workspace, Path) or not workspace.is_absolute()
            or ".." in workspace.parts
        ):
            raise ValueError("invalid owned workspace")
        self.owned_pid = owned_pid
        self.owned_birth = owned_birth
        self.workspace = workspace
        super().__init__("cleanup_failed")
