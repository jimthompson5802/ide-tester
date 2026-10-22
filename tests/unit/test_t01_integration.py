"""Production T01 orchestration through the accepted inert session boundary."""
import json
from pathlib import Path

import pytest
import yaml

from ide_smoke.orchestrator import run_attempt
from ide_smoke.results import TEST_IDS, Outcome, Reason, Result


class Session:
    def __init__(self):
        self.requires_workspace_retention = False
        self.calls = []
        self.fail_stage = None
        self.error = None

    def get_version(self, *, deadline):
        self.calls.append(('version', deadline))
        self._fail('version')
        return '1.135.0'

    def launch(self, workspace, *, deadline):
        self.requires_workspace_retention = True
        self.calls.append(('launch', deadline, workspace))
        self._fail('launch')

    def wait_ready(self, *, deadline):
        self.calls.append(('ready', deadline))
        self._fail('ready')

    def close(self):
        self.calls.append(('close',))
        self._fail('close')

    def _fail(self, stage):
        if self.fail_stage == stage:
            raise self.error


@pytest.fixture
def integrated(tmp_path, config_file, settings, monkeypatch, guard):
    monkeypatch.chdir(tmp_path)
    settings['harness']['workspace'] = {'retain_on_failure': False}
    config_file.write_text(yaml.safe_dump(settings))
    def run(session, **kwargs):
        selected = []
        def factory(executable, profile):
            assert guard.owned
            selected.append((executable, profile))
            return session
        code = run_attempt('vscode', str(config_file), _guard_factory=lambda: guard,
                           _session_factory=factory, **kwargs)
        summary_path = next((tmp_path / 'reports').glob('*/summary.json'))
        data = json.loads(summary_path.read_text())
        assert data['workspace'] == json.loads(summary_path.with_name('workspace.json').read_text())
        assert guard.released
        return code, data, selected
    return run


def test_default_t01_uses_selected_resources_shared_deadline_and_retains(integrated, settings):
    session = Session()
    code, data, selected = integrated(session)
    assert code == 4
    assert selected == [(Path(settings['ides']['vscode']['executable']), Path(settings['ides']['vscode']['profile_root']))]
    assert [c[0] for c in session.calls] == ['version', 'launch', 'ready', 'close']
    assert session.calls[0][1] == session.calls[1][1] == session.calls[2][1]
    assert session.calls[1][2] == Path(data['workspace']['workspace_path'])
    assert [t['outcome'] for t in data['tests']] == ['PASS', 'SKIP', 'SKIP', 'SKIP', 'SKIP']
    assert all(t['origin']['reason'] == 'operations_unimplemented' for t in data['tests'][1:])
    assert data['tests'][0]['duration_seconds'] >= 0
    assert data['versions'] == {'ide': '1.135.0', 'extension': None}
    assert data['cleanup']['outcome'] == 'PASS'
    assert data['workspace']['retain_on_failure'] is False
    assert data['workspace']['disposition'] == 'retained'
    assert data['workspace']['reason'] == 'gui_exit_scope_limited'
    assert Path(data['workspace']['target_path']).exists()


@pytest.mark.parametrize('reason,code,outcome', [
    ('profile_busy', 3, 'BLOCKED'), ('native_prerequisite_missing', 3, 'BLOCKED'),
    ('unsupported_launcher', 3, 'BLOCKED'), ('unsupported_profile_path', 3, 'BLOCKED'),
    ('launch_failed', 4, 'HARNESS ERROR'), ('early_exit', 4, 'HARNESS ERROR'),
    ('readiness_timeout', 4, 'HARNESS ERROR'), ('native_timeout', 4, 'HARNESS ERROR'),
    ('ownership_uncertain', 4, 'HARNESS ERROR'), ('obstructed', 4, 'HARNESS ERROR'),
    ('unknown_dialog', 4, 'HARNESS ERROR'), ('version_unavailable', 4, 'HARNESS ERROR'),
])
def test_lifecycle_errors_preserve_controlled_reason_and_dependent_origin(integrated, reason, code, outcome):
    from ide_smoke.adapters.base import LifecycleError
    session = Session()
    session.fail_stage = 'launch'
    session.error = LifecycleError(reason)
    actual, data, _ = integrated(session)
    assert actual == code
    public = 'ide_prerequisite_missing' if reason == 'native_prerequisite_missing' else 'ide_' + reason
    assert data['tests'][0]['reason'] == public
    assert data['tests'][0]['outcome'] == outcome
    assert data['tests'][0]['duration_seconds'] >= 0
    assert all(t['origin'] == {'outcome': outcome, 'reason': public} for t in data['tests'][1:])
    assert session.calls[-1] == ('close',)


