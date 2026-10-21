"""Opt-in provisional lifecycle qualification. Importing this file is inert.

Native operations belong behind Backend; ordinary unit runs use inert backends.
Backend calls must enforce their supplied monotonic deadlines independently of
native calls, and retain immediate spawn authority before identity inspection.
"""
from dataclasses import dataclass
from pathlib import Path
import time
from typing import Callable, Protocol

from ide_smoke.orchestrator import run_attempt
from ide_smoke.reporting import Reporter
from ide_smoke.results import Outcome, Reason, Result
from ide_smoke.workspace import configured_manager
from ide_smoke.guard import create_guard

WINDOW_FACTS = frozenset({'workspace_name_present', 'generic_title_only', 'restricted_mode_suffix',
                          'has_web_area', 'has_outline', 'has_toolbar', 'has_tab_group'})
CONTROLLED_SCENARIOS = frozenset({'spawn_failure', 'timeout', 'early_exit', 'wrong_workspace',
                                'ambiguous', 'modal', 'interrupt', 'shutdown_refusal', 'stalled_observer'})

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


class QualificationError(Exception):
    """Only fixed controlled reasons cross the probe boundary."""
    REASONS = frozenset({'launch_failed', 'readiness_timeout', 'early_exit',
                         'ownership_uncertain', 'profile_busy', 'unsupported_launcher',
                         'native_timeout', 'obstructed', 'unknown_dialog', 'native_prerequisite_missing'})

    STAGES = frozenset({'process_identity', 'application_identity', 'ax_exposure',
                        'ax_attribute', 'tree_traversal', 'window_association'})

    def __init__(self, reason, *, stage=None):
        self.reason = reason if reason in self.REASONS else 'ownership_uncertain'
        self.stage = stage if stage in self.STAGES else None
        super().__init__(self.reason)


class CleanupRefused(Exception):
    def __init__(self):
        super().__init__('shutdown_unconfirmed')


class Backend(Protocol):
    def start(self, spec: LaunchSpec, deadline: float,
              claim: Callable[[ProcessIdentity], None]) -> None: ...
    def observe(self, identity: ProcessIdentity, deadline: float) -> Observation: ...
    def close(self, identity: ProcessIdentity | None, deadline: float) -> None: ...


class Lifecycle:
    """One in-memory launch owner; close must be registered before launch."""
    def __init__(self, backend: Backend, *, clock=time.monotonic, sleep=time.sleep,
                 cleanup_seconds=10.0):
        self.backend = backend
        self.clock = clock
        self.sleep = sleep
        self.cleanup_seconds = cleanup_seconds
        self.identity = None
        self.facts = []
        self.started = False
        self.closed = False
        self.uncertain = False

    def launch(self, spec: LaunchSpec, deadline: float) -> None:
        self.started = True
        def claim(identity):
            if (identity.executable != spec.executable or identity.argv != spec.argv
                    or identity.pid <= 0 or not identity.birth or self.identity is not None):
                self.uncertain = True
                raise QualificationError('ownership_uncertain')
            self.identity = identity
            self.facts.append('launch_owned')
        try:
            self.backend.start(spec, deadline, claim)
            if self.clock() >= deadline:
                raise QualificationError('readiness_timeout')
        except QualificationError:
            raise
        except Exception:
            raise QualificationError('launch_failed') from None

    def wait_ready(self, deadline: float) -> None:
        if self.identity is None:
            raise QualificationError('ownership_uncertain')
        while self.clock() < deadline:
            try:
                observation = self.backend.observe(self.identity, deadline)
            except QualificationError:
                raise
            except Exception:
                raise QualificationError('ownership_uncertain') from None
            if self.clock() >= deadline:
                break
            if not observation.live:
                raise QualificationError('early_exit')
            if observation.matching_windows > 1 or (not observation.workspace_matches and not observation.initializing):
                raise QualificationError('ownership_uncertain', stage='window_association')
            if observation.obstruction is not None:
                raise QualificationError('obstructed' if observation.obstruction == 'modal' else 'unknown_dialog')
            if observation.matching_windows == 1 and observation.workbench and not observation.initializing:
                self.facts.append('workbench_ready')
                return
            self.sleep(min(0.05, max(0.0, deadline - self.clock())))
        raise QualificationError('readiness_timeout')

    def close(self) -> None:
        if self.closed or not self.started:
            return
        if self.uncertain:
            raise CleanupRefused
        try:
            self.backend.close(self.identity, self.clock() + self.cleanup_seconds)
        except Exception:
            raise CleanupRefused from None
        self.closed = True
        self.facts.append('shutdown_confirmed')


@dataclass
class ProbeRun:
    exit_code: int
    owner: Lifecycle | None
    facts: list[dict]


