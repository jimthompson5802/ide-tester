"""Public and inert runs correlate workspace disposition with owned data."""
import json
from pathlib import Path
import pytest
import yaml
from ide_smoke.orchestrator import run_attempt as _run_attempt
from ide_smoke.reporting import Reporter
from ide_smoke.results import TEST_IDS, Result, Outcome, Reason
from ide_smoke.workspace import FIXTURE_BYTES


def run_attempt(*args, **kwargs):
    # Existing non-GUI workspace policy checks explicitly select inert operations.
    kwargs.setdefault('_operations', {})
    return _run_attempt(*args, **kwargs)


def artifacts(tmp_path):
    report = next((tmp_path / 'reports').glob('*/summary.json'))
    summary = json.loads(report.read_text())
    sidecar = json.loads(report.with_name('workspace.json').read_text())
    assert summary['workspace'] == sidecar
    return summary, sidecar

@pytest.mark.parametrize('retain', [False, True])
def test_public_workspace_lifecycle(tmp_path, config_file, settings, monkeypatch, guard, retain):
    monkeypatch.chdir(tmp_path)
    settings['harness']['workspace'] = {'retain_on_failure': retain}
    config_file.write_text(yaml.safe_dump(settings))
    assert run_attempt('vscode', str(config_file), _guard_factory=lambda: guard) == 4
    summary, manifest = artifacts(tmp_path)
    assert manifest['run_id'] == summary['run_id']
    assert manifest['disposition'] == ('retained' if retain else 'removed')
    path = Path(manifest['target_path'])
    assert path.exists() is retain
    if retain:
        assert path.read_bytes() == FIXTURE_BYTES
    assert all(t['origin']['reason'] == 'operations_unimplemented' for t in summary['tests'])


def test_same_workspace_and_cleanup_order(tmp_path, config_file, monkeypatch, guard):
    monkeypatch.chdir(tmp_path)
    seen = []
    def action(context, timeout):
        seen.append(context.workspace)
        assert context.target_path.read_bytes() == FIXTURE_BYTES
        context.register_cleanup(lambda: seen.append(context.workspace_path.exists() and guard.owned))
        return Result(Outcome.PASS, Reason.PASSED)
    assert run_attempt('vscode', str(config_file), _guard_factory=lambda: guard,
                       _operations=dict.fromkeys(TEST_IDS, action)) == 0
    assert all(h is seen[0] for h in seen[:5])
    assert seen[5:] == [True] * 5
    assert artifacts(tmp_path)[1]['disposition'] == 'removed'

@pytest.mark.parametrize('failure', ['manifest', 'cleanup', 'delete', 'initialization'])
def test_failure_resource_handling(tmp_path, config_file, monkeypatch, guard, failure):
    from ide_smoke import workspace
    monkeypatch.chdir(tmp_path)
    class BrokenReporter(Reporter):
        def workspace_manifest(self, manifest):
            if failure == 'manifest':
                raise OSError('PRIVATE')
            super().workspace_manifest(manifest)
    def action(context, timeout):
        if failure == 'cleanup':
            def fail():
                raise OSError('PRIVATE')
            context.register_cleanup(fail)
        return Result(Outcome.PASS, Reason.PASSED)
    if failure == 'delete':
        monkeypatch.setattr(workspace.WorkspaceManager, 'remove', lambda *args: (_ for _ in ()).throw(OSError('PRIVATE')))
    if failure == 'initialization':
        original = workspace.os.open
        def fail(path, *args, **kwargs):
            if path == 'example.py':
                raise KeyboardInterrupt
            return original(path, *args, **kwargs)
        monkeypatch.setattr(workspace.os, 'supports_dir_fd', workspace.os.supports_dir_fd | {fail})
        monkeypatch.setattr(workspace.os, 'open', fail)
    expected = 130 if failure == 'initialization' else 4
    assert run_attempt('vscode', str(config_file), _guard_factory=lambda: guard,
                       _operations=dict.fromkeys(TEST_IDS, action), _reporter_factory=BrokenReporter) == expected
    summary_path = next((tmp_path / 'reports').glob('*/summary.json'))
    data = json.loads(summary_path.read_text())
    manifest = data['workspace']
    assert manifest['disposition'] == {'manifest': 'retained', 'cleanup': 'retained', 'delete': 'cleanup_failed', 'initialization': 'removed'}[failure]
    assert Path(manifest['workspace_path']).exists() is (failure != 'initialization')
    assert 'PRIVATE' not in summary_path.read_text()
    assert guard.released

