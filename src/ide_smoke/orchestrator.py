"""Sequential foundation run admission, dependent stopping, and finalization."""

import sys
import time
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Callable

from ide_smoke.adapters.base import IDE, LifecycleError, CleanupError
from ide_smoke.workspace import configured_manager, WorkspaceError, WorkspaceManifest, WorkspaceHandle
from ide_smoke.config import Config, ConfigError, resolve_resources, load_config
from ide_smoke.profile_safety import check_configured_profile
from ide_smoke.guard import RunLockBusy, UnsupportedPlatform, create_guard
from ide_smoke.reporting import EvidenceError, Reporter, timestamp
from ide_smoke.results import TEST_IDS, Outcome, Reason, Result, aggregate, exit_code, skipped


@dataclass
class OperationContext:
    config: Config
    workspace: WorkspaceHandle | None = None
    workspace_path: Path | None = None
    target_path: Path | None = None
    cleanups: list[Callable[[], None]] = field(default_factory=list)
    session: IDE | None = None
    ide_version: str | None = None

    def register_cleanup(self, action: Callable[[], None]) -> None:
        self.cleanups.append(action)


def _default_operations(context, executable, *, session_factory=None):
    def t01(context, timeout):
        factory = session_factory
        if factory is None:
            from ide_smoke.adapters.vscode import VSCodeIDE
            factory = VSCodeIDE
        session = context.session = factory(executable, context.config.profile_root)
        context.register_cleanup(session.close)
        deadline = time.monotonic() + timeout
        context.ide_version = session.get_version(deadline=deadline)
        session.launch(context.workspace_path, deadline=deadline)
        session.wait_ready(deadline=deadline)
        return Result(Outcome.PASS, Reason.PASSED)
    return {"T01": t01}