def run_probe(config_path, *, backend_factory, _guard_factory=None,
              _workspace_factory=configured_manager, _reporter_factory=Reporter,
              clock=time.monotonic) -> ProbeRun:
    """Qualify T01 through real admission; default production reporting stays intact.

    Returned facts are separate qualification evidence, including the Phase 1
    interruption observation which current production summaries cannot retain.
    The owner remains in memory for scoped recovery after cleanup refusal.
    """
    selected = None
    owner = None
    facts = []

    class QualificationReporter:
        def __init__(self, root):
            self.base = _reporter_factory(root)

        def __getattr__(self, name):
            return getattr(self.base, name)

        def finalize(self, snapshot):
            import json
            # This separate provisional artifact never changes production
            # results or serializes native handles, titles or exception text.
            document = {'attempts': facts, 'lifecycle': owner.facts if owner else [],
                        'cleanup': snapshot['cleanup']['outcome'],
                        'workspace_disposition': snapshot['workspace']['disposition'],
                        'coexistence': getattr(owner.backend, 'coexistence', None) if owner else None}
            (self.base.directory / 'qualification.json').write_text(json.dumps(document, indent=2) + '\n')
            self.base.finalize(snapshot)

    def workspace_factory(config, executable, **kwargs):
        nonlocal selected
        selected = executable
        return _workspace_factory(config, executable, **kwargs)

    def t01(context, timeout):
        nonlocal owner
        spec = LaunchSpec(selected, context.config.profile_root, context.workspace_path)
        owner = Lifecycle(backend_factory(spec), clock=clock)
        context.register_cleanup(owner.close)
        started = clock()
        reason = 'workbench_ready'
        outcome = 'PASS'
        failure_stage = None
        try:
            deadline = started + timeout
            owner.launch(spec, deadline)
            owner.wait_ready(deadline)
            return Result(Outcome.PASS, Reason.PASSED)
        except KeyboardInterrupt:
            reason, outcome = 'interrupted', 'HARNESS ERROR'
            raise
        except QualificationError as error:
            reason = error.reason
            failure_stage = error.stage
            blocked = reason in {'profile_busy', 'native_prerequisite_missing'}
            outcome = 'BLOCKED' if blocked else 'HARNESS ERROR'
            return Result(Outcome.BLOCKED if blocked else Outcome.ERROR,
                          Reason.PREREQUISITE if blocked else
                          Reason.TIMEOUT if reason in {'readiness_timeout', 'native_timeout'} else Reason.UNEXPECTED)
        finally:
            window_facts = getattr(owner.backend, 'window_facts', {})
            safe_window_facts = {key: value for key, value in window_facts.items()
                                 if key in WINDOW_FACTS and type(value) is bool}
            scenario = getattr(owner.backend, 'scenario', 'normal')
            facts.append({'reason': reason, 'outcome': outcome, 'stage': failure_stage,
                          'scenario': scenario if scenario in CONTROLLED_SCENARIOS else 'normal',
                          'window_facts': safe_window_facts,
                          'duration_seconds': clock() - started})

    code = run_attempt('vscode', config_path, _operations={'T01': t01},
                       _guard_factory=_guard_factory, _workspace_factory=workspace_factory,
                       _reporter_factory=QualificationReporter)
    return ProbeRun(code, owner, facts)


def recover_probe(run, *, _guard_factory=create_guard):
    """Experimental helper for inert tests; host recovery is deferred/unqualified.

    Never delete retained data. The host entry does not invoke this helper.
    """
    if run.owner is None or run.owner.closed:
        return 'unnecessary'
    guard = _guard_factory()
    acquired = False
    try:
        guard.acquire()
        acquired = True
        run.owner.close()
        return 'recovered'
    except (Exception, KeyboardInterrupt):
        return 'shutdown_unconfirmed'
    finally:
        if acquired:
            guard.release()


