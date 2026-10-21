"""Owned workspace behavior and independent preservation checks."""
import json
from pathlib import Path
import pytest
from ide_smoke.workspace import WorkspaceManager, WorkspaceError, FIXTURE_BYTES, MARKER

@pytest.fixture
def manager(tmp_path):
    checkout = tmp_path / 'checkout'
    checkout.mkdir()
    return WorkspaceManager(checkout, home=tmp_path / 'home', protected_paths=(tmp_path / 'profile',))

def test_unique_fixture_and_removal(manager):
    first = manager.create('a' * 32)
    second = manager.create('b' * 32)
    assert first.path != second.path
    assert first.target.read_bytes() == FIXTURE_BYTES
    manager.remove(first)
    assert not first.path.exists()
    assert second.target.read_bytes() == FIXTURE_BYTES
    manager.remove(first)
    manager.remove(second)
    assert manager.root.is_dir()

@pytest.mark.parametrize('marker', [None, '{}', 'x' * 4097,
    '{"schema_version":true,"purpose":"ide-smoke-workspaces"}',
    '{"schema_version":1,"schema_version":1,"purpose":"ide-smoke-workspaces"}'])
def test_unmarked_or_invalid_root_never_adopted(manager, marker):
    manager.root.mkdir()
    sentinel = manager.root / 'unrelated'
    sentinel.write_bytes(b'preserve')
    if marker is not None:
        (manager.root / MARKER).write_text(marker)
    with pytest.raises(WorkspaceError):
        manager.create('a' * 32)
    assert set(manager.root.iterdir()) == set([sentinel] if marker is None else [sentinel, manager.root / MARKER])
    assert sentinel.read_bytes() == b'preserve'

def test_nested_links_and_hardlinks_preserve_outside(manager, tmp_path):
    import os
    outside = tmp_path / 'outside'
    outside.mkdir()
    sentinel = outside / 'sentinel'
    sentinel.write_bytes(b'outside')
    handle = manager.create('a' * 32)
    (handle.path / 'link').symlink_to(outside, target_is_directory=True)
    os.link(sentinel, handle.path / 'hardlink')
    manager.remove(handle)
    assert sentinel.read_bytes() == b'outside'

def test_replaced_child_is_preserved(manager, tmp_path):
    handle = manager.create('a' * 32)
    moved = manager.root / 'moved'
    handle.path.rename(moved)
    handle.path.mkdir()
    with pytest.raises(WorkspaceError):
        manager.remove(handle)
    assert moved.joinpath('example.py').read_bytes() == FIXTURE_BYTES
    assert handle.path.is_dir()
    manager.release(handle)

def test_collision_does_not_overwrite(manager, monkeypatch):
    import ide_smoke.workspace as module
    class Fixed:
        hex = 'c' * 32
    monkeypatch.setattr(module.uuid, 'uuid4', lambda: Fixed())
    first = manager.create('a' * 32)
    with pytest.raises(WorkspaceError):
        manager.create('a' * 32)
    assert first.target.read_bytes() == FIXTURE_BYTES
    manager.remove(first)

@pytest.mark.parametrize('which', ['root', 'marker', 'child'])
def test_link_replacement_refused(manager, tmp_path, which):
    handle = manager.create('a' * 32)
    outside = tmp_path / 'outside'
    outside.mkdir()
    sentinel = outside / 'sentinel'
    sentinel.write_text('preserve')
    path = {'root': manager.root, 'marker': manager.root / MARKER, 'child': handle.path}[which]
    path.rename(path.with_name(path.name + '-original'))
    path.symlink_to(outside, target_is_directory=True)
    with pytest.raises(WorkspaceError):
        manager.remove(handle)
    manager.release(handle)
    assert sentinel.read_text() == 'preserve'

def test_forged_handle_refused(manager, tmp_path):
    from ide_smoke.workspace import WorkspaceHandle
    handle = manager.create('a' * 32)
    with pytest.raises(WorkspaceError):
        manager.remove(WorkspaceHandle(handle.run_id, handle.path, handle.target, handle.digest))
    assert handle.target.read_bytes() == FIXTURE_BYTES
    manager.remove(handle)

