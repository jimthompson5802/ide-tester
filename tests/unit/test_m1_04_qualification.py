"""Non-GUI lifecycle tests; macOS-only cases inspect owned synthetic processes."""
import importlib.util
from pathlib import Path
import sys

import pytest

MODULE_PATH = Path(__file__).parents[2] / 'scripts/spikes/m1_04/qualify_lifecycle.py'


def load_probe():
    spec = importlib.util.spec_from_file_location('m1_04_qualification', MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_owned_launch_uses_exact_vector_and_shared_deadline():
    probe = load_probe()
    calls = []
    spec = probe.LaunchSpec(Path('/Applications/Visual Studio Code.app/Contents/MacOS/Electron'),
                            Path('/safe profile'), Path('/fresh workspace'))
    class Backend:
        def start(self, selected, deadline, claim):
            calls.append(('start', deadline))
            assert selected.argv == (str(spec.executable), '--user-data-dir', '/safe profile/user-data',
                                      '--extensions-dir', '/safe profile/extensions', '--new-window', '/fresh workspace')
            claim(probe.ProcessIdentity(42, 'birth-1', selected.executable, selected.argv))
        def observe(self, identity, deadline):
            calls.append(('observe', deadline))
            return probe.Observation()
        def close(self, identity, deadline):
            calls.append(('close', identity.pid))
    owner = probe.Lifecycle(Backend(), clock=lambda: 1.0)
    owner.launch(spec, 5.0)
    owner.wait_ready(5.0)
    owner.close()
    owner.close()
    assert calls == [('start', 5.0), ('observe', 5.0), ('close', 42)]
    assert owner.facts == ['launch_owned', 'workbench_ready', 'shutdown_confirmed']


@pytest.mark.parametrize('fault', ['spawn', 'partial', 'identity'])
def test_failed_launch_keeps_cleanup_authority_without_foreign_termination(fault):
    probe = load_probe()
    spec = probe.LaunchSpec(Path('/app/Electron'), Path('/profile'), Path('/workspace'))
    closed = []
    class Backend:
        def start(self, selected, deadline, claim):
            if fault == 'identity':
                claim(probe.ProcessIdentity(9, 'birth', Path('/foreign'), selected.argv))
            if fault == 'partial':
                claim(probe.ProcessIdentity(8, 'birth', selected.executable, selected.argv))
            raise OSError('PRIVATE_PROCESS_DATA')
        def close(self, identity, deadline):
            closed.append(identity.pid if identity else None)
    owner = probe.Lifecycle(Backend())
    with pytest.raises(probe.QualificationError) as error:
        owner.launch(spec, 999999999.0)
    assert error.value.reason == ('ownership_uncertain' if fault == 'identity' else 'launch_failed')
    assert 'PRIVATE' not in str(error.value)
    if fault == 'identity':
        with pytest.raises(probe.CleanupRefused):
            owner.close()
        assert closed == []
    else:
        owner.close()
        assert closed == ([8] if fault == 'partial' else [None])


@pytest.mark.parametrize('observation,reason', [
    ({'live': False}, 'early_exit'),
    ({'matching_windows': 0}, 'readiness_timeout'),
    ({'matching_windows': 2}, 'ownership_uncertain'),
    ({'workspace_matches': False}, 'ownership_uncertain'),
    ({'workspace_matches': False, 'matching_windows': 0, 'initializing': True}, 'readiness_timeout'),
    ({'workbench': False}, 'readiness_timeout'),
    ({'obstruction': 'modal'}, 'obstructed'),
    ({'obstruction': 'PRIVATE_DIALOG'}, 'unknown_dialog'),
])
def test_passive_readiness_requires_one_owned_unobstructed_workbench(observation, reason):
    probe = load_probe()
    now = [0.0]
    closed = []
    class Backend:
        def start(self, spec, deadline, claim):
            claim(probe.ProcessIdentity(42, 'birth', spec.executable, spec.argv))
        def observe(self, identity, deadline):
            return probe.Observation(**observation)
        def close(self, identity, deadline):
            closed.append(identity.pid)
    owner = probe.Lifecycle(Backend(), clock=lambda: now[0], sleep=lambda n: now.__setitem__(0, now[0] + n))
    owner.launch(probe.LaunchSpec(Path('/app'), Path('/profile'), Path('/workspace')), 0.1)
    with pytest.raises(probe.QualificationError) as error:
        owner.wait_ready(0.1)
    assert error.value.reason == reason
    assert 'PRIVATE' not in str(error.value)
    owner.close()
    assert closed == [42]
    assert 'workbench_ready' not in owner.facts


@pytest.mark.parametrize('fault', ['none', 'interrupt', 'shutdown'])
def test_probe_reuses_admission_guard_workspace_and_preserves_interrupt_limit(tmp_path, config_file, monkeypatch, guard, fault):
    import json
    probe = load_probe()
    monkeypatch.chdir(tmp_path)
    seen = []
    class Backend:
        def start(self, spec, deadline, claim):
            assert guard.owned
            assert (spec.workspace / 'example.py').is_file()
            claim(probe.ProcessIdentity(42, 'birth', spec.executable, spec.argv))
            seen.append(spec.workspace)
            if fault == 'interrupt':
                raise KeyboardInterrupt
        def observe(self, identity, deadline):
            return probe.Observation()
        def close(self, identity, deadline):
            assert guard.owned
            assert seen[0].is_dir()
            if fault == 'shutdown':
                raise probe.CleanupRefused
    result = probe.run_probe(str(config_file), backend_factory=lambda spec: Backend(), _guard_factory=lambda: guard)
    assert result.exit_code == (130 if fault == 'interrupt' else 4)
    summary = json.loads(next((tmp_path / 'reports').glob('*/summary.json')).read_text())
    qualification = json.loads(next((tmp_path / 'reports').glob('*/qualification.json')).read_text())
    assert qualification['attempts'] == result.facts
    assert qualification['cleanup'] == summary['cleanup']['outcome']
    assert qualification['workspace_disposition'] == summary['workspace']['disposition']
    assert 'PRIVATE' not in json.dumps(qualification)
    assert seen[0].exists() is (fault == 'shutdown')
    assert guard.released
    if fault == 'interrupt':
        assert result.facts[-1]['reason'] == 'interrupted'
        assert result.facts[-1]['duration_seconds'] >= 0
        assert summary['tests'][0]['outcome'] == 'SKIP'  # Existing production limitation.
        assert summary['tests'][0]['duration_seconds'] is None
    else:
        assert summary['tests'][0]['outcome'] == 'PASS'
        assert all(t['outcome'] == 'SKIP' for t in summary['tests'][1:])
    assert summary['cleanup']['outcome'] == ('HARNESS ERROR' if fault == 'shutdown' else 'PASS')


def test_launch_consumes_startup_budget_and_failed_close_can_be_recovered():
    probe = load_probe()
    now = [0.0]
    calls = []
    class Backend:
        def start(self, spec, deadline, claim):
            claim(probe.ProcessIdentity(42, 'birth', spec.executable, spec.argv))
            now[0] = 2.0
        def observe(self, identity, deadline):
            pytest.fail('launch consumed the full shared budget')
        def close(self, identity, deadline):
            calls.append(deadline)
            if len(calls) == 1:
                raise OSError('PRIVATE_FAILURE')
    owner = probe.Lifecycle(Backend(), clock=lambda: now[0])
    with pytest.raises(probe.QualificationError, match='readiness_timeout'):
        owner.launch(probe.LaunchSpec(Path('/app'), Path('/profile'), Path('/workspace')), 1.0)
    with pytest.raises(probe.CleanupRefused, match='shutdown_unconfirmed'):
        owner.close()
    owner.close()
    assert calls == [12.0, 12.0]
    assert owner.facts[-1] == 'shutdown_confirmed'


def test_native_wrapper_is_rejected_before_spawn_without_framework_imports(tmp_path):
    probe = load_probe()
    wrapper = tmp_path / 'code'
    wrapper.write_text('#!/bin/sh\nexit 99\n')
    wrapper.chmod(0o700)
    before = {name for name in sys.modules if name in {'AppKit', 'Quartz', 'ApplicationServices'}}
    owner = probe.Lifecycle(probe.NativeBackend())
    with pytest.raises(probe.QualificationError, match='unsupported_launcher'):
        owner.launch(probe.LaunchSpec(wrapper, tmp_path / 'profile', tmp_path / 'workspace'), probe.time.monotonic() + 1)
    owner.close()
    assert owner.identity is None
    assert {name for name in sys.modules if name in {'AppKit', 'Quartz', 'ApplicationServices'}} == before


def test_stalled_native_preflight_returns_before_deadline_without_spawning(tmp_path, monkeypatch):
    import plistlib
    import time
    probe = load_probe()
    monkeypatch.setattr(sys, 'platform', 'darwin')
    contents = tmp_path / 'Test Code.app' / 'Contents'
    executable = contents / 'MacOS' / 'Code'
    executable.parent.mkdir(parents=True)
    executable.write_bytes(b'\xcf\xfa\xed\xfe')
    executable.chmod(0o700)
    (contents / 'Info.plist').write_bytes(plistlib.dumps({
        'CFBundleIdentifier': 'com.microsoft.VSCode', 'CFBundleExecutable': 'Code'}))
    backend = probe.NativeBackend(_worker_command=(sys.executable, '-c', 'import time; time.sleep(30)'))
    owner = probe.Lifecycle(backend)
    started = time.monotonic()
    with pytest.raises(probe.QualificationError, match='native_timeout'):
        owner.launch(probe.LaunchSpec(executable, tmp_path / 'profile', tmp_path / 'workspace'), started + .15)
    owner.close()
    assert time.monotonic() - started < 1.5
    assert backend.process is None


def test_probe_command_requires_explicit_host_opt_in(tmp_path):
    import subprocess
    probe_path = Path(__file__).resolve().parents[2] / 'scripts/spikes/m1_04/qualify_lifecycle.py'
    before = set(tmp_path.iterdir())
    result = subprocess.run([sys.executable, str(probe_path)], cwd=tmp_path,
                            capture_output=True, text=True, timeout=5)
    assert result.returncode == 2
    assert 'explicit --host' in result.stdout
    assert set(tmp_path.iterdir()) == before


@pytest.mark.skipif(sys.platform != 'darwin', reason='qualifies the macOS process boundary without GUI')
def test_native_identity_preserves_exact_owned_arguments_and_birth():
    import json
    import subprocess
    probe_path = Path(__file__).resolve().parents[2] / 'scripts/spikes/m1_04/qualify_lifecycle.py'
    native_python = Path(sys.base_prefix) / 'Resources/Python.app/Contents/MacOS/Python'
    arguments = [str(native_python), '-c', 'import time; time.sleep(30)',
                 'profile with spaces', '', 'workspace-prefix', 'workspace']
    process = subprocess.Popen(arguments, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        request = json.dumps({'kind': 'identity', 'pid': process.pid})
        rows = []
        for _ in range(2):
            reply = subprocess.run([sys.executable, str(probe_path), '--_native-worker'],
                                   input=request, capture_output=True, text=True, timeout=5)
            assert reply.returncode == 0, reply.stderr
            rows.append(json.loads(reply.stdout))
        assert rows[0] == rows[1]
        assert rows[0]['pid'] == process.pid
        assert rows[0]['birth']
        assert rows[0]['argv'] == arguments
        assert Path(rows[0]['executable']).resolve() == native_python.resolve()
    finally:
        process.terminate()
        process.wait(timeout=5)


@pytest.mark.parametrize('scenario', ['normal', 'changed_identity', 'interrupt_spawn', 'malformed_exit', 'malformed_observation', 'registration_pending', 'registration_absent'])
def test_native_controller_owns_spawn_through_confirmed_shutdown(tmp_path, monkeypatch, scenario):
    import json
    import plistlib
    import time
    probe = load_probe()
    monkeypatch.setattr(sys, 'platform', 'darwin')
    contents = tmp_path / 'Test Code.app' / 'Contents'
    executable = contents / 'MacOS' / 'Code'
    executable.parent.mkdir(parents=True)
    executable.write_bytes(b'\xcf\xfa\xed\xfe')
    executable.chmod(0o700)
    (contents / 'Info.plist').write_bytes(plistlib.dumps({
        'CFBundleIdentifier': 'com.microsoft.VSCode', 'CFBundleExecutable': 'Code'}))
    spec = probe.LaunchSpec(executable, tmp_path / 'profile with spaces', tmp_path / 'workspace')
    commands = []
    class Process:
        pid = 4242
        def poll(self):
            return None
        def wait(self, timeout):
            commands.append('confirmed_exit')
            return 0
    def spawn(argv, **kwargs):
        commands.append(argv)
        if scenario == 'interrupt_spawn':
            import os
            import signal
            os.kill(os.getpid(), signal.SIGINT)
        return Process()
    responses = {
        'preflight': {'prerequisites_observed': True},
        'regular_snapshot': {'applications': [{'pid': 11, 'birth': '1:2', 'windows': [{'title_sha256': '0' * 64,
                             'position': [0, 0], 'size': [100, 100], 'minimized': False}]}]},
        'identity': {'pid': 4242, 'birth': '12:34', 'executable': str(executable), 'argv': list(spec.argv)},
        'observe': {'observation': {'live': True, 'matching_windows': 1, 'workspace_matches': True,
                                    'workbench': True, 'obstruction': None}, 'ledger': {'4242': '12:34'}},
        'terminate': {'ledger': {'4242': '12:34'}},
        'exited': {'exited': True, 'ledger': {'4242': '12:34'}}}
    if scenario == 'changed_identity':
        responses['identity']['argv'] = [str(executable), '--foreign-workspace']
    if scenario == 'malformed_exit':
        responses['exited']['exited'] = 'false'
    if scenario == 'malformed_observation':
        responses['observe']['observation'] = {'live': True}
    worker_code = 'import sys,json,pathlib; r=json.load(sys.stdin); result=' + repr(responses) + '[r["kind"]]\n'
    if scenario == 'registration_pending':
        worker_code += ('if r["kind"] in ("observe","terminate"):\n'
                        ' p=pathlib.Path(' + repr(str(tmp_path)) + ')/r["kind"]; count=int(p.read_text()) if p.exists() else 0; p.write_text(str(count+1))\n'
                        ' if count==0: result=' + repr({'observation': {'live': True, 'matching_windows': 0,
                        'workspace_matches': True, 'workbench': False, 'obstruction': None}, 'ledger': {'4242': '12:34'}})
                        + ' if r["kind"]=="observe" else ' + repr({'termination_pending': True, 'ledger': {'4242': '12:34'}}) + '\n')
    if scenario == 'registration_absent':
        worker_code += 'if r["kind"]=="terminate": result=' + repr({'termination_pending': True, 'ledger': {'4242': '12:34'}}) + '\n'
    worker_code += 'print(json.dumps(result))'
    worker = (sys.executable, '-c', worker_code)
    backend = probe.NativeBackend(_worker_command=worker, _spawn=spawn, _coexistence=True)
    owner = probe.Lifecycle(backend)
    if scenario == 'interrupt_spawn':
        with pytest.raises(KeyboardInterrupt):
            owner.launch(spec, time.monotonic() + 5)
        assert backend.process is not None
        owner.close()
        assert commands == [spec.argv, 'confirmed_exit']
        return
    if scenario == 'changed_identity':
        with pytest.raises(probe.QualificationError, match='ownership_uncertain'):
            owner.launch(spec, time.monotonic() + 5)
        with pytest.raises(probe.CleanupRefused):
            owner.close()
        assert commands == [spec.argv]
        assert owner.identity is None
        return
    owner.launch(spec, time.monotonic() + 5)
    if scenario == 'malformed_observation':
        with pytest.raises(probe.QualificationError, match='ownership_uncertain'):
            owner.wait_ready(time.monotonic() + 5)
        owner.close()
        assert 'workbench_ready' not in owner.facts
        return
    owner.wait_ready(time.monotonic() + 5)
    if scenario == 'registration_absent':
        owner.cleanup_seconds = .3
        started = time.monotonic()
        with pytest.raises(probe.CleanupRefused):
            owner.close()
        assert time.monotonic() - started < 1.5
        assert not owner.closed
        assert commands == [spec.argv]
        return
    if scenario == 'malformed_exit':
        with pytest.raises(probe.CleanupRefused):
            owner.close()
        assert commands == [spec.argv]
        assert not owner.closed
        return
    owner.close()
    assert commands == [spec.argv, 'confirmed_exit']
    assert owner.facts == ['launch_owned', 'workbench_ready', 'shutdown_confirmed']
    assert backend.coexistence == {'unrelated_windows': 1, 'unchanged': True}
    if scenario == 'registration_pending':
        assert (tmp_path / 'observe').read_text() == '2'
        assert (tmp_path / 'terminate').read_text() == '2'


@pytest.mark.skipif(sys.platform != 'darwin', reason='qualifies native descendants without GUI')
def test_native_exit_check_tracks_child_after_parent_exits():
    import json
    import os
    import signal
    import subprocess
    import time
    probe_path = Path(__file__).resolve().parents[2] / 'scripts/spikes/m1_04/qualify_lifecycle.py'
    native_python = Path(sys.base_prefix) / 'Resources/Python.app/Contents/MacOS/Python'
    # The test owns this synthetic process family; no IDE or other process is touched.
    program = ('import os,time; child=os.fork(); '
               'time.sleep(30) if child==0 else (print(child,flush=True),time.sleep(1))')
    parent = subprocess.Popen([str(native_python), '-c', program], start_new_session=True,
                              stdout=subprocess.PIPE, text=True, stderr=subprocess.DEVNULL)
    child = int(parent.stdout.readline())
    def inspect(request):
        reply = subprocess.run([sys.executable, str(probe_path), '--_native-worker'], input=json.dumps(request),
                               capture_output=True, text=True, timeout=5)
        assert reply.returncode == 0
        return json.loads(reply.stdout)
    try:
        identity = inspect({'kind': 'identity', 'pid': parent.pid})
        request = dict(identity, kind='exited', workspace='/synthetic', ledger={})
        first = inspect(request)
        assert first.get('exited') is False
        assert str(child) in first['ledger']
        parent.wait(timeout=5)
        request['ledger'] = first['ledger']
        after_reparenting = inspect(request)
        assert after_reparenting['exited'] is False
        assert after_reparenting['ledger'][str(child)] == first['ledger'][str(child)]
    finally:
        if parent.poll() is None:
            parent.terminate()
            parent.wait(timeout=5)
        os.kill(child, signal.SIGTERM)
        parent.stdout.close()


@pytest.mark.skipif(sys.platform != 'darwin', reason='native identity with synthetic AX; no GUI')
@pytest.mark.parametrize('modal', [False, True])
@pytest.mark.parametrize('date_state', ['present', 'missing', 'pending', 'generic_title', 'delayed_tree', 'mismatch', 'nan', 'wrong_birth', 'wrong_argv', 'wrong_executable', 'wrong_parent', 'wrong_session'])
def test_native_observer_and_graceful_shutdown_use_only_owned_application(tmp_path, modal, date_state):
    import json
    import subprocess
    probe_path = Path(__file__).resolve().parents[2] / 'scripts/spikes/m1_04/qualify_lifecycle.py'
    native_python = Path(sys.base_prefix) / 'Resources/Python.app/Contents/MacOS/Python'
    process = subprocess.Popen([str(native_python), '-c', 'import time; time.sleep(30)'],
                               start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # The fake AX/AppKit boundary performs no graphical operation. Only its
    # terminate method signals the synthetic child created by this test.
    worker = tmp_path / 'synthetic_native.py'
    worker.write_text('''import json,os,runpy,signal,sys,types,time
request=json.load(sys.stdin)
probe=runpy.run_path(sys.argv[1])
if request.get('synthetic_date_state') == 'wrong_parent': os.getppid=lambda:-1
if request.get('synthetic_date_state') == 'wrong_session':
    original_getsid=os.getsid
    os.getsid=lambda target:-1 if target==request['pid'] else original_getsid(target)
from pathlib import Path
activation=Path(request['synthetic_mutation_log']).with_suffix('.activation')
exposed=[float(activation.read_text()) if activation.exists() else None]
def mutation(name):
    if name=='AXManualAccessibility':
        exposed[0]=time.monotonic()
        activation.write_text(str(exposed[0]))
    with open(request['synthetic_mutation_log'],'a') as stream: stream.write(name+'\\n')
    return 0
class App:
    def isTerminated(self): return False
    def executableURL(self): return types.SimpleNamespace(path=lambda:request['executable'])
    def launchDate(self):
        if request.get('synthetic_date_state') == 'missing': return None
        sec,micro=map(int,request['birth'].split(':'))
        value=sec+micro/1000000
        if request.get('synthetic_date_state') == 'mismatch': value+=1
        if request.get('synthetic_date_state') == 'nan': value=float('nan')
        return types.SimpleNamespace(timeIntervalSince1970=lambda:value)
    def terminate(self):
        mutation('terminate')
        os.kill(request['pid'],signal.SIGTERM)
        return True
app=App()
sys.modules['AppKit']=types.SimpleNamespace(NSRunningApplication=types.SimpleNamespace(
    runningApplicationWithProcessIdentifier_=lambda pid:None if request.get('synthetic_date_state') == 'pending' else app))
nodes=[{'AXRole':'AXWebArea'}, {'AXRole':'AXOutline'}, {'AXRole':'AXToolbar'}]
if request.pop('synthetic_modal',False): nodes.append({'AXRole':'AXGroup','AXSubrole':'AXDialog'})
window={'AXTitle':'workspace — Visual Studio Code','AXRole':'AXWindow','AXChildren':nodes}
if request.get('synthetic_date_state') == 'generic_title': window['AXTitle']='Visual Studio Code'
application={'AXWindows':[window]}
def attribute(element,name):
    if request.get('synthetic_date_state') == 'delayed_tree' and element is window and name=='AXChildren':
        if exposed[0] is None or time.monotonic()-exposed[0]<.15: return (0,[])
    return (0,element[name]) if name in element else (-25205,None)
sys.modules['ApplicationServices']=types.SimpleNamespace(
    AXUIElementCreateApplication=lambda pid:application,
    AXUIElementSetMessagingTimeout=lambda element,seconds:0,
    AXUIElementSetAttributeValue=lambda element,name,value:mutation(name),
    AXUIElementCopyAttributeValue=lambda element,name,unused:attribute(element,name))
try: result=probe['_native_worker'](request)
except probe['QualificationError'] as error: result={'error':error.reason}
print(json.dumps(result))
''')
    def request_to(command, data):
        reply = subprocess.run(command, input=json.dumps(data), text=True, capture_output=True, timeout=5)
        assert reply.returncode == 0, reply.stderr
        return json.loads(reply.stdout)
    try:
        identity = request_to([sys.executable, str(probe_path), '--_native-worker'],
                              {'kind': 'identity', 'pid': process.pid})
        request = dict(identity, kind='observe', ledger={}, workspace='/synthetic/workspace',
                       synthetic_modal=modal, synthetic_date_state=date_state,
                       synthetic_mutation_log=str(tmp_path / 'mutation.log'))
        if date_state == 'wrong_birth':
            request['birth'] = '0:0'
        if date_state == 'wrong_argv':
            request['argv'] = [*request['argv'], '--foreign']
        if date_state == 'wrong_executable':
            request['executable'] = '/foreign'
        observation = request_to([sys.executable, str(worker), str(probe_path)], request)
        if date_state == 'delayed_tree':
            import time
            assert observation['observation']['workbench'] is False
            time.sleep(.2)
            request['enable_ax'] = False
            observation = request_to([sys.executable, str(worker), str(probe_path)], request)
            assert (tmp_path / 'mutation.log').read_text().splitlines() == ['AXManualAccessibility']
        if date_state == 'pending':
            assert observation['observation'] == {'live': True, 'matching_windows': 0,
                    'workspace_matches': True, 'workbench': False, 'obstruction': None}
            request['kind'] = 'terminate'
            pending = request_to([sys.executable, str(worker), str(probe_path)], request)
            assert pending.get('termination_pending') is True
            assert process.poll() is None
            assert not (tmp_path / 'mutation.log').exists()
            return
        if date_state == 'generic_title':
            assert observation['observation']['initializing'] is True
            assert observation['observation']['matching_windows'] == 0
            assert observation['observation']['workspace_matches'] is False
        elif date_state not in {'present', 'missing', 'delayed_tree'}:
            assert observation == {'error': 'ownership_uncertain'}
            request['kind'] = 'terminate'
            assert request_to([sys.executable, str(worker), str(probe_path)], request) == {'error': 'ownership_uncertain'}
            assert process.poll() is None
            assert not (tmp_path / 'mutation.log').exists()
            return
        assert observation.get('observation', {}).get('workbench') is True
        assert observation['observation']['obstruction'] == ('modal' if modal else None)
        request.update(kind='terminate', ledger=observation['ledger'])
        shutdown = request_to([sys.executable, str(worker), str(probe_path)], request)
        assert 'error' not in shutdown
        process.wait(timeout=5)
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=5)


def test_known_native_prerequisite_is_blocked_without_launch(tmp_path, config_file, guard, monkeypatch):
    probe = load_probe()
    monkeypatch.chdir(tmp_path)
    class Backend:
        def start(self, spec, deadline, claim):
            raise probe.QualificationError('native_prerequisite_missing')
        def close(self, identity, deadline):
            assert identity is None
    result = probe.run_probe(str(config_file), backend_factory=lambda spec: Backend(), _guard_factory=lambda: guard)
    assert result.exit_code == 3
    assert result.facts[0]['outcome'] == 'BLOCKED'
    assert result.facts[0]['reason'] == 'native_prerequisite_missing'


@pytest.mark.parametrize('stage,expected', [('ax_exposure', 'ax_exposure'), ('PRIVATE_NATIVE_CONTENT', None)])
def test_probe_records_only_allowlisted_native_failure_stage(tmp_path, config_file, guard, monkeypatch, stage, expected):
    probe = load_probe()
    monkeypatch.chdir(tmp_path)
    class Backend:
        window_facts = {'workspace_name_present': True, 'has_web_area': True, 'PRIVATE_NATIVE_CONTENT': True}
        def start(self, spec, deadline, claim):
            raise probe.QualificationError('ownership_uncertain', stage=stage)
        def close(self, identity, deadline):
            pass
    result = probe.run_probe(str(config_file), backend_factory=lambda spec: Backend(), _guard_factory=lambda: guard)
    assert result.facts[0]['stage'] == expected
    assert result.facts[0]['window_facts'] == {'workspace_name_present': True, 'has_web_area': True}
    assert 'PRIVATE' not in str(result.facts)


def test_scoped_recovery_reuses_owner_under_guard_and_keeps_retained_workspace(tmp_path, config_file, guard, monkeypatch):
    probe = load_probe()
    monkeypatch.chdir(tmp_path)
    calls = []
    workspace = []
    class Backend:
        def start(self, spec, deadline, claim):
            workspace.append(spec.workspace)
            claim(probe.ProcessIdentity(42, 'birth', spec.executable, spec.argv))
        def observe(self, identity, deadline):
            return probe.Observation()
        def close(self, identity, deadline):
            assert guard.owned
            calls.append(identity.pid)
            if len(calls) == 1:
                raise probe.CleanupRefused
    run = probe.run_probe(str(config_file), backend_factory=lambda spec: Backend(), _guard_factory=lambda: guard)
    assert run.exit_code == 4
    assert probe.recover_probe(run, _guard_factory=lambda: guard) == 'recovered'
    assert calls == [42, 42]
    assert workspace[0].is_dir()
    assert run.owner.closed
    assert guard.released


@pytest.mark.skipif(sys.platform != 'darwin', reason='native arguments with synthetic app inventory; no GUI')
@pytest.mark.parametrize('relative', [False, True])
def test_native_preflight_refuses_occupied_or_uncertain_profile(tmp_path, relative):
    import json
    import subprocess
    probe_path = Path(__file__).resolve().parents[2] / 'scripts/spikes/m1_04/qualify_lifecycle.py'
    native_python = Path(sys.base_prefix) / 'Resources/Python.app/Contents/MacOS/Python'
    profile = tmp_path / 'dedicated-profile'
    (profile / 'user-data').mkdir(parents=True)
    argument = 'relative-user-data' if relative else str(profile / 'user-data')
    process = subprocess.Popen([str(native_python), '-c', 'import time; time.sleep(30)', '--user-data-dir', argument],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    worker = tmp_path / 'synthetic_inventory.py'
    worker.write_text('''import json,runpy,sys,types
request=json.load(sys.stdin)
probe=runpy.run_path(sys.argv[1])
app=types.SimpleNamespace(processIdentifier=lambda:request.pop('synthetic_pid'))
sys.modules['AppKit']=types.SimpleNamespace(
 NSWorkspace=types.SimpleNamespace(sharedWorkspace=lambda:types.SimpleNamespace(frontmostApplication=lambda:app)),
 NSRunningApplication=types.SimpleNamespace(runningApplicationsWithBundleIdentifier_=lambda name:[app]))
sys.modules['ApplicationServices']=types.SimpleNamespace(AXIsProcessTrusted=lambda:True)
try: result=probe['_native_worker'](request)
except probe['QualificationError'] as error: result={'error':error.reason}
print(json.dumps(result))
''')
    try:
        reply = subprocess.run([sys.executable, str(worker), str(probe_path)],
                               input=json.dumps({'kind': 'preflight', 'profile': str(profile), 'synthetic_pid': process.pid}),
                               text=True, capture_output=True, timeout=5)
        assert reply.returncode == 0, reply.stderr
        assert json.loads(reply.stdout) == {'error': 'ownership_uncertain' if relative else 'profile_busy'}
        assert process.poll() is None
    finally:
        process.terminate()
        process.wait(timeout=5)


def test_controlled_spawn_failure_does_not_call_underlying_start():
    probe = load_probe()
    calls = []
    class Backend:
        def start(self, *args):
            pytest.fail('synthetic failure must occur before actual spawn')
        def close(self, identity, deadline):
            calls.append(identity)
    factory = probe.make_controlled_backend('spawn_failure', backend_factory=Backend)
    backend = factory(None)
    owner = probe.Lifecycle(backend)
    with pytest.raises(probe.QualificationError, match='launch_failed'):
        owner.launch(probe.LaunchSpec(Path('/app'), Path('/profile'), Path('/workspace')), probe.time.monotonic() + 1)
    owner.close()
    assert calls == [None]
    assert backend.scenario == 'spawn_failure'


@pytest.mark.parametrize('scenario,reason', [
    ('timeout', 'readiness_timeout'), ('early_exit', 'early_exit'),
    ('wrong_workspace', 'ownership_uncertain'), ('ambiguous', 'ownership_uncertain'),
    ('modal', 'obstructed'), ('interrupt', 'interrupted')])
def test_controlled_observations_keep_original_owner_for_cleanup(scenario, reason):
    probe = load_probe()
    now = [probe.time.monotonic()]
    deadline = now[0] + .1
    calls = []
    class Backend:
        process = 'original-owner'
        def start(self, spec, deadline, claim):
            calls.append('spawn')
            claim(probe.ProcessIdentity(42, 'birth', spec.executable, spec.argv))
        def observe(self, identity, deadline):
            if scenario == 'early_exit':
                calls.append('observed_before_controlled_exit')
                return probe.Observation()
            pytest.fail('controlled observation must be labeled synthetic')
        def close(self, identity, deadline):
            calls.append(('close', identity.pid))
    backend = probe.make_controlled_backend(scenario, backend_factory=Backend)(None)
    owner = probe.Lifecycle(backend, clock=lambda: now[0], sleep=lambda n: now.__setitem__(0, now[0] + n))
    expected = KeyboardInterrupt if scenario == 'interrupt' else probe.QualificationError
    with pytest.raises(expected) as error:
        owner.launch(probe.LaunchSpec(Path('/app'), Path('/profile'), Path('/workspace')), deadline)
        owner.wait_ready(deadline)
    if scenario != 'interrupt':
        assert error.value.reason == reason
    owner.close()
    assert calls == (['spawn', 'observed_before_controlled_exit', ('close', 42), ('close', 42)]
                     if scenario == 'early_exit' else ['spawn', ('close', 42)])
    assert backend.process == 'original-owner'
    assert backend.scenario == scenario


def test_controlled_shutdown_refusal_retains_workspace_until_same_owner_recovers(tmp_path, config_file, guard, monkeypatch):
    import json
    probe = load_probe()
    monkeypatch.chdir(tmp_path)
    calls = []
    class Backend:
        def start(self, spec, deadline, claim):
            claim(probe.ProcessIdentity(42, 'birth', spec.executable, spec.argv))
        def observe(self, identity, deadline):
            pytest.fail('shutdown scenario uses explicitly synthetic readiness')
        def close(self, identity, deadline):
            assert guard.owned
            calls.append(identity.pid)
    result = probe.run_probe(str(config_file), backend_factory=probe.make_controlled_backend('shutdown_refusal', backend_factory=Backend),
                             _guard_factory=lambda: guard)
    summary = json.loads(next((tmp_path / 'reports').glob('*/summary.json')).read_text())
    assert summary['tests'][0]['outcome'] == 'PASS'
    assert summary['cleanup']['outcome'] == 'HARNESS ERROR'
    assert result.facts[0]['scenario'] == 'shutdown_refusal'
    workspace = Path(summary['workspace']['workspace_path'])
    assert workspace.is_dir()
    assert calls == []
    assert probe.recover_probe(result, _guard_factory=lambda: guard) == 'recovered'
    assert calls == [42]
    assert workspace.is_dir()


def test_controlled_stalled_observer_is_bounded_and_restores_worker_before_cleanup():
    import time
    probe = load_probe()
    closed = []
    class Backend(probe.NativeBackend):
        def start(self, spec, deadline, claim):
            claim(probe.ProcessIdentity(42, 'birth', spec.executable, spec.argv))
        def close(self, identity, deadline):
            assert self._worker_command[-1] == '--_native-worker'
            assert self.CALL_SECONDS == 3.0
            closed.append(identity.pid)
    backend = probe.make_controlled_backend('stalled_observer', backend_factory=Backend)(None)
    owner = probe.Lifecycle(backend)
    started = time.monotonic()
    owner.launch(probe.LaunchSpec(Path('/app'), Path('/profile'), Path('/workspace')), started + 2)
    with pytest.raises(probe.QualificationError, match='native_timeout'):
        owner.wait_ready(started + 2)
    assert .20 < time.monotonic() - started < 1.5
    owner.close()
    assert closed == [42]


@pytest.mark.parametrize('state', ['not_started', 'shutdown_confirmed', 'shutdown_unconfirmed'])
def test_host_entry_reports_normal_cleanup_without_automatic_recovery(monkeypatch, capsys, state):
    import json
    from types import SimpleNamespace
    probe = load_probe()
    backend = SimpleNamespace(process=SimpleNamespace(pid=42), spec=SimpleNamespace(workspace=Path('/owned/workspace')),
                              identity=SimpleNamespace(birth='100:200'))
    owner = None if state == 'not_started' else SimpleNamespace(closed=state == 'shutdown_confirmed', backend=backend)
    result = probe.ProbeRun(4, owner, [{'reason': 'workbench_ready'}])
    calls = []
    def run(config, **kwargs):
        calls.append(config)
        return result
    monkeypatch.setattr(probe, 'run_probe', run)
    monkeypatch.setattr(probe, 'recover_probe', lambda *args, **kwargs: pytest.fail('automatic recovery is deferred'))
    monkeypatch.setattr(sys, 'argv', ['qualify_lifecycle.py', '--host', '--config', '/synthetic/config.yaml'])
    assert probe.main() == 4
    document = json.loads(capsys.readouterr().out)
    assert calls == ['/synthetic/config.yaml']
    assert document['cleanup'] == state
    assert 'recovery' not in document
    assert document['qualification'] == result.facts
    if state == 'shutdown_unconfirmed':
        assert document['owned_pid'] == 42
        assert document['owned_birth'] == '100:200'
        assert document['workspace'] == '/owned/workspace'
    else:
        assert not {'owned_pid', 'owned_birth', 'workspace'} & document.keys()


@pytest.mark.skipif(sys.platform != 'darwin', reason='kernel inventory with synthetic app registration; no GUI')
@pytest.mark.parametrize('argument_kind', ['exact', 'alias', 'relative'])
def test_native_preflight_finds_unregistered_selected_executable_profile_user(tmp_path, argument_kind):
    import json
    import subprocess
    profile = tmp_path / 'dedicated-profile'
    (profile / 'user-data').mkdir(parents=True)
    alias = tmp_path / 'profile-alias'
    alias.symlink_to(profile, target_is_directory=True)
    argument = {'exact': str(profile / 'user-data'), 'alias': str(alias / 'user-data'),
                'relative': 'uncertain-relative-profile'}[argument_kind]
    native_python = Path(sys.base_prefix) / 'Resources/Python.app/Contents/MacOS/Python'
    process = subprocess.Popen([str(native_python), '-c', 'import time; time.sleep(30)', '--user-data-dir', argument],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    worker = tmp_path / 'empty_registry.py'
    worker.write_text('''import json,runpy,sys,types
request=json.load(sys.stdin)
probe=runpy.run_path(sys.argv[1])
sys.modules['AppKit']=types.SimpleNamespace(
 NSWorkspace=types.SimpleNamespace(sharedWorkspace=lambda:types.SimpleNamespace(frontmostApplication=lambda:object())),
 NSRunningApplication=types.SimpleNamespace(runningApplicationsWithBundleIdentifier_=lambda name:[]))
sys.modules['ApplicationServices']=types.SimpleNamespace(AXIsProcessTrusted=lambda:True)
try: result=probe['_native_worker'](request)
except probe['QualificationError'] as error: result={'error':error.reason}
print(json.dumps(result))
''')
    try:
        reply = subprocess.run([sys.executable, str(worker), str(MODULE_PATH)],
                               input=json.dumps({'kind': 'preflight', 'profile': str(profile), 'executable': str(native_python)}),
                               text=True, capture_output=True, timeout=5)
        assert reply.returncode == 0, reply.stderr
        assert json.loads(reply.stdout) == {'error': 'ownership_uncertain' if argument_kind == 'relative' else 'profile_busy'}
        assert process.poll() is None
    finally:
        process.terminate()
        process.wait(timeout=5)


def test_controlled_early_exit_waits_for_native_launch_without_accessibility():
    probe = load_probe()
    calls = []
    class Backend(probe.NativeBackend):
        def start(self, spec, deadline, claim):
            claim(probe.ProcessIdentity(42, '1:2', spec.executable, spec.argv))
        def _request(self, kind, identity):
            return {'kind': kind}
        def _call(self, request, deadline):
            assert request['kind'] == 'application_state'
            calls.append(('state', deadline))
            return {'application_ready': len(calls) >= 2, 'ledger': {}}
        def close(self, identity, deadline):
            calls.append(('close', deadline))
    deadline = probe.time.monotonic() + 2
    owner = probe.Lifecycle(probe.make_controlled_backend('early_exit', backend_factory=Backend)(None))
    owner.launch(probe.LaunchSpec(Path('/app'), Path('/profile'), Path('/workspace')), deadline)
    with pytest.raises(probe.QualificationError, match='early_exit'):
        owner.wait_ready(deadline)
    assert calls == [('state', deadline), ('state', deadline), ('close', deadline)]
    owner.close()