def run_attempt(ide: str, config_path: str | None = None, *,
                _guard_factory=None, _operations=None, _session_factory=None, _reporter_factory=Reporter, _workspace_factory=configured_manager) -> int:
    """Internal injection seams exercise inert operations; the CLI exposes none."""
    started = time.monotonic()
    issues: list[Result] = []
    tests: list[Result] = []
    guard = None
    owned = False
    context = None
    manager = None
    workspace_ready = False
    manifest = None
    interrupted = config_error = evidence_failed = False
    cleanup = Result(Outcome.PASS, Reason.CLEANUP_OK)
    cleanup_diagnostics = []

    try:
        reporter = _reporter_factory(Path.cwd() / "reports")
    except (Exception, KeyboardInterrupt):
        print(f"HARNESS ERROR: {Reason.SUMMARY_FAILED.message} No report was saved.", file=sys.stderr)
        return 4

    manifest = WorkspaceManifest(reporter.run_id)

    def emit(name, *, result=None, test_id=None):
        nonlocal evidence_failed
        try:
            reporter.event(name, result=result, test_id=test_id)
        except Exception:
            if not evidence_failed:
                issues.append(Result(Outcome.ERROR, Reason.EVENT_FAILED))
            evidence_failed = True
            raise EvidenceError from None

    stage = Reason.GUARD_FAILED
    try:
        emit("run_started")
        guard = (_guard_factory or create_guard)()
        guard.acquire()
        owned = True
        emit("guard_acquired")
        stage = Reason.UNEXPECTED
        try:
            if config_path is not None and (not config_path.strip() or "\x00" in config_path):
                raise ConfigError(Reason.CONFIG_PATH)
            selected = Path(config_path if config_path is not None else "config/harness.local.yaml").expanduser().absolute()
        except (ValueError, RuntimeError):
            raise ConfigError(Reason.CONFIG_PATH) from None
        config = load_config(selected)
        manifest = replace(manifest, retain_on_failure=config.retain_workspace_on_failure)
        emit("configuration_validated")
        executable, resource_issue = resolve_resources(config)
        if resource_issue is None:
            profile_result = check_configured_profile(config.profile_root, executable)
            emit("profile_safety_checked", result=profile_result)
            if profile_result.outcome != Outcome.PASS:
                resource_issue = profile_result
        if resource_issue:
            issues.append(resource_issue)
        else:
            manager = _workspace_factory(config, executable, config_path=selected, reports=reporter.directory.parent)
            handle = manager.create(reporter.run_id)
            workspace_ready = True
            context = OperationContext(config, handle, handle.path, handle.target)
            if _operations is None:
                _operations = _default_operations(context, executable, session_factory=_session_factory)
            emit("workspace_created", result=Result(Outcome.PASS, Reason.WORKSPACE_CREATED))
        if context is not None and _operations is not None:
            origin = None
            for test_id in TEST_IDS:
                if origin:
                    result = skipped(origin)
                    tests.append(result)
                    emit("test_skipped", result=result, test_id=test_id)
                    continue
                action = _operations.get(test_id)
                if action is None:
                    origin = Result(Outcome.ERROR, Reason.UNIMPLEMENTED)
                    issues.append(origin)
                    tests.append(skipped(origin))
                    emit("test_skipped", result=tests[-1], test_id=test_id)
                    continue
                operation_started = time.monotonic()
                try:
                    timeout = (config.copilot_response_seconds if test_id == "T05"
                               else config.ide_startup_seconds)
                    result = action(context, timeout)
                    if (not isinstance(result, Result) or not isinstance(result.outcome, Outcome)
                            or not isinstance(result.reason, Reason) or result.outcome == Outcome.SKIP):
                        result = Result(Outcome.ERROR, Reason.INCOMPLETE)
                except KeyboardInterrupt:
                    interrupted = True
                    result = Result(Outcome.ERROR, Reason.INTERRUPTED)
                except LifecycleError as error:
                    reasons = {
                        "profile_busy": Reason.IDE_PROFILE_BUSY,
                        "native_prerequisite_missing": Reason.IDE_PREREQUISITE,
                        "unsupported_launcher": Reason.IDE_UNSUPPORTED_LAUNCHER,
                        "unsupported_profile_path": Reason.IDE_UNSUPPORTED_PROFILE_PATH,
                        "launch_failed": Reason.IDE_LAUNCH_FAILED,
                        "early_exit": Reason.IDE_EARLY_EXIT,
                        "readiness_timeout": Reason.IDE_READINESS_TIMEOUT,
                        "native_timeout": Reason.IDE_NATIVE_TIMEOUT,
                        "ownership_uncertain": Reason.IDE_OWNERSHIP_UNCERTAIN,
                        "obstructed": Reason.IDE_OBSTRUCTED,
                        "unknown_dialog": Reason.IDE_UNKNOWN_DIALOG,
                        "version_unavailable": Reason.IDE_VERSION_UNAVAILABLE,
                    }
                    reason = reasons.get(error.reason, Reason.UNEXPECTED)
                    blocked = reason in (Reason.IDE_PROFILE_BUSY, Reason.IDE_PREREQUISITE,
                                         Reason.IDE_UNSUPPORTED_LAUNCHER, Reason.IDE_UNSUPPORTED_PROFILE_PATH)
                    result = Result(Outcome.BLOCKED if blocked else Outcome.ERROR, reason)
                except TimeoutError:
                    result = Result(Outcome.ERROR, Reason.TIMEOUT)
                except Exception:
                    result = Result(Outcome.ERROR, Reason.UNEXPECTED)
                result = replace(result, duration_seconds=time.monotonic() - operation_started)
                tests.append(result)
                if result.outcome != Outcome.PASS:
                    origin = result
                emit("test_finished", result=result, test_id=test_id)
    except WorkspaceError as error:
        issues.append(Result(Outcome.BLOCKED if error.unsafe else Outcome.ERROR,
                             Reason.WORKSPACE_UNSAFE if error.unsafe else Reason.WORKSPACE_UNKNOWN))
    except ConfigError as error:
        config_error = True
        issues.append(error.result)
    except RunLockBusy:
        issues.append(Result(Outcome.BLOCKED, Reason.RUN_BUSY))
    except UnsupportedPlatform:
        issues.append(Result(Outcome.ERROR, Reason.PLATFORM))
    except KeyboardInterrupt:
        interrupted = True
        issues.append(Result(Outcome.ERROR, Reason.INTERRUPTED))
    except EvidenceError:
        pass  # emit retained the controlled evidence error.
    except Exception:
        issues.append(Result(Outcome.ERROR, stage))
    finally:
        cleanup_started = time.monotonic()
        if context:
            for action in reversed(context.cleanups):
                try:
                    action()
                except KeyboardInterrupt:
                    interrupted = True
                    issues.append(Result(Outcome.ERROR, Reason.INTERRUPTED))
                    cleanup = Result(Outcome.ERROR, Reason.CLEANUP_FAILED)
                except CleanupError as error:
                    cleanup = Result(Outcome.ERROR, Reason.CLEANUP_FAILED)
                    # Revalidate the allowlisted hints; never render exception text.
                    try:
                        safe = CleanupError(owned_pid=error.owned_pid, owned_birth=error.owned_birth,
                                            workspace=error.workspace)
                        hints = []
                        if safe.owned_pid is not None:
                            hints.append(f"owned_pid={safe.owned_pid}")
                        if safe.owned_birth is not None:
                            hints.append(f"owned_birth={safe.owned_birth}")
                        if safe.workspace is not None:
                            hints.append(f"workspace={safe.workspace}")
                        if hints:
                            cleanup_diagnostics.append("Owned cleanup inspection: " + "; ".join(hints))
                    except Exception:
                        pass
                except Exception:
                    cleanup = Result(Outcome.ERROR, Reason.CLEANUP_FAILED)
        gui_retention = False
        if context and context.session is not None:
            try:
                gui_retention = context.session.requires_workspace_retention
                if type(gui_retention) is not bool:
                    raise ValueError
            except (Exception, KeyboardInterrupt):
                gui_retention = True
                cleanup = Result(Outcome.ERROR, Reason.CLEANUP_FAILED)
        # Finalize after all operation/process callbacks, while exclusion is held.
        handle = manager.handle if manager else None
        if handle:
            manifest = replace(manifest, workspace_path=str(handle.path), target_path=str(handle.target),
                               initial_fixture_sha256=handle.digest if workspace_ready else None,
                               disposition="created", reason="initialized" if workspace_ready else "initialization_incomplete")
        initial_saved = False
        try:
            reporter.workspace_manifest(manifest)
            initial_saved = True
        except (Exception, KeyboardInterrupt) as error:
            if isinstance(error, KeyboardInterrupt):
                interrupted = True
                issues.append(Result(Outcome.ERROR, Reason.INTERRUPTED))
            evidence_failed = True
            issues.append(Result(Outcome.ERROR, Reason.WORKSPACE_EVIDENCE))
        if handle:
            nonpassing = (bool(issues) or interrupted or len(tests) != len(TEST_IDS)
                          or any(t.outcome != Outcome.PASS for t in tests))
            ownership_uncertain = not manager.cleanup_qualified(handle)
            retain = (gui_retention or ownership_uncertain or not initial_saved or cleanup.outcome == Outcome.ERROR
                      or (manifest.retain_on_failure and nonpassing))
            if retain:
                reason = ("ownership_uncertain" if ownership_uncertain else "evidence_unavailable" if not initial_saved else
                          "operation_cleanup_failed" if cleanup.outcome == Outcome.ERROR else
                          "nonpassing_run" if manifest.retain_on_failure and nonpassing else "gui_exit_scope_limited")
                manifest = replace(manifest, disposition="retained", reason=reason)
            else:
                try:
                    manager.remove(handle)
                    manifest = replace(manifest, disposition="removed", reason="policy_remove")
                except (Exception, KeyboardInterrupt) as error:
                    if isinstance(error, KeyboardInterrupt):
                        interrupted = True
                        issues.append(Result(Outcome.ERROR, Reason.INTERRUPTED))
                    cleanup = Result(Outcome.ERROR, Reason.CLEANUP_FAILED)
                    manifest = replace(manifest, disposition="cleanup_failed", reason="removal_failed")
            try:
                manager.release(handle)
            except (Exception, KeyboardInterrupt):
                cleanup = Result(Outcome.ERROR, Reason.CLEANUP_FAILED)
            try:
                reporter.workspace_manifest(manifest)
                resource_result = (Result(Outcome.ERROR, Reason.CLEANUP_FAILED)
                                   if manifest.disposition == "cleanup_failed" else
                                   Result(Outcome.PASS, Reason.WORKSPACE_REMOVED
                                          if manifest.disposition == "removed" else Reason.WORKSPACE_RETAINED))
                emit("workspace_finalized", result=resource_result)
            except EvidenceError:
                if not evidence_failed:
                    evidence_failed = True
                    issues.append(Result(Outcome.ERROR, Reason.WORKSPACE_EVIDENCE))
            except (Exception, KeyboardInterrupt) as error:
                if isinstance(error, KeyboardInterrupt):
                    interrupted = True
                    issues.append(Result(Outcome.ERROR, Reason.INTERRUPTED))
                evidence_failed = True
                issues.append(Result(Outcome.ERROR, Reason.WORKSPACE_EVIDENCE))
        cleanup = replace(cleanup, duration_seconds=time.monotonic() - cleanup_started)

    # Every test is present even when admission/configuration failed.
    origin = issues[0] if issues else Result(Outcome.ERROR, Reason.INCOMPLETE)
    tests.extend(skipped(origin) for _ in range(len(TEST_IDS) - len(tests)))

    def snapshot():
        result = aggregate(tests, issues, cleanup)
        code = exit_code(result, interrupted=interrupted, config_error=config_error,
                         cleanup_failed=cleanup.outcome == Outcome.ERROR, evidence_failed=evidence_failed)
        return {
            "run_id": reporter.run_id, "started_at": reporter.started_at, "ended_at": timestamp(),
            "ide": ide, "result": result.as_dict(), "issues": [r.as_dict() for r in issues],
            "tests": [dict(test_id=test_id, **r.as_dict()) for test_id, r in zip(TEST_IDS, tests)],
            "cleanup": cleanup.as_dict(), "duration_seconds": time.monotonic() - started,
            "workspace": manifest.as_dict(),
            "versions": {"ide": context.ide_version if context else None, "extension": None}, "exit_code": code,
        }

    saved = False

    def save():
        nonlocal saved, evidence_failed, interrupted
        saved = False
        try:
            if not evidence_failed:
                emit("cleanup_finished", result=cleanup)
                emit("run_finished", result=aggregate(tests, issues, cleanup))
        except EvidenceError:
            pass
        except KeyboardInterrupt:
            interrupted = True
            issues.append(Result(Outcome.ERROR, Reason.INTERRUPTED))
        try:
            reporter.finalize(snapshot())
            saved = True
        except KeyboardInterrupt:
            # One bounded retry records the handled interruption.
            interrupted = True
            issues.append(Result(Outcome.ERROR, Reason.INTERRUPTED))
            try:
                reporter.finalize(snapshot())
                saved = True
            except (Exception, KeyboardInterrupt):
                evidence_failed = True
                issues.append(Result(Outcome.ERROR, Reason.SUMMARY_FAILED))
        except Exception:
            evidence_failed = True
            issues.append(Result(Outcome.ERROR, Reason.SUMMARY_FAILED))

    try:
        # The owner retains exclusion through registered cleanup and evidence.
        save()
    finally:
        if owned:
            try:
                guard.release()
            except KeyboardInterrupt:
                interrupted = True
                issues.append(Result(Outcome.ERROR, Reason.INTERRUPTED))
                cleanup = Result(Outcome.ERROR, Reason.CLEANUP_FAILED)
                save()
            except Exception:
                cleanup = Result(Outcome.ERROR, Reason.CLEANUP_FAILED)
                # Amend the saved evidence if final resource release failed.
                save()

    summary = snapshot()
    result = summary["result"]
    details = result["message"]
    if result["key"]:
        details += f" Key: {result['key']}."
    if cleanup.outcome == Outcome.ERROR:
        details += f" {Reason.CLEANUP_FAILED.message}"
    if evidence_failed:
        details += " " + " ".join(r.reason.message for r in issues
                                   if r.reason in (Reason.EVENT_FAILED, Reason.SUMMARY_FAILED, Reason.WORKSPACE_EVIDENCE))
    location = f"Summary saved: {reporter.summary_path}" if saved else "No report was saved."
    print(f"{result['outcome']}: {details} {location}", file=sys.stderr)
    for diagnostic in cleanup_diagnostics:
        print(diagnostic, file=sys.stderr)
    return summary["exit_code"]