@pytest.mark.parametrize('outcome,retain,expected', [(Outcome.FAIL, True, 'retained'), (Outcome.BLOCKED, True, 'retained'), (Outcome.PASS, True, 'removed'), (Outcome.FAIL, False, 'removed')])
def test_retention_decision(tmp_path, config_file, settings, monkeypatch, guard, outcome, retain, expected):
    monkeypatch.chdir(tmp_path)
    settings['harness']['workspace'] = {'retain_on_failure': retain}
    config_file.write_text(yaml.safe_dump(settings))
    action = lambda *args: Result(outcome, Reason.PASSED if outcome == Outcome.PASS else Reason.PREREQUISITE)
    run_attempt('vscode', str(config_file), _guard_factory=lambda: guard, _operations=dict.fromkeys(TEST_IDS, action))
    assert artifacts(tmp_path)[1]['disposition'] == expected


def test_rejected_admission_has_no_workspace(tmp_path, config_file, monkeypatch, guard, isolated_workspace_checkout):
    monkeypatch.chdir(tmp_path)
    config_file.write_text('harness: []')
    assert run_attempt('vscode', str(config_file), _guard_factory=lambda: guard) == 2
    assert artifacts(tmp_path)[1]['disposition'] == 'not_created'
    assert not (isolated_workspace_checkout / 'workspaces').exists()

@pytest.mark.parametrize('failure', ['event', 'final_manifest', 'summary'])
def test_late_evidence_failure_reports_actual_disposition(tmp_path, config_file, monkeypatch, guard, failure):
    monkeypatch.chdir(tmp_path)
    captured = []
    class BrokenReporter(Reporter):
        def workspace_manifest(self, manifest):
            if failure == 'final_manifest' and manifest.disposition == 'removed':
                raise OSError('PRIVATE_NAME_CONTENT')
            return super().workspace_manifest(manifest)
        def event(self, name, **kwargs):
            if failure == 'event' and name == 'workspace_finalized':
                raise OSError('PRIVATE_NAME_CONTENT')
            return super().event(name, **kwargs)
        def finalize(self, data):
            captured.append(data)
            if failure == 'summary':
                raise OSError('PRIVATE_NAME_CONTENT')
            return super().finalize(data)
    assert run_attempt('vscode', str(config_file), _guard_factory=lambda: guard, _reporter_factory=BrokenReporter) == 4
    assert captured[0]['workspace']['disposition'] == 'removed'
    assert not Path(captured[0]['workspace']['workspace_path']).exists()
    assert 'PRIVATE_NAME_CONTENT' not in json.dumps(captured)
    if failure == 'final_manifest':
        assert captured[0]['exit_code'] == 4
        assert any(i['reason'] == 'workspace_manifest_failed' for i in captured[0]['issues'])
    assert guard.released


