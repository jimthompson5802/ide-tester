"""Run behavior through inert operation and resource boundaries."""

import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

from ide_smoke.cli import main
from ide_smoke.guard import RunLockBusy, UnsupportedPlatform
from ide_smoke.orchestrator import run_attempt
from ide_smoke.reporting import Reporter
from ide_smoke.results import TEST_IDS, Outcome, Reason, Result


def passed(context, timeout):
    assert timeout > 0
    return Result(Outcome.PASS, Reason.PASSED)


def operations(first=passed):
    return {test_id: first if test_id == "T01" else passed for test_id in TEST_IDS}


def summary(tmp_path):
    paths = list((tmp_path / "reports").glob("*/summary.json"))
    assert len(paths) == 1
    return json.loads(paths[0].read_text())


@pytest.fixture
def attempt(tmp_path, config_file, monkeypatch, guard):
    monkeypatch.chdir(tmp_path)
    def run(**kwargs):
        return run_attempt("vscode", str(config_file), _guard_factory=lambda: guard, **kwargs)
    return run


def test_unimplemented_saves_every_skip_with_origin(attempt, tmp_path, guard, capsys):
    assert attempt() == 4
    data = summary(tmp_path)
    assert data["result"]["reason"] == "operations_unimplemented"
    assert [t["test_id"] for t in data["tests"]] == list(TEST_IDS)
    assert all(t["outcome"] == "SKIP" and t["origin"]["outcome"] == "HARNESS ERROR" for t in data["tests"])
    assert all(t["duration_seconds"] is None for t in data["tests"])
    assert data["versions"] == {"ide": None, "extension": None}
    assert guard.released
    assert "Summary saved:" in capsys.readouterr().err


def test_event_correlation_and_lock_held_through_finalization(attempt, tmp_path, guard):
    class CheckingReporter(Reporter):
        def finalize(self, data):
            assert guard.owned
            super().finalize(data)
    assert attempt(_operations=operations(), _reporter_factory=CheckingReporter) == 0
    data = summary(tmp_path)
    events = [json.loads(line) for path in (tmp_path / "reports").glob("*/events.jsonl") for line in path.read_text().splitlines()]
    assert all(e["run_id"] == data["run_id"] and e["timestamp"] for e in events)
    assert events[0]["event"] == "run_started"
    assert events[-1]["event"] == "run_finished"
    assert data["started_at"] <= data["ended_at"]
    assert data["duration_seconds"] >= 0
    assert all(t["duration_seconds"] >= 0 for t in data["tests"])


@pytest.mark.parametrize("mode,code,reason", [
    ("fail", 1, "content_mismatch"), ("block", 3, "prerequisite_missing"),
    ("error", 4, "unexpected_exception"), ("timeout", 4, "unexplained_timeout"),
    ("interrupt", 130, "interrupted"),
])
def test_stopping_cleanup_and_privacy(attempt, tmp_path, capsys, guard, mode, code, reason):
    actions, cleanups = [], []
    def first(context, timeout):
        actions.append("T01")
        context.register_cleanup(lambda: cleanups.append(guard.owned))
        if mode == "error":
            raise RuntimeError("SENSITIVE_EXCEPTION")
        if mode == "timeout":
            raise TimeoutError("SENSITIVE_TIMEOUT")
        if mode == "interrupt":
            raise KeyboardInterrupt("SENSITIVE_INTERRUPT")
        return Result(Outcome.FAIL if mode == "fail" else Outcome.BLOCKED,
                      Reason.MISMATCH if mode == "fail" else Reason.PREREQUISITE)
    def dependent(context, timeout):
        actions.append("dependent")
        return passed(context, timeout)
    actions_map = dict.fromkeys(TEST_IDS, dependent)
    actions_map["T01"] = first
    assert attempt(_operations=actions_map) == code
    data = summary(tmp_path)
    assert data["result"]["reason"] == reason
    assert data["exit_code"] == code
    assert actions == ["T01"]
    assert cleanups == [True]
    assert all(t["outcome"] == "SKIP" and t["origin"]["reason"] == reason for t in data["tests"][1:])
    artifacts = "".join(p.read_text() for p in (tmp_path / "reports").rglob("*") if p.is_file())
    assert "SENSITIVE" not in artifacts + capsys.readouterr().err


def test_interruption_preserves_completed_test(attempt, tmp_path):
    injected = operations()
    def interrupt(context, timeout):
        raise KeyboardInterrupt
    injected["T03"] = interrupt
    assert attempt(_operations=injected) == 130
    data = summary(tmp_path)
    assert [t["outcome"] for t in data["tests"]] == ["PASS", "PASS", "SKIP", "SKIP", "SKIP"]
    assert data["issues"][0]["reason"] == "interrupted"