@pytest.mark.parametrize('interrupt', [False, True])
def test_initialization_failure_is_accounted_for(manager, monkeypatch, interrupt):
    import ide_smoke.workspace as module
    original = module.os.open
    def fail(path, *args, **kwargs):
        if path == 'example.py':
            raise KeyboardInterrupt if interrupt else PermissionError
        return original(path, *args, **kwargs)
    monkeypatch.setattr(module.os, 'supports_dir_fd', module.os.supports_dir_fd | {fail})
    monkeypatch.setattr(module.os, 'open', fail)
    with pytest.raises(KeyboardInterrupt if interrupt else WorkspaceError):
        manager.create('a' * 32)
    assert manager.handle.path.is_dir()
    manager.remove(manager.handle)

def test_protected_overlap_no_writes(tmp_path):
    checkout = tmp_path / 'checkout'
    checkout.mkdir()
    manager = WorkspaceManager(checkout, home=tmp_path / 'home', protected_paths=(checkout / 'workspaces' / 'profile',))
    with pytest.raises(WorkspaceError):
        manager.create('a' * 32)
    assert not manager.root.exists()

def test_traversal_replacement_preserves_outside(manager, tmp_path, monkeypatch):
    import ide_smoke.workspace as module
    handle = manager.create('a' * 32)
    nested = handle.path / 'nested'
    nested.mkdir()
    (nested / 'inside').write_text('inside')
    outside = tmp_path / 'outside'
    outside.mkdir()
    (outside / 'sentinel').write_text('preserve')
    original = module.os.open
    replaced = []
    def swap(path, *args, **kwargs):
        if path == 'nested' and not replaced:
            nested.rename(handle.path / 'moved')
            nested.symlink_to(outside, target_is_directory=True)
            replaced.append(True)
        return original(path, *args, **kwargs)
    monkeypatch.setattr(module.os, 'supports_dir_fd', module.os.supports_dir_fd | {swap})
    monkeypatch.setattr(module.os, 'open', swap)
    with pytest.raises(WorkspaceError):
        manager.remove(handle)
    assert replaced
    assert (outside / 'sentinel').read_text() == 'preserve'
    manager.release(handle)

def test_case_alias_and_marker_replacement(manager):
    handle = manager.create('a' * 32)
    alias = handle.path.with_name(handle.path.name.upper())
    if not alias.exists():
        pytest.skip('Host filesystem is case sensitive')
    assert alias.samefile(handle.path)
    marker = manager.root / MARKER
    saved = manager.root / 'old-marker'
    marker.rename(saved)
    marker.write_text(json.dumps({'schema_version': 1, 'purpose': 'ide-smoke-workspaces'}))
    with pytest.raises(WorkspaceError):
        manager.remove(handle)
    assert handle.target.read_bytes() == FIXTURE_BYTES
    manager.release(handle)

@pytest.mark.parametrize('kind', ['file', 'link'])
def test_unsafe_root_no_writes(manager, tmp_path, kind):
    outside = tmp_path / 'outside'
    outside.mkdir()
    if kind == 'file':
        manager.root.write_text('preserve')
    else:
        manager.root.symlink_to(outside, target_is_directory=True)
    with pytest.raises(WorkspaceError):
        manager.create('a' * 32)
    assert list(outside.iterdir()) == []

def test_deletion_io_error_preserves_resource(manager, monkeypatch):
    import ide_smoke.workspace as module
    handle = manager.create('a' * 32)
    def fail(*args, **kwargs):
        raise PermissionError('PRIVATE')
    fail.avoids_symlink_attacks = True
    monkeypatch.setattr(module.shutil, 'rmtree', fail)
    with pytest.raises(WorkspaceError, match='workspace_unavailable'):
        manager.remove(handle)
    assert handle.target.read_bytes() == FIXTURE_BYTES
    manager.release(handle)

def test_fixture_substitution_never_written(manager, tmp_path, monkeypatch):
    import ide_smoke.workspace as module
    outside = tmp_path / 'outside'
    outside.write_bytes(b'preserve')
    original = module.os.open
    def substitute(path, *args, **kwargs):
        if path == 'example.py':
            module.os.link(outside, path, dst_dir_fd=kwargs['dir_fd'])
        return original(path, *args, **kwargs)
    monkeypatch.setattr(module.os, 'supports_dir_fd', module.os.supports_dir_fd | {substitute})
    monkeypatch.setattr(module.os, 'open', substitute)
    with pytest.raises(WorkspaceError):
        manager.create('a' * 32)
    assert outside.read_bytes() == b'preserve'
    manager.remove(manager.handle)
    assert outside.read_bytes() == b'preserve'

