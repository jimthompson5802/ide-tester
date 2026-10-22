"""Non-GUI checks of the qualified native worker and backend boundary."""
import json
from pathlib import Path
import sys
import time

import pytest


def test_metadata_worker_returns_validated_installed_version(tmp_path, monkeypatch):
    import plistlib
    from ide_smoke.platforms.macos.vscode_worker import _native_worker
    contents = tmp_path / 'Code.app' / 'Contents'
    executable = contents / 'MacOS' / 'Code'
    executable.parent.mkdir(parents=True)
    executable.write_bytes(b'\xcf\xfa\xed\xfe')
    executable.chmod(0o700)
    (contents / 'Resources' / 'app').mkdir(parents=True)
    (contents / 'Info.plist').write_bytes(plistlib.dumps({
        'CFBundleIdentifier': 'com.microsoft.VSCode', 'CFBundleExecutable': 'Code',
        'CFBundleShortVersionString': '1.135.0'}))
    (contents / 'Resources' / 'app' / 'product.json').write_text('{"version":"1.135.0"}')
    monkeypatch.setattr(sys, 'platform', 'darwin')
    assert _native_worker({'kind': 'metadata', 'executable': str(executable)}) == {
        'executable': str(executable), 'bundle_identifier': 'com.microsoft.VSCode',
        'version': '1.135.0'}


def test_controller_retains_attempted_workspace_and_same_deadline():
    from ide_smoke.adapters.vscode import VSCodeIDE, ProcessIdentity, Observation
    calls = []
    class Backend:
        def get_version(self, executable, *, deadline):
            calls.append(('version', deadline))
            return '1.135.0'
        def start(self, spec, deadline, claim):
            calls.append(('start', deadline))
            claim(ProcessIdentity(42, '100:2', spec.executable, spec.argv))
        def observe(self, identity, deadline):
            calls.append(('observe', deadline))
            return Observation()
        def close(self, identity, deadline):
            calls.append(('close', deadline))
    owner = VSCodeIDE(Path('/app'), Path('/profile'), _backend=Backend(), _clock=lambda: 1)
    assert owner.requires_workspace_retention is False
    assert owner.get_version(deadline=5) == '1.135.0'
    owner.launch(Path('/workspace'), deadline=5)
    owner.wait_ready(deadline=5)
    owner.close()
    owner.close()
    assert owner.requires_workspace_retention is True
    assert calls == [('version', 5), ('start', 5), ('observe', 5), ('close', 11)]


def test_native_backend_reads_metadata_without_spawning_application():
    from ide_smoke.platforms.macos.vscode_session import NativeBackend
    command = (sys.executable, '-c', 'import json,sys; r=json.load(sys.stdin); print(json.dumps({"executable":r["executable"],"bundle_identifier":"com.microsoft.VSCode","version":"1.135.0"}))')
    backend = NativeBackend(_worker_command=command)
    assert backend.get_version(Path('/app'), deadline=time.monotonic() + 5) == '1.135.0'
    assert backend.process is None


@pytest.mark.parametrize('profile', [Path('/' + 'a' * 81), Path('/' + 'é' * 41)])
def test_full_ipc_socket_path_byte_limit_blocks_before_spawn(profile):
    from ide_smoke.adapters.base import LifecycleError
    from ide_smoke.adapters.vscode import LaunchSpec
    from ide_smoke.platforms.macos.vscode_session import NativeBackend
    calls = []
    class Backend(NativeBackend):
        def _call(self, request, deadline):
            calls.append(request['kind'])
            if request['kind'] == 'metadata':
                return {'executable': request['executable'], 'bundle_identifier': 'com.microsoft.VSCode', 'version': '1.135.0'}
            return {'prerequisites_observed': True}
    backend = Backend(_spawn=lambda *args, **kwargs: pytest.fail('application must not spawn'))
    with pytest.raises(LifecycleError, match='unsupported_profile_path'):
        backend.start(LaunchSpec(Path('/app'), profile, Path('/workspace')), time.monotonic() + 10, lambda token: None)
    assert calls == ['metadata']


