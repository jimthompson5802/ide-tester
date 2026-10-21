"""Sequential foundation run admission, dependent stopping, and finalization."""

import sys
import time
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Callable

from ide_smoke.config import Config, ConfigError, check_resources, load_config
from ide_smoke.guard import RunLockBusy, UnsupportedPlatform, create_guard
from ide_smoke.reporting import EvidenceError, Reporter, timestamp
from ide_smoke.results import TEST_IDS, Outcome, Reason, Result, aggregate, exit_code, skipped


@dataclass
class OperationContext:
    config: Config
    cleanups: list[Callable[[], None]] = field(default_factory=list)

    def register_cleanup(self, action: Callable[[], None]) -> None:
        self.cleanups.append(action)


def run_attempt(ide: str, config_path: str | None = None, *,
                _guard_factory=None, _operations=None, _reporter_factory=Reporter) -> int:
    """Internal injection seams exercise inert operations; the CLI exposes none."""
    started = time.monotonic()
    issues: list[Result] = []
    tests: list[Result] = []
    guard = None
    owned = False
    context = None
    interrupted = config_error = evidence_failed = False
    cleanup = Result(Outcome.PASS, Reason.CLEANUP_OK)

    try:
        reporter = _reporter_factory(Path.cwd() / "reports")
    except (Exception, KeyboardInterrupt):
        print(f"HARNESS ERROR: {Reason.SUMMARY_FAILED.message} No report was saved.", file=sys.stderr)
        return 4

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
        emit("configuration_validated")
        resource_issue = check_resources(config)
        if resource_issue:
            issues.append(resource_issue)
        elif _operations is None:
            issues.append(Result(Outcome.ERROR, Reason.UNIMPLEMENTED))
        else:
            context = OperationContext(config)
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
                except TimeoutError:
                    result = Result(Outcome.ERROR, Reason.TIMEOUT)
                except Exception:
                    result = Result(Outcome.ERROR, Reason.UNEXPECTED)
                result = replace(result, duration_seconds=time.monotonic() - operation_started)
                tests.append(result)
                if result.outcome != Outcome.PASS:
                    origin = result
                emit("test_finished", result=result, test_id=test_id)
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
                except Exception:
                    cleanup = Result(Outcome.ERROR, Reason.CLEANUP_FAILED)
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
            "versions": {"ide": None, "extension": None}, "exit_code": code,
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
                                   if r.reason in (Reason.EVENT_FAILED, Reason.SUMMARY_FAILED))
    location = f"Summary saved: {reporter.summary_path}" if saved else "No report was saved."
    print(f"{result['outcome']}: {details} {location}", file=sys.stderr)
    return summary["exit_code"]
