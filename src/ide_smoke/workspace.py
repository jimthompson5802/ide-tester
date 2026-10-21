"""Descriptor-anchored disposable resources. Persisted markers grant no deletion authority."""
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import uuid

from ide_smoke.profile_safety import _contains, _overlap, _strict_object, source_checkout

FIXTURE_BYTES = b'message = "original fixture"\n'
MARKER = '.ide-smoke-workspaces.json'
PURPOSE = {'schema_version': 1, 'purpose': 'ide-smoke-workspaces'}
DIRECTORY_FLAGS = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)


class WorkspaceError(Exception):
    def __init__(self, *, unsafe=False):
        self.unsafe = unsafe
        super().__init__('workspace_unsafe' if unsafe else 'workspace_unavailable')


def identity(metadata):
    return metadata.st_dev, metadata.st_ino


@dataclass(frozen=True, eq=False)
class WorkspaceHandle:
    run_id: str
    path: Path
    target: Path
    digest: str


class WorkspaceManager:
    def __init__(self, checkout, *, home, protected_paths):
        self.checkout = Path(checkout).resolve(strict=True)
        self.root = self.checkout / 'workspaces'
        self.home = Path(home).resolve()
        self.protected = tuple(Path(p).resolve() for p in protected_paths)
        self._owned = {}
        self.handle = None
        self._root_identity = None
        self._marker_identity = None

    def _validate_context(self):
        if (not getattr(shutil.rmtree, "avoids_symlink_attacks", False)
                or not hasattr(os, "O_DIRECTORY") or not hasattr(os, "O_NOFOLLOW")
                or not {os.open, os.stat, os.mkdir, os.unlink, os.rmdir} <= os.supports_dir_fd
                or os.scandir not in os.supports_fd):
            raise WorkspaceError()
        if _contains(self.root, self.home) or any(_overlap(self.root, p) for p in self.protected):
            raise WorkspaceError(unsafe=True)
        for component in reversed([self.checkout, *self.checkout.parents]):
            if not stat.S_ISDIR(component.lstat().st_mode):
                raise WorkspaceError(unsafe=True)

        # Detect an existing alias before any root creation writes.
        try:
            root_identity = identity(self.root.lstat())
        except FileNotFoundError:
            root_identity = None
        if root_identity is not None:
            with os.scandir(self.checkout) as entries:
                for entry in entries:
                    if (entry.name.casefold() == "workspaces" and entry.name != "workspaces"
                            and identity(entry.stat(follow_symlinks=False)) == root_identity):
                        raise WorkspaceError(unsafe=True)

    def _marker(self, root_fd):
        try:
            metadata = os.stat(MARKER, dir_fd=root_fd, follow_symlinks=False)
        except FileNotFoundError:
            raise WorkspaceError(unsafe=True) from None
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
            raise WorkspaceError(unsafe=True)
        fd = os.open(MARKER, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root_fd)
        with os.fdopen(fd, 'rb') as stream:
            metadata = os.fstat(stream.fileno())
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
                raise WorkspaceError(unsafe=True)
            content = stream.read(4097)
        try:
            value = json.loads(content, object_pairs_hook=_strict_object)
            valid = (len(content) <= 4096 and value == PURPOSE
                     and type(value['schema_version']) is int)
        except (ValueError, UnicodeError, TypeError, KeyError, RecursionError):
            valid = False
        if not valid:
            raise WorkspaceError(unsafe=True)
        return identity(metadata)

    def _root(self, *, create=False):
        self._validate_context()
        created = False
        if create:
            try:
                self.root.mkdir()
                created = True
            except FileExistsError:
                pass
        if not stat.S_ISDIR(self.root.lstat().st_mode):
            raise WorkspaceError(unsafe=True)
        fd = os.open(self.root, DIRECTORY_FLAGS)
        try:
            if created:
                marker_fd = os.open(MARKER, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                    0o600, dir_fd=fd)
                with os.fdopen(marker_fd, 'wb') as marker:
                    marker.write(json.dumps(PURPOSE).encode())
            marker_id = self._marker(fd)
            root_id = identity(os.fstat(fd))
            if (self._root_identity is not None
                    and (root_id != self._root_identity or marker_id != self._marker_identity)):
                raise WorkspaceError(unsafe=True)
            self._root_identity, self._marker_identity = root_id, marker_id
            return fd
        except BaseException:
            os.close(fd)
            raise

    def create(self, run_id):
        root_fd = None
        try:
            if not isinstance(run_id, str) or re.fullmatch('[0-9a-f]{32}', run_id) is None:
                raise WorkspaceError(unsafe=True)
            root_fd = self._root(create=True)
            name = run_id + '-' + uuid.uuid4().hex
            # Register the candidate before mkdir: a signal may arrive after the
            # syscall created it but before Python observes success. No deletion
            # authority exists until its descriptor has been qualified.
            path = self.root / name
            handle = WorkspaceHandle(run_id, path, path / 'example.py', hashlib.sha256(FIXTURE_BYTES).hexdigest())
            self.handle = handle
            self._owned[handle] = [root_fd, None, None]
            root_fd = None
            state = self._owned[handle]
            try:
                os.mkdir(name, mode=0o700, dir_fd=state[0])
            except FileExistsError:
                self.release(handle)
                self.handle = None
                raise WorkspaceError(unsafe=True) from None
            child_fd = os.open(name, DIRECTORY_FLAGS, dir_fd=state[0])
            state[1:] = [child_fd, identity(os.fstat(child_fd))]
            fd = os.open('example.py', os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=child_fd)
            with os.fdopen(fd, 'w+b') as target:
                target.write(FIXTURE_BYTES)
                target.flush()
                target.seek(0)
                if target.read() != FIXTURE_BYTES:
                    raise WorkspaceError()
            return handle
        except (OSError, ValueError, RuntimeError):
            raise WorkspaceError() from None
        finally:
            if root_fd is not None:
                os.close(root_fd)

    def cleanup_qualified(self, handle):
        state = self._owned.get(handle)
        return bool(state and state[1] is not None and state[2] is not None)

    def remove(self, handle):
        if handle not in self._owned:
            raise WorkspaceError(unsafe=True)
        state = self._owned[handle]
        if state is None:
            return  # Never inspect/delete a replacement after successful removal.
        root_fd, child_fd, child_id = state
        fresh_fd = None
        try:
            fresh_fd = self._root()
            if child_fd is None or identity(os.fstat(root_fd)) != identity(os.fstat(fresh_fd)):
                raise WorkspaceError(unsafe=True)
            metadata = os.stat(handle.path.name, dir_fd=root_fd, follow_symlinks=False)
            if not stat.S_ISDIR(metadata.st_mode) or identity(metadata) != child_id:
                raise WorkspaceError(unsafe=True)
            shutil.rmtree(handle.path.name, dir_fd=root_fd)
        except (OSError, ValueError, RuntimeError):
            raise WorkspaceError() from None
        finally:
            if fresh_fd is not None:
                os.close(fresh_fd)
        self.release(handle)
        self._owned[handle] = None

    def release(self, handle):
        state = self._owned.get(handle)
        if state:
            for fd in state[:2]:
                if fd is not None:
                    os.close(fd)
            self._owned[handle] = None


def configured_manager(config, executable, *, config_path, reports):
    """Metadata-only production context; no executable or profile content reads."""
    from ide_smoke.platforms.macos.profile_paths import macos_protected_paths
    from ide_smoke.profile_safety import installation_path
    home = Path.home()
    return WorkspaceManager(source_checkout(), home=home, protected_paths=(
        config.profile_root, installation_path(executable), config_path, reports,
        *macos_protected_paths(home),
    ))


@dataclass(frozen=True)
class WorkspaceManifest:
    run_id: str
    retain_on_failure: bool = False
    workspace_path: str | None = None
    target_path: str | None = None
    initial_fixture_sha256: str | None = None
    disposition: str = 'not_created'
    reason: str = 'admission_incomplete'

    def as_dict(self):
        return {'schema_version': 1, 'run_id': self.run_id,
                'workspace_path': self.workspace_path, 'target_path': self.target_path,
                'target_name': 'example.py', 'initial_fixture_sha256': self.initial_fixture_sha256,
                'retain_on_failure': self.retain_on_failure,
                'disposition': self.disposition, 'reason': self.reason}
