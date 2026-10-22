"""Opt-in editor qualification controller. Importing performs no GUI work."""
import os
import json
from pathlib import Path
import re
import stat
import time
from types import SimpleNamespace

ORIGINAL = b'message = "original fixture"\n'
EDITED = b'message = "edited by ide-smoke"\n'


class ProbeError(Exception):
    """Controlled qualification failure; native details never escape here."""

    def __init__(self, reason):
        allowed = {'ownership_uncertain', 'unsafe_target', 'disk_inspection_failed',
                   'target_already_exists', 'autosave_masked_save', 'saved_content_mismatch',
                   'editor_timeout', 'invalid_worker_reply', 'worker_failed',
                   'editor_unavailable', 'native_prerequisite_missing', 'obstructed'}
        super().__init__(reason if reason in allowed else 'worker_failed')


def run_probe(config_path, *, backend_factory, _guard_factory=None,
              _workspace_factory=None, _reporter_factory=None, clock=time.monotonic):
    """Admit and clean up through production orchestration with opt-in operations."""
    from ide_smoke.adapters.vscode import VSCodeIDE
    from ide_smoke.adapters.base import LifecycleError
    from ide_smoke.orchestrator import _default_operations, run_attempt
    from ide_smoke.reporting import Reporter
    from ide_smoke.results import Outcome, Reason, Result
    from ide_smoke.workspace import configured_manager
    owner = None
    facts = {}
    failure = None
    manager = None

    def workspace_factory(*args, **kwargs):
        nonlocal manager
        manager = (_workspace_factory or configured_manager)(*args, **kwargs)
        return manager

    class QualificationReporter:
        def __init__(self, root):
            self.base = (_reporter_factory or Reporter)(root)
        def __getattr__(self, name):
            return getattr(self.base, name)
        def finalize(self, snapshot):
            document = dict(facts=facts, error=failure, cleanup=snapshot['cleanup']['outcome'],
                            workspace_disposition=snapshot['workspace']['disposition'])
            (self.base.directory / 'qualification-editor.json').write_text(
                json.dumps(document, indent=2, allow_nan=False) + '\n', encoding='utf-8')
            self.base.finalize(snapshot)

    def session_factory(executable, profile_root):
        nonlocal owner
        owner = VSCodeIDE(executable, profile_root, _backend=backend_factory())
        return owner

    def t02(context, timeout):
        nonlocal failure
        try:
            if manager is None or not manager.cleanup_qualified(context.workspace):
                raise ProbeError('unsafe_target')
            admitted_identity = manager._owned[context.workspace][2]
            facts.update(qualify_sequence(context.session, context.workspace_path / 'created.py',
                                         deadline=clock() + timeout,
                                         exchange=context.session.backend.exchange, clock=clock,
                                         expected_parent_identity=admitted_identity))
        except ProbeError as error:
            failure = str(error)
            return Result(Outcome.ERROR, Reason.INCOMPLETE)
        except LifecycleError as error:
            failure = 'native_' + error.reason.value
            raise
        return Result(Outcome.PASS, Reason.PASSED)

    # The executable has already been selected and validated by admission. Obtain
    # that same selection from the accepted context rather than choosing a host app.
    from ide_smoke.config import resolve_resources
    def admitted_t01(context, timeout):
        executable, issue = resolve_resources(context.config)
        if issue is not None:
            return issue
        return _default_operations(context, executable, session_factory=session_factory)['T01'](context, timeout)

    code = run_attempt('vscode', str(config_path), _guard_factory=_guard_factory,
                       _operations={'T01': admitted_t01, 'T02': t02},
                       _workspace_factory=workspace_factory,
                       _reporter_factory=QualificationReporter)
    return SimpleNamespace(exit_code=code, owner=owner, facts=facts, error=failure)


