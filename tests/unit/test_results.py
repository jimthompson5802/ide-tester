"""Aggregation preserves causes, uncertainty, and explicit exit precedence."""

import pytest

from ide_smoke.results import Outcome, Reason, Result, aggregate, exit_code, skipped

PASS = Result(Outcome.PASS, Reason.PASSED)
CLEAN = Result(Outcome.PASS, Reason.CLEANUP_OK)


@pytest.mark.parametrize("outcome,reason,code", [
    (Outcome.PASS, Reason.PASSED, 0), (Outcome.FAIL, Reason.MISMATCH, 1),
    (Outcome.BLOCKED, Reason.PREREQUISITE, 3), (Outcome.ERROR, Reason.TIMEOUT, 4),
    (Outcome.ERROR, Reason.UNEXPECTED, 4),
])
def test_outcome_matrix(outcome, reason, code):
    first = Result(outcome, reason)
    tests = [first] + ([PASS] * 4 if outcome == Outcome.PASS else [skipped(first)] * 4)
    result = aggregate(tests, [], CLEAN)
    assert result.reason == reason
    assert exit_code(result) == code
    if outcome != Outcome.PASS:
        assert tests[1].as_dict()["origin"] == {"outcome": outcome.value, "reason": reason.code}


@pytest.mark.parametrize("tests", [[], [PASS], [skipped(Result(Outcome.ERROR, Reason.UNIMPLEMENTED))] * 5])
def test_incomplete_suites_cannot_pass(tests):
    assert aggregate(tests, [], CLEAN).outcome == Outcome.ERROR


def test_severity_and_cleanup_preserve_individual_results():
    tests = [Result(Outcome.BLOCKED, Reason.PREREQUISITE), Result(Outcome.FAIL, Reason.MISMATCH)]
    assert aggregate(tests, [], CLEAN).outcome == Outcome.FAIL
    cleanup = Result(Outcome.ERROR, Reason.CLEANUP_FAILED)
    assert aggregate(tests, [], cleanup).reason == Reason.CLEANUP_FAILED
    assert tests[1].reason == Reason.MISMATCH
    assert aggregate(tests, [Result(Outcome.ERROR, Reason.TIMEOUT)], cleanup).reason == Reason.TIMEOUT


@pytest.mark.parametrize("flags,code", [
    ({"config_error": True}, 2), ({"interrupted": True}, 130),
    ({"interrupted": True, "cleanup_failed": True}, 4),
    ({"interrupted": True, "evidence_failed": True}, 4),
    ({"config_error": True, "cleanup_failed": True}, 4),
])
def test_exit_overrides(flags, code):
    assert exit_code(Result(Outcome.ERROR, Reason.INTERRUPTED), **flags) == code
