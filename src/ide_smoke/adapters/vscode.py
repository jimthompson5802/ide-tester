"""VS Code controller; importing it performs no native work."""
from dataclasses import dataclass
from pathlib import Path
import time
import re
from typing import Callable, Protocol
from ide_smoke.adapters.base import LifecycleError, CleanupError

@dataclass(frozen=True)
class LaunchSpec:
    executable: Path
    profile_root: Path
    workspace: Path

    @property
    def argv(self) -> tuple[str, ...]:
        return (str(self.executable), '--user-data-dir', str(self.profile_root / 'user-data'),
                '--extensions-dir', str(self.profile_root / 'extensions'),
                '--new-window', str(self.workspace))


@dataclass(frozen=True)
class ProcessIdentity:
    pid: int
    birth: str
    executable: Path
    argv: tuple[str, ...]


@dataclass(frozen=True)
class Observation:
    live: bool = True
    matching_windows: int = 1
    workspace_matches: bool = True
    workbench: bool = True
    obstruction: str | None = None
    initializing: bool = False


class Backend(Protocol):
    def get_version(self, executable: Path, *, deadline: float) -> str: ...
    def start(self, spec: LaunchSpec, deadline: float,
              claim: Callable[[ProcessIdentity], None]) -> None: ...
    def observe(self, identity: ProcessIdentity, deadline: float) -> Observation: ...
    def close(self, identity: ProcessIdentity | None, deadline: float) -> None: ...


class VSCodeIDE:
    """One in-memory launch owner; close must be registered before launch."""
    def __init__(self, executable: Path, profile_root: Path, *, _backend=None,
                 _clock=time.monotonic, _sleep=time.sleep):
        self.executable = executable
        self.profile_root = profile_root
        if _backend is None:
            from ide_smoke.platforms.macos.vscode_session import NativeBackend
            _backend = NativeBackend()
        self.backend = _backend
        self.clock = _clock
        self.sleep = _sleep
        self.cleanup_seconds = 10.0
        self._version = None
        self.spec = None
        self.identity = None
        self.facts = []
        self.started = False
        self.closed = False
        self.uncertain = False

    @property
    def requires_workspace_retention(self) -> bool:
        return self.started

    def get_version(self, *, deadline: float) -> str:
        if self._version is None:
            self._version = self.backend.get_version(self.executable, deadline=deadline)
        return self._version

    def launch(self, workspace: Path, *, deadline: float) -> None:
        if self.started:
            raise LifecycleError("ownership_uncertain")
        self.started = True
        spec = self.spec = LaunchSpec(self.executable, self.profile_root, workspace)
        def claim(identity):
            if (identity.executable != spec.executable or identity.argv != spec.argv
                    or type(identity.pid) is not int or identity.pid <= 0
                    or not isinstance(identity.birth, str)
                    or re.fullmatch(r"[0-9]+:[0-9]+", identity.birth) is None
                    or self.identity is not None):
                self.uncertain = True
                raise LifecycleError('ownership_uncertain')
            self.identity = identity
            self.facts.append('launch_owned')
        try:
            self.backend.start(spec, deadline, claim)
            if self.clock() >= deadline:
                raise LifecycleError('readiness_timeout')
        except LifecycleError:
            raise
        except Exception:
            raise LifecycleError('launch_failed') from None

    def wait_ready(self, *, deadline: float) -> None:
        if self.identity is None:
            raise LifecycleError('ownership_uncertain')
        while self.clock() < deadline:
            try:
                observation = self.backend.observe(self.identity, deadline)
            except LifecycleError:
                raise
            except Exception:
                raise LifecycleError('ownership_uncertain') from None
            if self.clock() >= deadline:
                break
            if not observation.live:
                raise LifecycleError('early_exit')
            if observation.matching_windows > 1 or (not observation.workspace_matches and not observation.initializing):
                raise LifecycleError('ownership_uncertain', stage='window_association')
            if observation.obstruction is not None:
                raise LifecycleError('obstructed' if observation.obstruction == 'modal' else 'unknown_dialog')
            if observation.matching_windows == 1 and observation.workbench and not observation.initializing:
                self.facts.append('workbench_ready')
                return
            self.sleep(min(0.05, max(0.0, deadline - self.clock())))
        raise LifecycleError('readiness_timeout')

    def close(self) -> None:
        if self.closed or not self.started:
            return
        if self.uncertain:
            raise self._cleanup_error()
        try:
            self.backend.close(self.identity, self.clock() + self.cleanup_seconds)
        except Exception:
            raise self._cleanup_error() from None
        self.closed = True
        self.facts.append('shutdown_confirmed')


    def _cleanup_error(self):
        identity = self.identity
        backend_process = getattr(self.backend, 'process', None)
        return CleanupError(owned_pid=identity.pid if identity else (backend_process.pid if backend_process else None),
                            owned_birth=identity.birth if identity else None,
                            workspace=self.spec.workspace if self.spec else None)