def qualify_sequence(session, target, *, deadline, exchange, clock=time.monotonic,
                     sleep=time.sleep, expected_parent_identity=None):
    """Qualify one admitted session using an explicitly injected worker boundary."""
    if (not session.started or session.closed or session.uncertain
            or session.spec is None or session.identity is None
            or session.identity.executable != session.spec.executable
            or session.identity.argv != session.spec.argv
            or type(session.identity.pid) is not int or session.identity.pid <= 0
            or not isinstance(session.identity.birth, str)
            or re.fullmatch(r'[0-9]+:[0-9]+', session.identity.birth) is None
            or not isinstance(target, Path) or not target.is_absolute()
            or target != session.spec.workspace / 'created.py' or '..' in target.parts):
        raise ProbeError('ownership_uncertain')
    try:
        parent = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    except OSError:
        raise ProbeError('unsafe_target') from None
    parent_identity = os.fstat(parent)
    if (expected_parent_identity is not None
            and (parent_identity.st_dev, parent_identity.st_ino) != expected_parent_identity):
        os.close(parent)
        raise ProbeError('unsafe_target')
    def read_disk():
        try:
            current = os.stat(target.parent, follow_symlinks=False)
            if ((current.st_dev, current.st_ino) != (parent_identity.st_dev, parent_identity.st_ino)
                    or not stat.S_ISDIR(current.st_mode)):
                raise ProbeError('unsafe_target')
            try:
                fd = os.open(target.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
            except FileNotFoundError:
                return None
            try:
                metadata = os.fstat(fd)
                if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
                    raise ProbeError('unsafe_target')
                value = os.read(fd, 4097)
                after = os.fstat(fd)
                current_parent = os.stat(target.parent, follow_symlinks=False)
                current_target = os.stat(target.name, dir_fd=parent, follow_symlinks=False)
                if ((metadata.st_size, metadata.st_mtime_ns) != (after.st_size, after.st_mtime_ns)
                        or not stat.S_ISDIR(current_parent.st_mode)
                        or (current_parent.st_dev, current_parent.st_ino) != (
                            parent_identity.st_dev, parent_identity.st_ino)
                        or not stat.S_ISREG(current_target.st_mode)
                        or current_target.st_nlink != 1 or after.st_nlink != 1
                        or (current_target.st_dev, current_target.st_ino) != (after.st_dev, after.st_ino)):
                    raise ProbeError('disk_inspection_failed')
                if len(value) > 4096:
                    raise ProbeError('unsafe_target')
                return value
            finally:
                os.close(fd)
        except OSError:
            raise ProbeError('disk_inspection_failed') from None
    def ensure_absent():
        try:
            current = os.stat(target.parent, follow_symlinks=False)
            if (not stat.S_ISDIR(current.st_mode) or
                    (current.st_dev, current.st_ino) != (parent_identity.st_dev, parent_identity.st_ino)):
                raise ProbeError('unsafe_target')
        except OSError:
            raise ProbeError('disk_inspection_failed') from None
        try:
            os.stat(target.name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            return
        except OSError:
            raise ProbeError('disk_inspection_failed') from None
        raise ProbeError('target_already_exists')
    def call(action, *, pending=False):
        if clock() >= deadline:
            raise ProbeError('editor_timeout')
        result = exchange(session, action, target, deadline)
        if clock() >= deadline:
            raise ProbeError('editor_timeout')
        if (not isinstance(result, dict) or result.keys() != {
                'action', 'owned', 'document', 'editor_focused', 'content', 'dirty', 'performed'}
                or result['action'] != action
                or any(type(result[key]) is not bool for key in (
                    'owned', 'editor_focused', 'performed'))
                or result['document'] not in ('untitled', 'target', 'other', 'unknown')
                or result['content'] not in ('empty', 'edited', 'other', 'unknown')
                or (result['dirty'] is not None and type(result['dirty']) is not bool)
                or result['performed'] != (action != 'inspect')):
            raise ProbeError('invalid_worker_reply')
        if not result['owned'] or (action not in ('new', 'save_as') and not pending
                                   and not result['editor_focused']):
            raise ProbeError('ownership_uncertain')
        return result
    def wait_for(document, content, dirty, *, pending=False):
        while True:
            result = call('inspect', pending=pending)
            if (not pending and result['document'] != document):
                raise ProbeError('ownership_uncertain')
            if (result['document'] == document and result['editor_focused']
                    and result['content'] == content and result['dirty'] is dirty):
                return result
            sleep(min(.05, max(0, deadline - clock())))
    try:
        ensure_absent()
        call('new')
        wait_for('untitled', 'empty', False, pending=True)
        call('enter')
        wait_for('untitled', 'edited', True)
        ensure_absent()
        call('save_as')
        wait_for('target', 'edited', False, pending=True)
        while True:
            observed = read_disk()
            if observed == EDITED:
                return dict(new_untitled_editor=True, dirty_before_save=True,
                            explicit_save=True, explicit_save_as=True, disk_match=True,
                            target_basename='created.py',
                            expected_bytes=len(EDITED), observed_bytes=len(observed))
            if clock() >= deadline:
                raise ProbeError('saved_content_mismatch')
            sleep(min(.05, max(0, deadline - clock())))
    finally:
        os.close(parent)
