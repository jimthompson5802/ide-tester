"""Inert qualification-controller checks; no application or native worker is run."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest

from ide_smoke.adapters.vscode import LaunchSpec, ProcessIdentity


def load_probe():
    path = Path(__file__).parents[2] / 'scripts/spikes/m1_05/qualify_editor.py'
    spec = importlib.util.spec_from_file_location('m1_05_qualification', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def owned_fixture(tmp_path):
    workspace = tmp_path / 'fixture'
    workspace.mkdir()
    target = workspace / 'example.py'
    target.write_bytes(b'message = "original fixture"\n')
    spec = LaunchSpec(Path('/app/Code'), Path('/dedicated-profile'), workspace)
    session = SimpleNamespace(spec=spec, identity=ProcessIdentity(42, '1:2', spec.executable, spec.argv),
                              started=True, closed=False, uncertain=False)
    return session, target


def facts(action, *, document='untitled', content='empty', dirty=False, **changes):
    result = dict(action=action, owned=True, document=document, editor_focused=True,
                  content=content, dirty=dirty, performed=action != 'inspect')
    result.update(changes)
    return result


def test_new_editor_enter_save_as_proves_new_file_and_preserves_fixture(tmp_path):
    probe = load_probe()
    session, original = owned_fixture(tmp_path)
    target = original.with_name('created.py')
    calls = []
    state = dict(document='untitled', content='empty', dirty=False)
    def exchange(actual_session, action, actual_target, deadline):
        assert actual_session is session and actual_target == target and deadline == 5
        calls.append(action)
        if action == 'enter':
            assert not target.exists()
            state.update(content='edited', dirty=True)
        if action == 'save_as':
            assert not target.exists()
            target.write_bytes(b'message = "edited by ide-smoke"\n')
            state.update(document='target', dirty=False)
        return facts(action, **state)
    result = probe.qualify_sequence(session, target, deadline=5, exchange=exchange, clock=lambda: 1)
    assert calls == ['new', 'inspect', 'enter', 'inspect', 'save_as', 'inspect']
    assert result['dirty_before_save'] is True and result['disk_match'] is True
    assert result['observed_bytes'] == 32
    assert original.read_bytes() == b'message = "original fixture"\n'


@pytest.mark.parametrize('uncertain', [dict(owned=False), dict(editor_focused=False), dict(document='other')])
def test_uncertain_editor_after_enter_never_reaches_save_as(tmp_path, uncertain):
    probe = load_probe()
    session, original = owned_fixture(tmp_path)
    calls = []
    def exchange(session, action, target, deadline):
        calls.append(action)
        edited = 'enter' in calls
        return facts(action, content='edited' if edited else 'empty', dirty=edited,
                     **(uncertain if edited and action == 'inspect' else {}))
    with pytest.raises(probe.ProbeError, match='^ownership_uncertain$'):
        probe.qualify_sequence(session, original.with_name('created.py'), deadline=5,
                               clock=lambda: 1, exchange=exchange)
    assert calls == ['new', 'inspect', 'enter', 'inspect']


@pytest.mark.parametrize('changes', [dict(owned=1), dict(dirty=1), dict(performed=False),
                                      dict(content='private text'), dict(extra='private text')])
def test_worker_reply_is_strict_and_never_echoes_untrusted_values(tmp_path, changes):
    probe = load_probe()
    session, original = owned_fixture(tmp_path)
    with pytest.raises(probe.ProbeError, match='^invalid_worker_reply$'):
        probe.qualify_sequence(session, original.with_name('created.py'), deadline=5, clock=lambda: 1,
                               exchange=lambda session, action, target, deadline: facts(action, **changes))


def test_existing_target_is_never_overwritten(tmp_path):
    probe = load_probe()
    session, original = owned_fixture(tmp_path)
    target = original.with_name('created.py')
    target.write_bytes(b'preserve this file\n')
    with pytest.raises(probe.ProbeError, match='^target_already_exists$'):
        probe.qualify_sequence(session, target, deadline=5, clock=lambda: 1,
                               exchange=lambda *args: pytest.fail('must refuse before input'))
    assert target.read_bytes() == b'preserve this file\n'


def test_deadline_is_shared_and_late_enter_is_never_replayed(tmp_path):
    probe = load_probe()
    session, original = owned_fixture(tmp_path)
    now = [1.0]
    calls = []
    def exchange(session, action, target, deadline):
        calls.append((action, deadline))
        if action == 'enter':
            now[0] = deadline
        return facts(action)
    with pytest.raises(probe.ProbeError, match='^editor_timeout$'):
        probe.qualify_sequence(session, original.with_name('created.py'), deadline=5,
                               exchange=exchange, clock=lambda: now[0])
    assert calls == [('new', 5), ('inspect', 5), ('enter', 5)]


def test_new_editor_polls_pending_identity_but_never_enters_before_qualified(tmp_path):
    probe = load_probe()
    session, original = owned_fixture(tmp_path)
    now = [1.0]
    calls = []
    def exchange(session, action, target, deadline):
        calls.append(action)
        return facts(action, document='unknown', editor_focused=False, content='unknown', dirty=None)
    def sleep(seconds):
        now[0] += seconds
    with pytest.raises(probe.ProbeError, match='^editor_timeout$'):
        probe.qualify_sequence(session, original.with_name('created.py'), deadline=1.1,
                               exchange=exchange, clock=lambda: now[0], sleep=sleep)
    assert calls == ['new', 'inspect', 'inspect']


def test_probe_admits_cleans_and_retains_two_independent_new_files(tmp_path, config_file, guard, monkeypatch):
    import json
    from ide_smoke.adapters.vscode import Observation
    probe = load_probe()
    monkeypatch.chdir(tmp_path)
    targets = []
    backends = []
    class Backend:
        def __init__(self):
            self.closed = False
            self.state = dict(document='untitled', content='empty', dirty=False)
        def get_version(self, executable, *, deadline):
            assert guard.owned
            return '1.135.0'
        def start(self, spec, deadline, claim):
            targets.append(spec.workspace / 'created.py')
            assert not targets[-1].exists()
            claim(ProcessIdentity(42, '1:2', spec.executable, spec.argv))
        def observe(self, identity, deadline):
            return Observation()
        def close(self, identity, deadline):
            self.closed = True
        def exchange(self, session, action, target, deadline):
            assert guard.owned and not self.closed
            if action == 'enter':
                self.state.update(content='edited', dirty=True)
            if action == 'save_as':
                target.write_bytes(b'message = "edited by ide-smoke"\n')
                self.state.update(document='target', dirty=False)
            return facts(action, **self.state)
    def factory():
        backend = Backend()
        backends.append(backend)
        return backend
    for _ in range(2):
        result = probe.run_probe(str(config_file), backend_factory=factory, _guard_factory=lambda: guard)
        assert result.exit_code == 4 and result.error is None
        assert guard.released and not guard.owned and backends[-1].closed
    assert targets[0] != targets[1]
    for target in targets:
        assert target.read_bytes() == b'message = "edited by ide-smoke"\n'
        assert target.with_name('example.py').read_bytes() == b'message = "original fixture"\n'
    sidecars = list((tmp_path / 'reports').glob('*/qualification-editor.json'))
    assert len(sidecars) == 2
    for sidecar in sidecars:
        data = json.loads(sidecar.read_text())
        assert data['facts']['disk_match'] is True
        assert data['cleanup'] == 'PASS' and data['workspace_disposition'] == 'retained'


@pytest.mark.parametrize('race', ['atomic_replace', 'hard_link', 'parent_replace'])
def test_disk_read_refuses_entry_or_parent_changes_during_inspection(tmp_path, monkeypatch, race):
    import os
    probe = load_probe()
    session, original = owned_fixture(tmp_path)
    target = original.with_name('created.py')
    real_read = os.read
    def racing_read(fd, count):
        value = real_read(fd, count)
        if race == 'atomic_replace':
            replacement = target.with_name('replacement.py')
            replacement.write_bytes(b'message = "edited by ide-smoke"\n')
            replacement.replace(target)
        elif race == 'hard_link':
            os.link(target, target.with_name('alias.py'))
        else:
            target.parent.rename(tmp_path / 'preserved-fixture')
            target.parent.mkdir()
            target.write_bytes(b'message = "edited by ide-smoke"\n')
        return value
    state = dict(document='untitled', content='empty', dirty=False)
    def exchange(session, action, target, deadline):
        if action == 'enter':
            state.update(content='edited', dirty=True)
        if action == 'save_as':
            target.write_bytes(b'message = "edited by ide-smoke"\n')
            state.update(document='target', dirty=False)
        return facts(action, **state)
    monkeypatch.setattr(probe.os, 'read', racing_read)
    with pytest.raises(probe.ProbeError, match='^disk_inspection_failed$'):
        probe.qualify_sequence(session, target, deadline=5, clock=lambda: 1, exchange=exchange)


def test_admitted_directory_replacement_refuses_before_new_editor(tmp_path):
    import os
    probe = load_probe()
    session, original = owned_fixture(tmp_path)
    admitted = os.stat(original.parent)
    original.parent.rename(tmp_path / 'preserved-fixture')
    original.parent.mkdir()
    with pytest.raises(probe.ProbeError, match='^unsafe_target$'):
        probe.qualify_sequence(session, original.with_name('created.py'), deadline=5, clock=lambda: 1,
                               expected_parent_identity=(admitted.st_dev, admitted.st_ino),
                               exchange=lambda *args: pytest.fail('replaced fixture must refuse'))


def test_save_as_persistence_can_appear_after_clean_editor_readback(tmp_path):
    probe = load_probe()
    session, original = owned_fixture(tmp_path)
    target = original.with_name('created.py')
    state = dict(document='untitled', content='empty', dirty=False)
    now = [1.0]
    def exchange(session, action, target, deadline):
        if action == 'enter':
            state.update(content='edited', dirty=True)
        if action == 'save_as':
            state.update(document='target', dirty=False)
        return facts(action, **state)
    def sleep(seconds):
        now[0] += seconds
        target.write_bytes(b'message = "edited by ide-smoke"\n')
    result = probe.qualify_sequence(session, target, deadline=5, exchange=exchange,
                                    clock=lambda: now[0], sleep=sleep)
    assert result['disk_match'] is True