def test_replaced_root_directory_refused(manager):
    handle = manager.create('a' * 32)
    manager.root.rename(manager.root.with_name('original'))
    manager.root.mkdir()
    (manager.root / MARKER).write_text(json.dumps({'schema_version': 1, 'purpose': 'ide-smoke-workspaces'}))
    with pytest.raises(WorkspaceError):
        manager.remove(handle)
    manager.release(handle)

@pytest.mark.parametrize('run_id', ['../escape', '', 'A' * 32])
def test_bad_identity_rejected_before_writes(manager, run_id):
    with pytest.raises(WorkspaceError):
        manager.create(run_id)
    assert not manager.root.exists()

@pytest.mark.parametrize('kind', ['missing', 'symlink', 'hardlink', 'directory'])
def test_bad_marker_is_positive_unsafe(manager, tmp_path, kind):
    import os
    manager.root.mkdir()
    marker = manager.root / MARKER
    outside = tmp_path / 'outside-marker'
    outside.write_text(json.dumps({'schema_version': 1, 'purpose': 'ide-smoke-workspaces'}))
    if kind == 'symlink':
        marker.symlink_to(outside)
    elif kind == 'hardlink':
        os.link(outside, marker)
    elif kind == 'directory':
        marker.mkdir()
    with pytest.raises(WorkspaceError) as error:
        manager.create('a' * 32)
    assert error.value.unsafe
    assert outside.read_text() == json.dumps({'schema_version': 1, 'purpose': 'ide-smoke-workspaces'})


def test_existing_case_alias_root_rejected(manager):
    alias = manager.root.with_name('WORKSPACES')
    alias.mkdir()
    if not manager.root.exists():
        pytest.skip('Host filesystem is case sensitive')
    (alias / MARKER).write_text(json.dumps({'schema_version': 1, 'purpose': 'ide-smoke-workspaces'}))
    with pytest.raises(WorkspaceError) as error:
        manager.create('a' * 32)
    assert error.value.unsafe

def test_interrupt_after_exclusive_mkdir_preserves_accounted_path(manager, monkeypatch):
    import ide_smoke.workspace as module
    original = module.os.mkdir
    def interrupt(path, *args, **kwargs):
        result = original(path, *args, **kwargs)
        if kwargs.get('dir_fd') is not None:
            raise KeyboardInterrupt
        return result
    monkeypatch.setattr(module.os, 'supports_dir_fd', module.os.supports_dir_fd | {interrupt})
    monkeypatch.setattr(module.os, 'mkdir', interrupt)
    with pytest.raises(KeyboardInterrupt):
        manager.create('a' * 32)
    assert manager.handle.path.is_dir()
    with pytest.raises(WorkspaceError):
        manager.remove(manager.handle)
    assert manager.handle.path.is_dir()
    manager.release(manager.handle)


def test_unsupported_deletion_capability_refuses_before_writes(manager, monkeypatch):
    import ide_smoke.workspace as module
    monkeypatch.setattr(module.shutil.rmtree, 'avoids_symlink_attacks', False)
    with pytest.raises(WorkspaceError):
        manager.create('a' * 32)
    assert not manager.root.exists()


def test_indeterminate_marker_access_preserves_sentinels(manager, monkeypatch):
    import ide_smoke.workspace as module
    handle = manager.create('a' * 32)
    original = module.os.open
    def fail(path, *args, **kwargs):
        if path == MARKER:
            raise PermissionError('PRIVATE')
        return original(path, *args, **kwargs)
    monkeypatch.setattr(module.os, 'supports_dir_fd', module.os.supports_dir_fd | {fail})
    monkeypatch.setattr(module.os, 'open', fail)
    with pytest.raises(WorkspaceError) as error:
        manager.remove(handle)
    assert not error.value.unsafe
    assert handle.target.read_bytes() == FIXTURE_BYTES
    manager.release(handle)


def test_home_case_alias_refused_before_creation(manager):
    manager.root.mkdir()
    alias = manager.root.with_name('WORKSPACES')
    if not alias.exists():
        pytest.skip('Host filesystem is case sensitive')
    (manager.root / MARKER).write_text(json.dumps({'schema_version': 1, 'purpose': 'ide-smoke-workspaces'}))
    guarded = WorkspaceManager(manager.checkout, home=alias, protected_paths=())
    with pytest.raises(WorkspaceError) as error:
        guarded.create('a' * 32)
    assert error.value.unsafe
    assert list(manager.root.iterdir()) == [manager.root / MARKER]