def test_worker_reply_limit_counts_encoded_bytes():
    from ide_smoke.adapters.base import LifecycleError
    from ide_smoke.platforms.macos.vscode_session import NativeBackend
    # Typed metadata JSON below 64K characters but above 64K UTF-8 bytes.
    command = (sys.executable, '-c', 'import json,sys; r=json.load(sys.stdin); print(json.dumps({"executable":r["executable"],"bundle_identifier":"com.microsoft.VSCode","version":"1.135.0"},ensure_ascii=False))')
    backend = NativeBackend(_worker_command=command)
    with pytest.raises(LifecycleError, match='ownership_uncertain'):
        backend.get_version(Path('/' + 'é' * 33000), deadline=time.monotonic() + 5)


def test_stalled_worker_has_bounded_control_return():
    from ide_smoke.adapters.base import LifecycleError
    from ide_smoke.platforms.macos.vscode_session import NativeBackend
    command = (sys.executable, '-c', 'import time; time.sleep(20)')
    backend = NativeBackend(_worker_command=command)
    started = time.monotonic()
    with pytest.raises(LifecycleError, match='native_timeout'):
        backend.get_version(Path('/app'), deadline=started + .15)
    assert time.monotonic() - started < 3


@pytest.mark.parametrize('version,product', [('', ''), ('1/2', '1/2'), ('é', 'é'), ('1'*65, '1'*65), ('1.135.0', '1.134.0'), (1, 1)])
def test_installed_version_requires_safe_matching_product_metadata(tmp_path, monkeypatch, version, product):
    import plistlib
    from ide_smoke.adapters.base import LifecycleError
    from ide_smoke.platforms.macos.vscode_worker import _native_worker
    contents = tmp_path / 'Code.app' / 'Contents'
    executable = contents / 'MacOS' / 'Code'
    executable.parent.mkdir(parents=True)
    executable.write_bytes(b'\xcf\xfa\xed\xfe')
    executable.chmod(0o700)
    (contents / 'Resources' / 'app').mkdir(parents=True)
    (contents / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'com.microsoft.VSCode', 'CFBundleExecutable': 'Code', 'CFBundleShortVersionString': version}))
    (contents / 'Resources' / 'app' / 'product.json').write_text(json.dumps({'version': product}))
    monkeypatch.setattr(sys, 'platform', 'darwin')
    with pytest.raises(LifecycleError, match='version_unavailable'):
        _native_worker({'kind': 'metadata', 'executable': str(executable)})


@pytest.mark.parametrize('reply', [
    {'executable': '/other', 'bundle_identifier': 'com.microsoft.VSCode', 'version': '1.135.0'},
    {'executable': '/app', 'bundle_identifier': 'com.microsoft.VSCode', 'version': 'SECRET/path'},
    {'error': 'profile_busy', 'private': 'SECRET'},
    {'error': 'unsupported_launcher', 'stage': 'PRIVATE'},
])
def test_worker_rejects_malformed_reply_without_native_text(reply):
    from ide_smoke.adapters.base import LifecycleError
    from ide_smoke.platforms.macos.vscode_session import NativeBackend
    command = (sys.executable, '-c', 'print(' + repr(json.dumps(reply)) + ')')
    backend = NativeBackend(_worker_command=command)
    with pytest.raises(LifecycleError, match='ownership_uncertain') as failure:
        backend.get_version(Path('/app'), deadline=time.monotonic() + 5)
    assert 'SECRET' not in str(failure.value)