@pytest.mark.parametrize('stage', ['version', 'launch', 'ready'])
def test_interrupted_t01_keeps_elapsed_result_and_always_closes(integrated, stage):
    session = Session()
    session.fail_stage, session.error = stage, KeyboardInterrupt('SENSITIVE_INTERRUPT')
    code, data, _ = integrated(session)
    assert code == 130
    first = data['tests'][0]
    assert (first['outcome'], first['reason']) == ('HARNESS ERROR', 'interrupted')
    assert first['duration_seconds'] >= 0
    assert all(t['origin'] == {'outcome': 'HARNESS ERROR', 'reason': 'interrupted'} for t in data['tests'][1:])
    assert session.calls[-1] == ('close',)
    assert data['workspace']['disposition'] == ('removed' if stage == 'version' else 'retained')


@pytest.mark.parametrize('value', [None, 1, 'true', RuntimeError('SENSITIVE_RETENTION')])
def test_invalid_retention_fails_closed_and_releases_guard(integrated, value):
    class InvalidSession(Session):
        def close(self):
            super().close()
            self.__class__.requires_workspace_retention = property(lambda owner: (_ for _ in ()).throw(value) if isinstance(value, Exception) else value)
    session = InvalidSession()
    code, data, _ = integrated(session)
    assert code == 4
    assert data['tests'][0]['outcome'] == 'PASS'
    assert data['cleanup']['reason'] == 'cleanup_failed'
    assert data['workspace']['reason'] == 'operation_cleanup_failed'
    assert Path(data['workspace']['target_path']).is_file()
    assert 'SENSITIVE' not in json.dumps(data)


def test_cleanup_diagnostics_are_local_only_and_preserve_t01(integrated, capsys, tmp_path):
    from ide_smoke.adapters.base import CleanupError
    session = Session()
    session.fail_stage = 'close'
    session.error = CleanupError(owned_pid=123, owned_birth='1792619559:850504', workspace=tmp_path)
    code, data, _ = integrated(session)
    assert code == 4
    assert data['tests'][0]['outcome'] == 'PASS'
    assert data['cleanup']['reason'] == 'cleanup_failed'
    assert data['workspace']['reason'] == 'operation_cleanup_failed'
    output = capsys.readouterr().err
    assert 'owned_pid=123' in output
    assert 'owned_birth=1792619559:850504' in output
    assert 'workspace=' + str(tmp_path) in output
    assert 'owned_pid' not in json.dumps(data)


@pytest.mark.parametrize('cleanup_fails', [False, True])
def test_all_pass_gui_session_retains_with_separate_cleanup_precedence(integrated, cleanup_fails):
    session = Session()
    if cleanup_fails:
        session.fail_stage, session.error = 'close', RuntimeError('SENSITIVE_CLEANUP')
    def first(context, timeout):
        context.session = session
        context.register_cleanup(session.close)
        session.launch(context.workspace_path, deadline=10)
        return Result(Outcome.PASS, Reason.PASSED)
    operations = dict.fromkeys(TEST_IDS, lambda *args: Result(Outcome.PASS, Reason.PASSED))
    operations['T01'] = first
    code, data, selected = integrated(session, _operations=operations)
    assert code == (4 if cleanup_fails else 0)
    assert not selected  # Explicit operations never construct the default session.
    assert all(test['outcome'] == 'PASS' for test in data['tests'])
    assert data['cleanup']['outcome'] == ('HARNESS ERROR' if cleanup_fails else 'PASS')
    assert data['workspace']['reason'] == ('operation_cleanup_failed' if cleanup_fails else 'gui_exit_scope_limited')
    assert data['workspace']['retain_on_failure'] is False
    assert 'SENSITIVE' not in json.dumps(data)