class NativeBackend:
    """Provisional macOS backend. Only the controller spawns the IDE.

    All native inspection/messaging runs in a disposable bounded worker. A
    worker timeout never kills the IDE or loses the controller's Popen handle.
    """
    CALL_SECONDS = 3.0

    def __init__(self, *, _worker_command=None, _spawn=None, _coexistence=False):
        import sys
        import subprocess
        self._spawn = _spawn or subprocess.Popen
        self._worker_command = _worker_command or (sys.executable, str(Path(__file__).resolve()), '--_native-worker')
        self.process = None
        self.spec = None
        self.identity = None
        self.ledger = {}
        self.window_facts = {}
        self.accessibility_exposed = False
        self._coexistence = _coexistence
        self.regular_before = None
        self.coexistence = None
        self.snapshot_salt = __import__('os').urandom(32).hex()

    def regular_snapshot(self, deadline):
        return self._call({'kind': 'regular_snapshot', 'salt': self.snapshot_salt,
                           'exclude_pid': self.process.pid if self.process else None}, deadline)['applications']

    def _call(self, request, deadline):
        import json
        import subprocess
        seconds = min(self.CALL_SECONDS, deadline - time.monotonic())
        if seconds <= 0:
            raise QualificationError('native_timeout')
        try:
            reply = subprocess.run(self._worker_command, input=json.dumps(request),
                                   capture_output=True, text=True, timeout=seconds)
            if reply.returncode or len(reply.stdout) > 65536:
                raise QualificationError('ownership_uncertain')
            result = json.loads(reply.stdout)
            if not isinstance(result, dict):
                raise QualificationError('ownership_uncertain')
            if result.get('error'):
                raise QualificationError(result['error'], stage=result.get('stage'))
            self._validate_reply(request, result)
            return result
        except subprocess.TimeoutExpired:
            raise QualificationError('native_timeout') from None
        except QualificationError:
            raise
        except Exception:
            raise QualificationError('ownership_uncertain') from None

    @staticmethod
    def _validate_reply(request, result):
        import re
        def valid_birth(value):
            return isinstance(value, str) and re.fullmatch(r'[0-9]+:[0-9]+', value) is not None
        def valid_ledger(value):
            return (isinstance(value, dict) and all(isinstance(pid, str) and pid.isdecimal()
                    and int(pid) > 0 and valid_birth(birth) for pid, birth in value.items()))
        kind = request['kind']
        valid = False
        if kind == 'identity':
            valid = (result.keys() == {'pid', 'birth', 'executable', 'argv'}
                     and type(result['pid']) is int and result['pid'] == request['pid']
                     and valid_birth(result['birth']) and isinstance(result['executable'], str)
                     and Path(result['executable']).is_absolute() and '\x00' not in result['executable']
                     and isinstance(result['argv'], list) and bool(result['argv'])
                     and all(isinstance(arg, str) and '\x00' not in arg for arg in result['argv']))
        elif kind == 'preflight':
            valid = result == {'prerequisites_observed': True} and type(result.get('prerequisites_observed')) is bool
        elif kind == 'regular_snapshot':
            applications = result.get('applications')
            valid = result.keys() == {'applications'} and isinstance(applications, list)
            if valid:
                for app in applications:
                    if (not isinstance(app, dict) or app.keys() != {'pid', 'birth', 'windows'}
                            or type(app['pid']) is not int or not valid_birth(app['birth']) or not isinstance(app['windows'], list)):
                        valid = False
                        break
                    for window in app['windows']:
                        if (not isinstance(window, dict) or window.keys() != {'title_sha256', 'position', 'size', 'minimized'}
                                or not isinstance(window['title_sha256'], str) or re.fullmatch('[0-9a-f]{64}', window['title_sha256']) is None
                                or type(window['minimized']) is not bool
                                or any(not isinstance(window[key], list) or len(window[key]) != 2
                                       or any(type(v) not in (int, float) for v in window[key]) for key in ('position', 'size'))):
                            valid = False
                            break
        elif kind in ('terminate', 'exited', 'snapshot', 'observe', 'application_state'):
            valid = valid_ledger(result.get('ledger'))
            if kind == 'application_state':
                valid = valid and result.keys() == {'application_ready', 'ledger'} and type(result.get('application_ready')) is bool
            elif kind in ('exited', 'snapshot'):
                valid = valid and result.keys() == {'exited', 'ledger'} and type(result.get('exited')) is bool
            elif kind == 'terminate':
                valid = valid and (result.keys() == {'ledger'} or
                        (result.keys() == {'ledger', 'termination_pending'}
                         and type(result['termination_pending']) is bool and result['termination_pending']))
            else:
                observation = result.get('observation')
                window_facts = result.get('window_facts', {})
                valid = (valid and not result.keys() - {'observation', 'ledger', 'window_facts', 'accessibility_exposed'}
                         and type(result.get('accessibility_exposed', False)) is bool
                         and isinstance(observation, dict) and isinstance(window_facts, dict)
                         and not window_facts.keys() - WINDOW_FACTS
                         and all(type(value) is bool for value in window_facts.values()))
                if valid:
                    valid = (not observation.keys() - {'live', 'matching_windows', 'workspace_matches', 'workbench', 'obstruction', 'initializing'}
                             and (not observation.get('live') or observation.keys() >= {'live', 'matching_windows', 'workspace_matches', 'workbench', 'obstruction'})
                             and type(observation.get('live')) is bool
                             and all(type(observation[key]) is bool for key in ('workspace_matches', 'workbench', 'initializing') if key in observation)
                             and (type(observation.get('matching_windows', 0)) is int and observation.get('matching_windows', 0) >= 0)
                             and observation.get('obstruction') in (None, 'modal', 'unknown_dialog'))
        if not valid:
            raise QualificationError('ownership_uncertain')

    def start(self, spec, deadline, claim):
        import os
        import plistlib
        import subprocess
        import sys
        self.spec = spec
        # No wrapper substitution, shell, or native import during validation.
        executable = spec.executable
        try:
            contents = executable.parent.parent
            metadata = plistlib.loads((contents / 'Info.plist').read_bytes())
            if (sys.platform != 'darwin' or executable.parent.name != 'MacOS'
                    or contents.name != 'Contents' or contents.parent.suffix.casefold() != '.app'
                    or metadata['CFBundleIdentifier'] != 'com.microsoft.VSCode'
                    or metadata['CFBundleExecutable'] != executable.name
                    or executable.is_symlink() or not os.access(executable, os.X_OK)):
                raise ValueError
            with executable.open('rb') as source:
                if source.read(4) not in (b'\xcf\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
                    raise ValueError
        except Exception:
            raise QualificationError('unsupported_launcher') from None
        self._call({'kind': 'preflight', 'executable': str(executable),
                    'profile': str(spec.profile_root)}, deadline)
        if self._coexistence:
            self.regular_before = self.regular_snapshot(deadline)
            if not any(app['windows'] for app in self.regular_before):
                raise QualificationError('native_prerequisite_missing')
        if time.monotonic() >= deadline:
            raise QualificationError('readiness_timeout')
        # Store the raw owner immediately, including partial-initialization paths.
        import signal
        pending = []
        previous = signal.getsignal(signal.SIGINT)
        signal.signal(signal.SIGINT, lambda number, frame: pending.append((number, frame)))
        try:
            self.process = self._spawn(spec.argv, stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL, start_new_session=True)
        finally:
            signal.signal(signal.SIGINT, previous)
        if pending:
            if callable(previous):
                previous(*pending[0])
            elif previous != signal.SIG_IGN:
                raise KeyboardInterrupt
        request = {'kind': 'identity', 'pid': self.process.pid}
        token = self._call(request, deadline)
        self.identity = ProcessIdentity(token['pid'], token['birth'], Path(token['executable']), tuple(token['argv']))
        if self.identity.executable != spec.executable or self.identity.argv != spec.argv:
            raise QualificationError('ownership_uncertain')
        claim(self.identity)

    def _request(self, kind, identity):
        request = {'kind': kind, 'pid': identity.pid, 'birth': identity.birth,
                'executable': str(identity.executable), 'argv': list(identity.argv),
                'workspace': str(self.spec.workspace), 'ledger': self.ledger}
        if kind == 'observe':
            request['enable_ax'] = not self.accessibility_exposed
        return request

    def observe(self, identity, deadline):
        result = self._call(self._request('observe', identity), deadline)
        self.ledger.update(result.get('ledger', {}))
        self.window_facts = result.get('window_facts', {})
        self.accessibility_exposed = self.accessibility_exposed or result.get('accessibility_exposed', False)
        return Observation(**result['observation'])

    def close(self, identity, deadline):
        if self.process is None:
            return
        identity = identity or self.identity
        try:
            if identity is not None and (identity.pid != self.process.pid
                    or identity.executable != self.spec.executable or identity.argv != self.spec.argv):
                raise CleanupRefused
            if identity is None:
                if self.process.poll() is not None:
                    # Descendant absence has not been established.
                    raise CleanupRefused
                token = self._call({'kind': 'identity', 'pid': self.process.pid}, deadline)
                identity = ProcessIdentity(token['pid'], token['birth'], Path(token['executable']), tuple(token['argv']))
                if identity.executable != self.spec.executable or identity.argv != self.spec.argv:
                    raise CleanupRefused
                self.identity = identity
            while True:
                result = self._call(self._request('terminate', identity), deadline)
                self.ledger.update(result['ledger'])
                if not result.get('termination_pending'):
                    break
                time.sleep(min(.05, max(0, deadline - time.monotonic())))
            while time.monotonic() < deadline:
                result = self._call(self._request('exited', identity), deadline)
                self.ledger.update(result.get('ledger', {}))
                if result['exited']:
                    self.process.wait(timeout=max(.01, deadline - time.monotonic()))
                    if self._coexistence:
                        after = self.regular_snapshot(deadline)
                        self.coexistence = {'unrelated_windows': sum(len(app['windows']) for app in self.regular_before),
                                            'unchanged': after == self.regular_before}
                        if not self.coexistence['unchanged']:
                            raise CleanupRefused
                    return
                time.sleep(min(.05, max(0, deadline - time.monotonic())))
        except Exception:
            raise CleanupRefused from None
        raise CleanupRefused


def _native_worker(request):
    """Native data stays inside this worker; never return raw titles or argv of foreign processes."""
    import ctypes as C
    import os
    import struct
    import sys
    if sys.platform != 'darwin':
        raise QualificationError('ownership_uncertain')
    lib = C.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    libc = C.CDLL(None, use_errno=True)

    class BSD(C.Structure):
        _fields_ = [(name, C.c_uint32) for name in (
            'flags', 'status', 'xstatus', 'pid', 'ppid', 'uid', 'gid', 'ruid', 'rgid', 'svuid', 'svgid', 'rfu')]
        _fields_ += [('comm', C.c_char * 16), ('name', C.c_char * 32)]
        _fields_ += [(name, C.c_uint32) for name in ('nfiles', 'pgid', 'pjobc', 'tdev', 'tpgid')]
        _fields_ += [('nice', C.c_int32), ('sec', C.c_uint64), ('usec', C.c_uint64)]

    lib.proc_pidinfo.argtypes = [C.c_int, C.c_int, C.c_uint64, C.c_void_p, C.c_int]
    lib.proc_pidinfo.restype = C.c_int
    lib.proc_pidpath.argtypes = [C.c_int, C.c_void_p, C.c_uint32]
    lib.proc_pidpath.restype = C.c_int
    lib.proc_listpids.argtypes = [C.c_uint32, C.c_uint32, C.c_void_p, C.c_int]
    lib.proc_listpids.restype = C.c_int
    libc.sysctl.argtypes = [C.POINTER(C.c_int), C.c_uint, C.c_void_p, C.POINTER(C.c_size_t), C.c_void_p, C.c_size_t]
    libc.sysctl.restype = C.c_int
    if C.sizeof(BSD) != 136 or BSD.sec.offset != 120 or BSD.usec.offset != 128:
        raise QualificationError('ownership_uncertain')

    def info(pid):
        row = BSD()
        size = lib.proc_pidinfo(pid, 3, 0, C.byref(row), C.sizeof(row))
        if not size:
            if C.get_errno() == 3:  # ESRCH; no process, never adopt a replacement.
                return None
            raise QualificationError('ownership_uncertain')
        if size != C.sizeof(row) or row.pid != pid:
            raise QualificationError('ownership_uncertain')
        return row

    def birth(row):
        return f'{row.sec}:{row.usec}'

    def path(pid):
        buffer = C.create_string_buffer(4096)
        if lib.proc_pidpath(pid, buffer, len(buffer)) <= 0:
            raise QualificationError('ownership_uncertain')
        return os.fsdecode(buffer.value)

    def argv(pid):
        # KERN_PROCARGS2: argc followed by executable/padding then argc strings.
        # Stop after argv; never decode or return the environment tail.
        mib = (C.c_int * 3)(1, 49, pid)
        buffer = C.create_string_buffer(1024 * 1024)
        length = C.c_size_t(len(buffer))
        if libc.sysctl(mib, 3, buffer, C.byref(length), None, 0) != 0:
            raise QualificationError('ownership_uncertain')
        raw = buffer.raw[:length.value]
        count = struct.unpack_from('i', raw)[0]
        if not 0 < count < 4096:
            raise QualificationError('ownership_uncertain')
        offset = raw.index(b'\0', 4) + 1
        while offset < len(raw) and raw[offset] == 0:
            offset += 1
        result = []
        for _ in range(count):
            end = raw.index(b'\0', offset)
            result.append(os.fsdecode(raw[offset:end]))
            offset = end + 1
        return result

    def token(pid):
        first = info(pid)
        if first is None:
            raise QualificationError('early_exit')
        executable, arguments = path(pid), argv(pid)
        last = info(pid)
        if last is None or birth(first) != birth(last):
            raise QualificationError('ownership_uncertain')
        return {'pid': pid, 'birth': birth(first), 'executable': executable, 'argv': arguments}

    kind = request['kind']
    if kind not in {'identity', 'preflight', 'regular_snapshot', 'snapshot', 'exited', 'observe', 'terminate', 'application_state'}:
        raise QualificationError('ownership_uncertain')
    if kind == 'identity':
        return token(request['pid'])

    if kind in ('preflight', 'regular_snapshot'):
        import AppKit
        import ApplicationServices as AX
    if kind == 'regular_snapshot':
        import hashlib
        def attr(element, name):
            error, value = AX.AXUIElementCopyAttributeValue(element, name, None)
            if error:
                raise QualificationError('ownership_uncertain')
            return value
        snapshots = []
        for app in AppKit.NSRunningApplication.runningApplicationsWithBundleIdentifier_('com.microsoft.VSCode'):
            pid = app.processIdentifier()
            if pid == request['exclude_pid']:
                continue
            before = info(pid)
            application = AX.AXUIElementCreateApplication(pid)
            AX.AXUIElementSetMessagingTimeout(application, .2)
            rows = []
            for window in list(attr(application, 'AXWindows') or []):
                position_ok, position = AX.AXValueGetValue(attr(window, 'AXPosition'), AX.kAXValueCGPointType, None)
                size_ok, size = AX.AXValueGetValue(attr(window, 'AXSize'), AX.kAXValueCGSizeType, None)
                if not position_ok or not size_ok:
                    raise QualificationError('ownership_uncertain')
                rows.append({'title_sha256': hashlib.sha256((request['salt'] + str(attr(window, 'AXTitle'))).encode()).hexdigest(),
                             'position': [position.x, position.y], 'size': [size.width, size.height],
                             'minimized': bool(attr(window, 'AXMinimized'))})
            after = info(pid)
            if before is None or after is None or birth(before) != birth(after):
                raise QualificationError('ownership_uncertain')
            snapshots.append({'pid': pid, 'birth': birth(before), 'windows': sorted(rows, key=lambda row: row['title_sha256'])})
        return {'applications': sorted(snapshots, key=lambda app: app['pid'])}
    if kind == 'preflight':
        if not AX.AXIsProcessTrusted() or AppKit.NSWorkspace.sharedWorkspace().frontmostApplication() is None:
            raise QualificationError('native_prerequisite_missing')
        candidates_pids = {app.processIdentifier() for app in
                           AppKit.NSRunningApplication.runningApplicationsWithBundleIdentifier_('com.microsoft.VSCode')}
        supplemental_births = {}
        if request.get('executable'):
            # PROC_UID_ONLY=4, qualified against local SDK sys/proc_info.h.
            # Direct launches need not appear in AppKit's application registry.
            # Inspect argv only after the same-user executable matches selection.
            needed = lib.proc_listpids(4, os.getuid(), None, 0)
            if needed <= 0 or needed > 4 * 1024 * 1024:
                raise QualificationError('ownership_uncertain')
            pids = (C.c_int * (needed // 4 + 256))()
            actual = lib.proc_listpids(4, os.getuid(), pids, C.sizeof(pids))
            if actual <= 0 or actual >= C.sizeof(pids) or actual % 4:
                raise QualificationError('ownership_uncertain')
            selected = Path(request['executable'])
            for candidate in pids[:actual // 4]:
                if candidate <= 0 or candidate in candidates_pids:
                    continue
                before = info(candidate)
                if before is None or before.status == 5:
                    continue
                if before.uid != os.getuid():
                    raise QualificationError('ownership_uncertain')
                executable = Path(path(candidate))
                matches = (executable.resolve() == selected.resolve()
                           or (executable.exists() and executable.samefile(selected)))
                after = info(candidate)
                if after is None or birth(before) != birth(after):
                    raise QualificationError('ownership_uncertain')
                if matches:
                    candidates_pids.add(candidate)
                    supplemental_births[candidate] = birth(before)
        for candidate in candidates_pids:
            current = token(candidate)
            if candidate in supplemental_births:
                current_executable = Path(current['executable'])
                if (current['birth'] != supplemental_births[candidate]
                        or not (current_executable.resolve() == selected.resolve()
                                or (current_executable.exists() and current_executable.samefile(selected)))):
                    raise QualificationError('ownership_uncertain')
            arguments = current['argv']
            profile = str(Path(request['profile']) / 'user-data')
            candidates = [value.partition('=')[2] for value in arguments if value.startswith('--user-data-dir=')]
            candidates += [arguments[index + 1] for index, value in enumerate(arguments[:-1]) if value == '--user-data-dir']
            if any(not value or not Path(value).is_absolute() for value in candidates):
                raise QualificationError('ownership_uncertain')
            if any(Path(value).resolve() == Path(profile).resolve() or
                   (Path(value).exists() and Path(value).samefile(profile)) for value in candidates):
                raise QualificationError('profile_busy')
        return {'prerequisites_observed': True}

    pid = request['pid']
    main = info(pid)
    if main is not None and birth(main) != request['birth']:
        raise QualificationError('ownership_uncertain')
    if main is not None and main.status != 5:
        current = token(pid)
        if current['executable'] != request['executable'] or current['argv'] != request['argv']:
            raise QualificationError('ownership_uncertain')

    # Session membership supplements a birth-qualified descendant ledger. Never
    # signal a process group or independently terminate a helper.
    needed = lib.proc_listpids(1, 0, None, 0)
    if needed <= 0 or needed > 4 * 1024 * 1024:
        raise QualificationError('ownership_uncertain')
    pids = (C.c_int * (needed // 4 + 256))()
    actual = lib.proc_listpids(1, 0, pids, C.sizeof(pids))
    if actual <= 0 or actual >= C.sizeof(pids):
        raise QualificationError('ownership_uncertain')
    ledger = dict(request.get('ledger', {}))
    live = []
    for child in pids[:actual // 4]:
        if child <= 0:
            continue
        try:
            same_session = os.getsid(child) == pid
        except ProcessLookupError:
            continue
        except PermissionError:
            same_session = False
        known = str(child) in ledger
        if not same_session and not known:
            continue
        row = info(child)
        if row is None:
            continue
        if known and ledger[str(child)] != birth(row):
            # A replacement in our session may still use the workspace. Never
            # silently drop it from the completion check or adopt it for killing.
            if same_session:
                raise QualificationError('ownership_uncertain')
            continue
        ledger[str(child)] = birth(row)
        if row.status != 5:
            live.append(child)
    for known_pid, known_birth in ledger.items():
        row = info(int(known_pid))
        if row is not None and birth(row) == known_birth and row.status != 5 and int(known_pid) not in live:
            live.append(int(known_pid))
    if kind in ('snapshot', 'exited'):
        # Pure native process inspection: synthetic lifecycle tests need no
        # AppKit, GUI session, Accessibility trust, or graphical application.
        return {'exited': not live and (main is None or main.status == 5), 'ledger': ledger}
    if main is None or main.status == 5:
        if kind == 'application_state':
            return {'application_ready': False, 'ledger': ledger}
        if kind == 'terminate':
            return {'ledger': ledger}
        return {'observation': {'live': False}, 'ledger': ledger}

    import AppKit
    import ApplicationServices as AX

    def owned_app():
        # Run after the process scan and again immediately before any mutation.
        # No PID-only/native-path-only authority survives an intervening scan.
        current = token(pid)
        if (current['birth'] != request['birth']
                or current['executable'] != request['executable']
                or current['argv'] != request['argv']):
            raise QualificationError('ownership_uncertain', stage='application_identity')
        owner = info(pid)
        if (owner is None or owner.ppid != os.getppid()
                or os.getsid(pid) != pid):
            # Only this worker's live controller may mutate the child it
            # directly spawned. Serialized tokens never grant cleanup power.
            raise QualificationError('ownership_uncertain', stage='application_identity')
        app = AppKit.NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)
        if app is not None:
            if (app.isTerminated() or app.executableURL() is None
                    or str(app.executableURL().path()) != request['executable']):
                raise QualificationError('ownership_uncertain', stage='application_identity')
            seconds, micros = (int(part) for part in request['birth'].split(':'))
            # Kernel birth is mandatory. AppKit launch date is corroborating metadata
            # and is unavailable for the observed directly launched native process.
            launch_date = app.launchDate()
            if launch_date is not None:
                import math
                launch_seconds = float(launch_date.timeIntervalSince1970())
                if not math.isfinite(launch_seconds) or abs(launch_seconds - (seconds + micros / 1_000_000)) > .001:
                    raise QualificationError('ownership_uncertain', stage='application_identity')
        after = token(pid)
        if after != current:
            raise QualificationError('ownership_uncertain', stage='application_identity')
        owner = info(pid)
        if owner is None or owner.ppid != os.getppid() or os.getsid(pid) != pid:
            raise QualificationError('ownership_uncertain', stage='application_identity')
        return app

    def pending_registration():
        if kind == 'terminate':
            return {'termination_pending': True, 'ledger': ledger}
        return {'observation': {'live': True, 'matching_windows': 0,
                'workspace_matches': True, 'workbench': False, 'obstruction': None}, 'ledger': ledger}

    app = owned_app()
    if kind == 'application_state':
        return {'application_ready': app is not None and bool(app.isFinishedLaunching()), 'ledger': ledger}
    if app is None:
        return pending_registration()
    if kind == 'terminate':
        app = owned_app()
        if app is None:
            return pending_registration()
        if not app.terminate():
            raise QualificationError('ownership_uncertain')
        return {'ledger': ledger}

    application = AX.AXUIElementCreateApplication(pid)
    AX.AXUIElementSetMessagingTimeout(application, .2)
    if owned_app() is None:
        return pending_registration()
    if request.get('enable_ax', True):
        if AX.AXUIElementSetAttributeValue(application, 'AXManualAccessibility', True) != 0:
            raise QualificationError('ownership_uncertain', stage='ax_exposure')

    def attribute(element, name):
        error, value = AX.AXUIElementCopyAttributeValue(element, name, None)
        if error in (-25205, -25212):  # unsupported attribute / no value
            return None
        if error:
            raise QualificationError('ownership_uncertain', stage='ax_attribute')
        return value

    windows = list(attribute(application, 'AXWindows') or [])
    titles = [str(attribute(w, 'AXTitle') or '') for w in windows]
    workspace_name = Path(request['workspace']).name
    matching = [w for w, title in zip(windows, titles) if workspace_name in title.split(' — ')]
    generic_title_only = bool(titles) and all(title in ('', 'Visual Studio Code', 'Welcome', 'Welcome — Visual Studio Code') for title in titles)
    obstruction = None
    roles = set()
    queue = list(windows)
    count = 0
    while queue and count < 600:
        node = queue.pop(0)
        role = attribute(node, 'AXRole')
        subrole = attribute(node, 'AXSubrole')
        roles.add(role)
        if subrole == 'AXSystemDialog':
            obstruction = 'unknown_dialog'
        elif (role == 'AXSheet' or subrole == 'AXDialog'
              or bool(attribute(node, 'AXModal'))):
            if obstruction is None:
                obstruction = 'modal'
        queue.extend(list(attribute(node, 'AXChildren') or []))
        count += 1
    # Exhausting the traversal cannot prove absence of an obstruction.
    if queue:
        raise QualificationError('ownership_uncertain', stage='tree_traversal')
    return {'accessibility_exposed': True,
            'window_facts': {'workspace_name_present': any(workspace_name in title for title in titles),
                            'generic_title_only': generic_title_only,
                            'restricted_mode_suffix': any('[Restricted Mode]' in title for title in titles),
                            'has_web_area': 'AXWebArea' in roles, 'has_outline': 'AXOutline' in roles,
                            'has_toolbar': 'AXToolbar' in roles, 'has_tab_group': 'AXTabGroup' in roles},
            'observation': {'live': True, 'matching_windows': len(matching),
                           'workspace_matches': not windows or len(matching) == len(windows),
                           'workbench': {'AXWebArea', 'AXOutline', 'AXToolbar'} <= roles,
                           'initializing': generic_title_only,
                           'obstruction': obstruction}, 'ledger': ledger}



def main():
    import argparse
    import json
    import sys
    if sys.argv[1:] == ['--_native-worker']:
        try:
            request = json.loads(sys.stdin.read(65537))
            result = _native_worker(request)
        except QualificationError as error:
            result = {'error': error.reason, 'stage': error.stage}
        except BaseException:
            result = {'error': 'ownership_uncertain'}
        print(json.dumps(result))
        return 0
    parser = argparse.ArgumentParser(description='Provisional M1-04 qualification; no GUI without --host.')
    parser.add_argument('--host', action='store_true')
    parser.add_argument('--config')
    args = parser.parse_args()
    if not args.host:
        print(json.dumps({'outcome': 'BLOCKED', 'reason': 'explicit --host required'}))
        return 2
    if not args.config:
        parser.error('--host requires --config')
    result = run_probe(args.config, backend_factory=lambda spec: NativeBackend(_coexistence=True))
    cleanup = ('not_started' if result.owner is None else
               'shutdown_confirmed' if result.owner.closed else 'shutdown_unconfirmed')
    document = {'exit_code': result.exit_code, 'qualification': result.facts, 'cleanup': cleanup}
    if cleanup == 'shutdown_unconfirmed':
        backend = result.owner.backend
        # Local controlled manual-recovery diagnostics identify only this spawn.
        # They grant no authority to a later invocation.
        if getattr(backend, 'process', None) is not None:
            document['owned_pid'] = backend.process.pid
            document['workspace'] = str(backend.spec.workspace)
            if backend.identity is not None:
                document['owned_birth'] = backend.identity.birth
    print(json.dumps(document))
    return result.exit_code


if __name__ == '__main__':
    raise SystemExit(main())


class _ControlledBackend:
    """Internal qualification injections; never an independent launch owner.

    Every observation supplied here is synthetic. The composed backend retains
    actual spawn authority and performs all actual cleanup through its owner.
    """
    def __init__(self, backend, scenario):
        self.backend = backend
        self.scenario = scenario
        self.refused = False

    def __getattr__(self, name):
        return getattr(self.backend, name)

    def start(self, spec, deadline, claim):
        if self.scenario == 'spawn_failure':
            raise OSError('controlled_spawn_failure')
        identity = None
        def owned(token):
            nonlocal identity
            claim(token)
            identity = token
        self.backend.start(spec, deadline, owned)
        if identity is None:
            raise QualificationError('ownership_uncertain')
        if self.scenario == 'interrupt':
            raise KeyboardInterrupt
        if self.scenario == 'early_exit':
            # Qualify an actual graceful exit before the logical readiness
            # assertion; do not send quit while the native app is unregistered.
            while time.monotonic() < deadline:
                if isinstance(self.backend, NativeBackend):
                    request = self.backend._request('application_state', identity)
                    result = self.backend._call(request, deadline)
                    self.backend.ledger.update(result['ledger'])
                    observation = Observation(matching_windows=1 if result['application_ready'] else 0)
                else:
                    observation = self.backend.observe(identity, deadline)
                if not observation.live:
                    return
                if observation.matching_windows == 1 or observation.obstruction is not None:
                    self.backend.close(identity, deadline)
                    return
                time.sleep(min(.05, max(0, deadline - time.monotonic())))
            raise QualificationError('readiness_timeout')

    def observe(self, identity, deadline):
        if self.scenario == 'timeout':
            return Observation(matching_windows=0, workbench=False)
        if self.scenario == 'early_exit':
            return Observation(live=False)
        if self.scenario == 'wrong_workspace':
            return Observation(workspace_matches=False)
        if self.scenario == 'ambiguous':
            return Observation(matching_windows=2)
        if self.scenario == 'modal':
            return Observation(obstruction='modal')
        if self.scenario == 'shutdown_refusal':
            return Observation()
        if self.scenario == 'stalled_observer':
            if not isinstance(self.backend, NativeBackend):
                return self.backend.stall(identity, deadline)
            import sys
            command = self.backend._worker_command
            seconds = self.backend.CALL_SECONDS
            try:
                self.backend._worker_command = (sys.executable, '-c', 'import time; time.sleep(30)')
                self.backend.CALL_SECONDS = .25
                self.backend._call({'kind': 'observe'}, deadline)
            finally:
                self.backend._worker_command = command
                self.backend.CALL_SECONDS = seconds
            raise QualificationError('ownership_uncertain')
        return self.backend.observe(identity, deadline)

    def close(self, identity, deadline):
        if self.scenario == 'shutdown_refusal' and not self.refused:
            self.refused = True
            raise CleanupRefused
        self.backend.close(identity, deadline)


def make_controlled_backend(scenario, *, backend_factory=NativeBackend):
    """Return an internal run_probe backend factory; no public fault switches."""
    if scenario not in CONTROLLED_SCENARIOS:
        raise ValueError('unsupported_controlled_scenario')
    return lambda spec: _ControlledBackend(backend_factory(), scenario)
