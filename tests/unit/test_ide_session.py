"""Portable lifecycle errors preserve only controlled, validated diagnostics."""
from pathlib import Path

import pytest


def test_lifecycle_error_accepts_only_closed_reasons_and_fixed_message():
    from ide_smoke.adapters.base import LifecycleError, LifecycleReason

    error = LifecycleError("ownership_uncertain", stage="application_identity")
    assert error.reason is LifecycleReason.OWNERSHIP_UNCERTAIN
    assert str(error) == "ownership_uncertain"
    assert error.stage == "application_identity"
    with pytest.raises(ValueError):
        LifecycleError("SENSITIVE_NATIVE_MESSAGE")


def test_cleanup_error_keeps_validated_current_owner_diagnostics(tmp_path):
    from ide_smoke.adapters.base import CleanupError

    error = CleanupError(owned_pid=123, owned_birth="1792619559:850504", workspace=tmp_path)
    assert error.owned_pid == 123
    assert error.owned_birth == "1792619559:850504"
    assert error.workspace == tmp_path
    assert str(error) == "cleanup_failed"
    assert str(tmp_path) not in str(error)


@pytest.mark.parametrize("kwargs", [
    {"owned_pid": True}, {"owned_pid": -1}, {"owned_pid": 1.5},
    {"owned_birth": "SENSITIVE_NATIVE_MESSAGE"}, {"owned_birth": 123},
    {"workspace": Path("relative")}, {"workspace": "SENSITIVE_NATIVE_MESSAGE"},
])
def test_cleanup_error_rejects_unvalidated_diagnostics(kwargs):
    from ide_smoke.adapters.base import CleanupError

    with pytest.raises(ValueError):
        CleanupError(**kwargs)


def test_lifecycle_stage_cannot_carry_native_content():
    from ide_smoke.adapters.base import LifecycleError

    error = LifecycleError("ownership_uncertain", stage="PRIVATE_NATIVE_CONTENT")
    assert error.stage is None


@pytest.mark.parametrize("failure", [RuntimeError("PRIVATE"), KeyboardInterrupt()])
def test_partial_start_keeps_retention_and_runs_cleanup(failure):
    from ide_smoke.adapters.base import LifecycleError
    from ide_smoke.adapters.vscode import VSCodeIDE

    calls = []
    class Backend:
        def start(self, spec, deadline, claim):
            assert session.requires_workspace_retention is True
            raise failure
        def close(self, identity, deadline):
            calls.append((identity, deadline))
    session = VSCodeIDE(Path('/app'), Path('/profile'), _backend=Backend(), _clock=lambda: 1)
    with pytest.raises(KeyboardInterrupt if isinstance(failure, KeyboardInterrupt) else LifecycleError):
        session.launch(Path('/workspace'), deadline=5)
    session.close()
    assert calls == [(None, 11)]
    assert session.requires_workspace_retention is True


@pytest.mark.parametrize("bad_pid,bad_birth", [(True, "1:2"), (12, "PRIVATE"), (12, "")])
def test_session_refuses_malformed_claim_without_cleanup_authority(bad_pid, bad_birth):
    from ide_smoke.adapters.base import CleanupError, LifecycleError
    from ide_smoke.adapters.vscode import VSCodeIDE, ProcessIdentity

    class Backend:
        def start(self, spec, deadline, claim):
            claim(ProcessIdentity(bad_pid, bad_birth, spec.executable, spec.argv))
        def close(self, identity, deadline):
            pytest.fail('malformed owner must not authorize cleanup')
    session = VSCodeIDE(Path('/app'), Path('/profile'), _backend=Backend(), _clock=lambda: 1)
    with pytest.raises(LifecycleError, match='ownership_uncertain'):
        session.launch(Path('/workspace'), deadline=5)
    with pytest.raises(CleanupError):
        session.close()


@pytest.mark.parametrize("obstruction,expected", [("modal", "obstructed"), ("system", "unknown_dialog")])
def test_readiness_refuses_dialog_and_does_not_mutate_it(obstruction, expected):
    from ide_smoke.adapters.base import LifecycleError
    from ide_smoke.adapters.vscode import VSCodeIDE, Observation, ProcessIdentity

    class Backend:
        def start(self, spec, deadline, claim):
            claim(ProcessIdentity(12, '1:2', spec.executable, spec.argv))
        def observe(self, identity, deadline):
            return Observation(obstruction=obstruction)
    session = VSCodeIDE(Path('/app'), Path('/profile'), _backend=Backend(), _clock=lambda: 1)
    session.launch(Path('/workspace'), deadline=5)
    with pytest.raises(LifecycleError, match=expected):
        session.wait_ready(deadline=5)


def test_inert_imports_on_unsupported_host():
    import subprocess
    import sys
    script = '''
import sys
sys.platform = 'linux'
import ide_smoke.adapters.base
import ide_smoke.adapters.vscode
import ide_smoke.platforms.macos.vscode_session
import ide_smoke.platforms.macos.vscode_worker
assert not {'AppKit','ApplicationServices','objc','Quartz','CoreText'} & sys.modules.keys()
'''
    subprocess.run([sys.executable, '-c', script], check=True, timeout=5)
