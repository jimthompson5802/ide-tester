"""Opt-in production-backed M1-04 qualification; importing this file is inert."""
from dataclasses import dataclass
from pathlib import Path
import time

from ide_smoke.adapters.base import LifecycleError as QualificationError, CleanupError as CleanupRefused
from ide_smoke.adapters.vscode import VSCodeIDE, LaunchSpec, ProcessIdentity, Observation
from ide_smoke.platforms.macos.vscode_session import NativeBackend
from ide_smoke.platforms.macos.vscode_worker import _native_worker
from ide_smoke.orchestrator import run_attempt
from ide_smoke.reporting import Reporter
from ide_smoke.workspace import configured_manager
from ide_smoke.guard import create_guard

WINDOW_FACTS = frozenset({'workspace_name_present', 'generic_title_only', 'restricted_mode_suffix',
                          'has_web_area', 'has_outline', 'has_toolbar', 'has_tab_group'})
CONTROLLED_SCENARIOS = frozenset({'spawn_failure', 'timeout', 'early_exit', 'wrong_workspace',
                                'ambiguous', 'modal', 'interrupt', 'shutdown_refusal', 'stalled_observer'})


class Lifecycle(VSCodeIDE):
    """Historical probe call shape delegating every lifecycle action to production."""
    def __init__(self, backend, *, clock=time.monotonic, sleep=time.sleep, cleanup_seconds=10.0):
        super().__init__(Path('/unused'), Path('/unused'), _backend=backend, _clock=clock, _sleep=sleep)
        self.cleanup_seconds = cleanup_seconds

    def launch(self, spec, deadline):
        self.executable, self.profile_root = spec.executable, spec.profile_root
        return super().launch(spec.workspace, deadline=deadline)

    def wait_ready(self, deadline):
        return super().wait_ready(deadline=deadline)


@dataclass
class ProbeRun:
    exit_code: int
    owner: VSCodeIDE | None
    facts: list[dict]


def run_probe(config_path, *, backend_factory, _guard_factory=None,
              _workspace_factory=configured_manager, _reporter_factory=Reporter,
              clock=time.monotonic) -> ProbeRun:
    """Use production T01 orchestration with private observation controls only."""
    owner = None
    facts = []

    class QualificationReporter:
        def __init__(self, root):
            self.base = _reporter_factory(root)

        def __getattr__(self, name):
            return getattr(self.base, name)

        def finalize(self, snapshot):
            import json
            if owner is not None:
                result = snapshot['tests'][0]
                window_facts = getattr(owner.backend, 'window_facts', {})
                scenario = getattr(owner.backend, 'scenario', 'normal')
                facts.append({'reason': owner.probe_reason, 'outcome': result['outcome'],
                              'stage': owner.probe_stage,
                              'scenario': scenario if scenario in CONTROLLED_SCENARIOS else 'normal',
                              'window_facts': {key: value for key, value in window_facts.items()
                                               if key in WINDOW_FACTS and type(value) is bool},
                              'duration_seconds': result['duration_seconds']})
            document = {'attempts': facts, 'lifecycle': owner.facts if owner else [],
                        'cleanup': snapshot['cleanup']['outcome'],
                        'workspace_disposition': snapshot['workspace']['disposition'],
                        'coexistence': getattr(owner.backend, 'coexistence', None) if owner else None}
            (self.base.directory / 'qualification.json').write_text(json.dumps(document, indent=2) + '\n')
            self.base.finalize(snapshot)

    class Session(VSCodeIDE):
        probe_reason = 'workbench_ready'
        probe_stage = None

        def _record(self, function, *args, **kwargs):
            try:
                return function(*args, **kwargs)
            except KeyboardInterrupt:
                self.probe_reason = 'interrupted'
                raise
            except QualificationError as error:
                self.probe_reason = error.reason.value
                self.probe_stage = error.stage
                raise

        def get_version(self, *, deadline):
            return self._record(super().get_version, deadline=deadline)

        def launch(self, workspace, *, deadline):
            return self._record(super().launch, workspace, deadline=deadline)

        def wait_ready(self, *, deadline):
            return self._record(super().wait_ready, deadline=deadline)

    def session_factory(executable, profile_root):
        nonlocal owner
        owner = Session(executable, profile_root, _backend=backend_factory(LaunchSpec(executable, profile_root, Path('/unused'))), _clock=clock)
        return owner

    code = run_attempt('vscode', config_path, _session_factory=session_factory,
                       _guard_factory=_guard_factory, _workspace_factory=_workspace_factory,
                       _reporter_factory=QualificationReporter)
    return ProbeRun(code, owner, facts)


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


if __name__ == '__main__':
    raise SystemExit(main())