def test_repeated_launch_cannot_replace_original_owner():
    from ide_smoke.adapters.base import LifecycleError
    from ide_smoke.adapters.vscode import VSCodeIDE, ProcessIdentity
    calls = []
    class Backend:
        def start(self, spec, deadline, claim):
            calls.append(spec.workspace)
            claim(ProcessIdentity(42, '1:2', spec.executable, spec.argv))
    owner = VSCodeIDE(Path('/app'), Path('/profile'), _backend=Backend(), _clock=lambda: 1)
    owner.launch(Path('/first'), deadline=5)
    with pytest.raises(LifecycleError, match='ownership_uncertain'):
        owner.launch(Path('/replacement'), deadline=5)
    assert calls == [Path('/first')]
    assert owner.spec.workspace == Path('/first')


def test_native_dispatch_on_unsupported_host_loads_no_frameworks(monkeypatch):
    from ide_smoke.adapters.base import LifecycleError
    from ide_smoke.platforms.macos.vscode_worker import _native_worker
    monkeypatch.setattr(sys, 'platform', 'linux')
    before = set(sys.modules)
    with pytest.raises(LifecycleError, match='native_prerequisite_missing'):
        _native_worker({'kind': 'metadata', 'executable': '/app'})
    assert not {'AppKit', 'ApplicationServices'} & (set(sys.modules) - before)


@pytest.mark.parametrize('profile,blocked', [(Path('/' + 'a' * 76), False), (Path('/' + 'a' * 77), True), (Path('/' + 'é' * 38), False), (Path('/' + 'é' * 38 + 'a'), True)])
def test_ipc_limit_accepts_102_bytes_and_rejects_103_bytes(profile, blocked):
    from ide_smoke.adapters.base import LifecycleError
    from ide_smoke.adapters.vscode import LaunchSpec
    from ide_smoke.platforms.macos.vscode_session import NativeBackend
    class SpawnReached(Exception):
        pass
    class Backend(NativeBackend):
        def _call(self, request, deadline):
            if request['kind'] == 'metadata':
                return {'executable': request['executable'], 'bundle_identifier': 'com.microsoft.VSCode', 'version': '1.135.0'}
            return {'prerequisites_observed': True}
    def spawn(*args, **kwargs):
        raise SpawnReached
    backend = Backend(_spawn=spawn)
    expected = LifecycleError if blocked else SpawnReached
    with pytest.raises(expected):
        backend.start(LaunchSpec(Path('/app'), profile, Path('/workspace')), time.monotonic() + 5, lambda token: None)


@pytest.mark.skipif(sys.platform != 'darwin', reason='owned synthetic kernel inspection only')
def test_preflight_refuses_missing_profile_flag_value(tmp_path):
    import subprocess
    process = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(20)', '--user-data-dir'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    code = '''
import json,sys,types
from ide_smoke.adapters.base import LifecycleError
from ide_smoke.platforms.macos.vscode_worker import _native_worker
request=json.load(sys.stdin)
app=types.SimpleNamespace(processIdentifier=lambda:request.pop('synthetic_pid'))
sys.modules['AppKit']=types.SimpleNamespace(
 NSWorkspace=types.SimpleNamespace(sharedWorkspace=lambda:types.SimpleNamespace(frontmostApplication=lambda:app)),
 NSRunningApplication=types.SimpleNamespace(runningApplicationsWithBundleIdentifier_=lambda name:[app]))
sys.modules['ApplicationServices']=types.SimpleNamespace(AXIsProcessTrusted=lambda:True)
try: result=_native_worker(request)
except LifecycleError as error: result={'error':error.reason.value}
print(json.dumps(result))
'''
    try:
        reply = subprocess.run([sys.executable, '-c', code], input=json.dumps({'kind': 'preflight', 'profile': str(tmp_path / 'profile'), 'synthetic_pid': process.pid}), text=True, capture_output=True, timeout=5)
        assert reply.returncode == 0, reply.stderr
        assert json.loads(reply.stdout) == {'error': 'ownership_uncertain'}
        assert process.poll() is None
    finally:
        process.terminate()
        process.wait(timeout=5)