@pytest.mark.parametrize("interrupt", [False, True])
def test_cleanup_failure_preserves_results_and_overrides_interrupt(attempt, tmp_path, interrupt):
    cleaned = []
    def first(context, timeout):
        context.register_cleanup(lambda: cleaned.append("last"))
        def bad_cleanup():
            raise RuntimeError("SENSITIVE_CLEANUP")
        context.register_cleanup(bad_cleanup)
        if interrupt:
            raise KeyboardInterrupt
        return passed(context, timeout)
    assert attempt(_operations=operations(first)) == 4
    data = summary(tmp_path)
    assert cleaned == ["last"]
    assert data["cleanup"]["outcome"] == "HARNESS ERROR"
    assert data["tests"][0]["outcome"] == ("SKIP" if interrupt else "PASS")
    if interrupt:
        assert data["issues"][0]["reason"] == "interrupted"


def test_guard_release_error_amends_summary(attempt, tmp_path, guard, monkeypatch):
    def bad_release():
        raise OSError("SENSITIVE_RELEASE")
    monkeypatch.setattr(guard, "release", bad_release)
    assert attempt(_operations=operations()) == 4
    data = summary(tmp_path)
    assert data["cleanup"]["reason"] == "cleanup_failed"
    assert all(t["outcome"] == "PASS" for t in data["tests"])


@pytest.mark.parametrize("interrupt", [False, True])
def test_summary_failure_reports_inability_and_retains_snapshot(attempt, capsys, guard, interrupt):
    captured = []
    class FailingReporter(Reporter):
        def finalize(self, data):
            captured.append(data)
            raise OSError("SENSITIVE_REPORT")
    def first(context, timeout):
        if interrupt:
            raise KeyboardInterrupt
        return passed(context, timeout)
    assert attempt(_operations=operations(first), _reporter_factory=FailingReporter) == 4
    assert captured[0]["tests"][0]["outcome"] == ("SKIP" if interrupt else "PASS")
    output = capsys.readouterr().err
    assert "No report was saved" in output
    assert "summary could not be saved" in output
    assert "SENSITIVE" not in output
    assert guard.released


def test_event_failure_stops_actions_but_saves_available_results(attempt, tmp_path, guard):
    class FailingReporter(Reporter):
        def event(self, name, **kwargs):
            if name == "test_finished":
                raise OSError("SENSITIVE_LOG")
            super().event(name, **kwargs)
    assert attempt(_operations=operations(), _reporter_factory=FailingReporter) == 4
    data = summary(tmp_path)
    assert data["tests"][0]["outcome"] == "PASS"
    assert data["tests"][1]["outcome"] == "SKIP"
    assert data["issues"][0]["reason"] == "event_write_failed"
    assert guard.released


def test_reports_root_failure_is_controlled(attempt, tmp_path, capsys):
    (tmp_path / "reports").write_text("inert obstruction")
    assert attempt() == 4
    assert "No report was saved" in capsys.readouterr().err


@pytest.mark.parametrize("issue,code,reason", [
    (RunLockBusy, 3, "active_run_conflict"),
    (UnsupportedPlatform, 4, "host_unsupported"),
    (PermissionError, 4, "guard_unavailable"),
])
def test_admission_failures_save_skips_without_loading_config(tmp_path, monkeypatch, issue, code, reason):
    monkeypatch.chdir(tmp_path)
    def unavailable():
        raise issue("SENSITIVE_GUARD")
    assert run_attempt("vscode", _guard_factory=unavailable) == code
    data = summary(tmp_path)
    assert data["result"]["reason"] == reason
    assert all(t["outcome"] == "SKIP" for t in data["tests"])


def test_missing_resources_precede_unsupported_execution(attempt, tmp_path, config_file, settings):
    settings["ides"]["vscode"]["profile_root"] = str(tmp_path / "absent-profile")
    config_file.write_text(yaml.safe_dump(settings))
    assert attempt() == 3
    data = summary(tmp_path)
    assert data["result"]["reason"] == "profile_missing"
    assert all(t["origin"]["reason"] == "profile_missing" for t in data["tests"])
    assert not (tmp_path / "absent-profile").exists()


@pytest.mark.parametrize("document", ["harness: [", "harness: {platform: SENSITIVE_VALUE}"])
def test_config_error_is_usage_error_with_private_summary(attempt, tmp_path, config_file, capsys, document):
    config_file.write_text(document)
    assert attempt() == 2
    data = summary(tmp_path)
    assert data["result"]["outcome"] == "HARNESS ERROR"
    assert data["exit_code"] == 2
    assert "SENSITIVE" not in json.dumps(data) + capsys.readouterr().err


def test_default_and_explicit_config_follow_caller_cwd(tmp_path, monkeypatch, config_file, guard):
    monkeypatch.setattr("ide_smoke.orchestrator.create_guard", lambda: guard)
    monkeypatch.chdir(tmp_path)
    assert main(["run", "--ide", "vscode"]) == 4
    assert summary(tmp_path)["result"]["reason"] == "operations_unimplemented"
    other = tmp_path / "other"
    other.mkdir()
    monkeypatch.chdir(other)
    assert main(["run", "--ide", "vscode"]) == 2
    assert summary(other)["result"]["reason"] == "config_missing"
    explicit = tmp_path / "explicit"
    explicit.mkdir()
    monkeypatch.chdir(explicit)
    assert main(["run", "--ide", "vscode", "--config", "../config/harness.local.yaml"]) == 4
    assert summary(explicit)["result"]["reason"] == "operations_unimplemented"


