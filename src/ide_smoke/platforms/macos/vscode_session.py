"""Native session owner and bounded worker client. No framework imports here."""
from pathlib import Path
import time
from ide_smoke.adapters.base import LifecycleError, CleanupError
from ide_smoke.adapters.vscode import LaunchSpec, ProcessIdentity, Observation

WINDOW_FACTS = frozenset({'workspace_name_present', 'generic_title_only', 'restricted_mode_suffix',
                          'has_web_area', 'has_outline', 'has_toolbar', 'has_tab_group'})

class NativeBackend:
    """macOS backend. Only the controller spawns the IDE.

    All native inspection/messaging runs in a disposable bounded worker. A
    worker timeout never kills the IDE or loses the controller's Popen handle.
    """
    CALL_SECONDS = 3.0

    def __init__(self, *, _worker_command=None, _spawn=None, _coexistence=False):
        import sys
        import subprocess
        self._spawn = _spawn or subprocess.Popen
        self._worker_command = _worker_command or (sys.executable, '-m', 'ide_smoke.platforms.macos.vscode_worker')
        self._metadata = None
        self._metadata_executable = None
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

    def get_version(self, executable: Path, *, deadline: float) -> str:
        if self._metadata is None or self._metadata_executable != executable:
            self._metadata = self._call({'kind': 'metadata', 'executable': str(executable)}, deadline)
            self._metadata_executable = executable
        return self._metadata['version']

    def regular_snapshot(self, deadline):
        return self._call({'kind': 'regular_snapshot', 'salt': self.snapshot_salt,
                           'exclude_pid': self.process.pid if self.process else None}, deadline)['applications']

    def _call(self, request, deadline):
        import json
        import subprocess
        seconds = min(self.CALL_SECONDS, deadline - time.monotonic())
        if seconds <= 0:
            raise LifecycleError('native_timeout')
        try:
            reply = subprocess.run(self._worker_command, input=json.dumps(request),
                                   capture_output=True, text=True, timeout=seconds)
            if reply.returncode or len(reply.stdout.encode("utf-8")) > 65536:
                raise LifecycleError('ownership_uncertain')
            result = json.loads(reply.stdout)
            if not isinstance(result, dict):
                raise LifecycleError('ownership_uncertain')
            if 'error' in result:
                stages = {'process_identity', 'application_identity', 'ax_exposure',
                          'ax_attribute', 'tree_traversal', 'window_association'}
                if (result.keys() - {'error', 'stage'}
                        or not isinstance(result['error'], str)
                        or (result.get('stage') is not None and result['stage'] not in stages)):
                    raise LifecycleError('ownership_uncertain')
                raise LifecycleError(result['error'], stage=result.get('stage'))
            self._validate_reply(request, result)
            return result
        except subprocess.TimeoutExpired:
            raise LifecycleError('native_timeout') from None
        except LifecycleError:
            raise
        except Exception:
            raise LifecycleError('ownership_uncertain') from None

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
        if kind == 'metadata':
            valid = (result.keys() == {'executable', 'bundle_identifier', 'version'}
                     and result['executable'] == request['executable']
                     and result['bundle_identifier'] == 'com.microsoft.VSCode'
                     and isinstance(result['version'], str)
                     and re.fullmatch(r'[0-9A-Za-z.+-]{1,64}', result['version']) is not None)
        elif kind == 'identity':
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
            raise LifecycleError('ownership_uncertain')

    def start(self, spec, deadline, claim):
        import os
        import subprocess
        self.spec = spec
        # Metadata and version reads run inside the bounded worker.
        executable = spec.executable
        version = self.get_version(executable, deadline=deadline)
        ipc_path = spec.profile_root / 'user-data' / f'{version[:4]}-main.sock'
        if len(os.fsencode(ipc_path)) >= 103:
            raise LifecycleError('unsupported_profile_path')
        self._call({'kind': 'preflight', 'executable': str(executable),
                    'profile': str(spec.profile_root)}, deadline)
        if self._coexistence:
            self.regular_before = self.regular_snapshot(deadline)
            if not any(app['windows'] for app in self.regular_before):
                raise LifecycleError('native_prerequisite_missing')
        if time.monotonic() >= deadline:
            raise LifecycleError('readiness_timeout')
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
            raise LifecycleError('ownership_uncertain')
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
                raise CleanupError
            if identity is None:
                if self.process.poll() is not None:
                    # Descendant absence has not been established.
                    raise CleanupError
                token = self._call({'kind': 'identity', 'pid': self.process.pid}, deadline)
                identity = ProcessIdentity(token['pid'], token['birth'], Path(token['executable']), tuple(token['argv']))
                if identity.executable != self.spec.executable or identity.argv != self.spec.argv:
                    raise CleanupError
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
                            raise CleanupError
                    return
                time.sleep(min(.05, max(0, deadline - time.monotonic())))
        except Exception:
            raise CleanupError from None
        raise CleanupError