def test_manifest_fields_digest_and_privacy(tmp_path, config_file, monkeypatch, guard, settings):
    import hashlib
    monkeypatch.chdir(tmp_path)
    settings['harness']['workspace'] = {'retain_on_failure': True}
    config_file.write_text(yaml.safe_dump(settings))
    profile = Path(settings['ides']['vscode']['profile_root'])
    sentinel = profile / 'private-sentinel'
    sentinel.write_bytes(b'PRIVATE_PROFILE')
    before = {str(p.relative_to(profile)): p.read_bytes() for p in profile.rglob('*') if p.is_file()}
    def action(context, timeout):
        (context.workspace_path / 'PRIVATE_FILENAME').write_bytes(b'PRIVATE_CONTENT')
        return Result(Outcome.FAIL, Reason.MISMATCH)
    assert run_attempt('vscode', str(config_file), _guard_factory=lambda: guard, _operations=dict.fromkeys(TEST_IDS, action)) == 1
    data, manifest = artifacts(tmp_path)
    assert set(manifest) == {'schema_version', 'run_id', 'workspace_path', 'target_path', 'target_name', 'initial_fixture_sha256', 'retain_on_failure', 'disposition', 'reason'}
    assert manifest['initial_fixture_sha256'] == hashlib.sha256(Path(manifest['target_path']).read_bytes()).hexdigest()
    assert before == {str(p.relative_to(profile)): p.read_bytes() for p in profile.rglob('*') if p.is_file()}
    assert 'PRIVATE' not in ''.join(p.read_text() for p in (tmp_path / 'reports').rglob('*') if p.is_file())


def test_initial_manifest_precedes_deletion_under_guard(tmp_path, config_file, monkeypatch, guard):
    from ide_smoke import workspace
    monkeypatch.chdir(tmp_path)
    original = workspace.WorkspaceManager.remove
    def observed(manager, handle):
        assert guard.owned
        manifest_path = next((tmp_path / 'reports').glob('*/workspace.json'))
        assert json.loads(manifest_path.read_text())['workspace_path'] == str(handle.path)
        assert json.loads(manifest_path.read_text())['disposition'] == 'created'
        return original(manager, handle)
    monkeypatch.setattr(workspace.WorkspaceManager, 'remove', observed)
    assert run_attempt('vscode', str(config_file), _guard_factory=lambda: guard) == 4
    assert artifacts(tmp_path)[1]['disposition'] == 'removed'


def test_interrupted_mkdir_preserves_uncertain_candidate(tmp_path, config_file, monkeypatch, guard):
    from ide_smoke import workspace
    monkeypatch.chdir(tmp_path)
    original = workspace.os.mkdir
    def interrupted(path, *args, **kwargs):
        result = original(path, *args, **kwargs)
        if kwargs.get('dir_fd') is not None:
            raise KeyboardInterrupt
        return result
    monkeypatch.setattr(workspace.os, 'supports_dir_fd', workspace.os.supports_dir_fd | {interrupted})
    monkeypatch.setattr(workspace.os, 'mkdir', interrupted)
    assert run_attempt('vscode', str(config_file), _guard_factory=lambda: guard) == 130
    data, manifest = artifacts(tmp_path)
    assert manifest['disposition'] == 'retained'
    assert manifest['reason'] == 'ownership_uncertain'
    assert manifest['initial_fixture_sha256'] is None
    assert Path(manifest['workspace_path']).is_dir()
    assert guard.released


def test_subsequent_runs_have_distinct_workspaces(tmp_path, config_file, monkeypatch, guard):
    monkeypatch.chdir(tmp_path)
    for _ in range(2):
        assert run_attempt('vscode', str(config_file), _guard_factory=lambda: guard) == 4
    reports = [json.loads(p.read_text()) for p in (tmp_path / 'reports').glob('*/summary.json')]
    assert len(reports) == 2
    assert reports[0]['workspace']['workspace_path'] != reports[1]['workspace']['workspace_path']
    assert all(r['workspace']['disposition'] == 'removed' for r in reports)


def test_lifecycle_events_have_controlled_resource_results(tmp_path, config_file, monkeypatch, guard):
    monkeypatch.chdir(tmp_path)
    assert run_attempt('vscode', str(config_file), _guard_factory=lambda: guard) == 4
    events = [json.loads(line) for p in (tmp_path / 'reports').glob('*/events.jsonl') for line in p.read_text().splitlines()]
    resources = [e for e in events if e['event'] in ('workspace_created', 'workspace_finalized')]
    assert [e['result']['reason'] for e in resources] == ['workspace_created', 'workspace_removed']
    assert all(e['test_id'] is None for e in resources)
    assert all(t['outcome'] == 'SKIP' for t in artifacts(tmp_path)[0]['tests'])