def test_operation_timeout_parameters_and_partial_implementation(attempt, tmp_path):
    seen = []
    def action(context, timeout):
        seen.append(timeout)
        return passed(context, timeout)
    assert attempt(_operations={"T01": action}) == 4
    assert seen == [0.25]
    data = summary(tmp_path)
    assert data["tests"][0]["outcome"] == "PASS"
    assert all(t["outcome"] == "SKIP" for t in data["tests"][1:])


def test_all_operation_timeout_parameters(attempt):
    seen = []
    def action(context, timeout):
        seen.append(timeout)
        return passed(context, timeout)
    assert attempt(_operations=dict.fromkeys(TEST_IDS, action)) == 0
    assert seen == [0.25, 0.25, 0.25, 0.25, 1.5]


def test_unsupported_host_does_not_import_macos_module():
    result = subprocess.run([sys.executable, "-c", '''
import sys
sys.platform = "win32"
from ide_smoke.guard import create_guard, UnsupportedPlatform
try:
    create_guard()
except UnsupportedPlatform:
    pass
else:
    raise AssertionError("Unsupported host was admitted")
assert "fcntl" not in sys.modules
assert "ide_smoke.platforms.macos.run_lock" not in sys.modules
'''], capture_output=True, text=True, timeout=5)
    assert result.returncode == 0, result.stderr


def test_cleanup_interrupt_retains_both_reasons_and_continues_cleanup(attempt, tmp_path):
    cleaned = []
    def first(context, timeout):
        context.register_cleanup(lambda: cleaned.append(True))
        def interrupted_cleanup():
            raise KeyboardInterrupt
        context.register_cleanup(interrupted_cleanup)
        return passed(context, timeout)
    assert attempt(_operations=operations(first)) == 4
    data = summary(tmp_path)
    assert cleaned == [True]
    assert data["issues"][0]["reason"] == "interrupted"
    assert data["cleanup"]["reason"] == "cleanup_failed"
    assert all(t["outcome"] == "PASS" for t in data["tests"])


def test_interrupt_during_summary_is_recorded_and_retried(attempt, tmp_path, guard):
    class InterruptedReporter(Reporter):
        interrupted = False
        def finalize(self, data):
            if not self.interrupted:
                self.interrupted = True
                raise KeyboardInterrupt
            super().finalize(data)
    assert attempt(_operations=operations(), _reporter_factory=InterruptedReporter) == 130
    assert summary(tmp_path)["issues"][0]["reason"] == "interrupted"
    assert guard.released


def test_event_error_overrides_interrupted_exit(attempt, tmp_path):
    class FailingReporter(Reporter):
        def event(self, name, **kwargs):
            if name == "cleanup_finished":
                raise OSError("SENSITIVE_FINAL_EVENT")
            super().event(name, **kwargs)
    def interrupt(context, timeout):
        raise KeyboardInterrupt
    assert attempt(_operations=operations(interrupt), _reporter_factory=FailingReporter) == 4
    assert [i["reason"] for i in summary(tmp_path)["issues"]] == ["interrupted", "event_write_failed"]


@pytest.mark.parametrize("invalid_result", [None, Result("invalid", Reason.PASSED), Result(Outcome.PASS, "SENSITIVE_REASON")])
def test_invalid_operation_result_is_controlled(attempt, tmp_path, invalid_result):
    assert attempt(_operations=operations(lambda context, timeout: invalid_result)) == 4
    assert summary(tmp_path)["tests"][0]["reason"] == "suite_incomplete"


def test_atomic_summary_replace_failure_is_controlled(attempt, tmp_path, monkeypatch, capsys):
    def denied(*args):
        raise OSError("SENSITIVE_REPLACE")
    monkeypatch.setattr("ide_smoke.reporting.os.replace", denied)
    assert attempt(_operations=operations()) == 4
    assert not list((tmp_path / "reports").glob("*/summary.json"))
    partial = list((tmp_path / "reports").glob("*/summary.tmp"))
    assert len(partial) == 1
    assert all(t["outcome"] == "PASS" for t in json.loads(partial[0].read_text())["tests"])
    output = capsys.readouterr().err
    assert "No report was saved" in output
    assert "SENSITIVE" not in output


@pytest.mark.parametrize("path", ["", "  ", "\x00"])
def test_invalid_explicit_config_does_not_fall_back_to_default(tmp_path, monkeypatch, guard, path):
    monkeypatch.chdir(tmp_path)
    assert run_attempt("vscode", path, _guard_factory=lambda: guard) == 2
    assert summary(tmp_path)["result"]["reason"] == "config_invalid_path"
