"""Inert checks for Phase 1 candidates; not production-preflight acceptance."""

import importlib.util
from pathlib import Path
import sys

import pytest

spec = importlib.util.spec_from_file_location(
    "m1_02_qualify", Path(__file__).resolve().parents[2] / "scripts/spikes/m1_02/qualify.py"
)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


@pytest.mark.parametrize("rejections", [("directory",), ("nonexecutable",), ("directory", "nonexecutable")])
def test_lookup_retains_later_executable(tmp_path, rejections):
    entries = []
    for index, kind in enumerate((*rejections, "executable")):
        entry = tmp_path / str(index)
        entry.mkdir()
        candidate = entry / "code"
        if kind == "directory":
            candidate.mkdir()
        else:
            candidate.write_text("inert")
            candidate.chmod(0o700 if kind == "executable" else 0o600)
        entries.append(str(entry))
    assert probe.select_executable("code", entries) == {"status": "selected", "path": str(candidate)}


@pytest.mark.parametrize("first", ["directory", "nonexecutable"])
def test_exhaustion_retains_first_rejection(tmp_path, first):
    entries = []
    for index, kind in enumerate((first, "nonexecutable" if first == "directory" else "directory")):
        entry = tmp_path / str(index)
        entry.mkdir()
        candidate = entry / "code"
        if kind == "directory":
            candidate.mkdir()
        else:
            candidate.write_text("inert")
            candidate.chmod(0o600)
        entries.append(str(entry))
    assert probe.select_executable("code", entries) == {
        "status": "blocked", "reason": "wrong_kind" if first == "directory" else "nonexecutable"
    }


def test_explicit_nonexecutable_does_not_fall_through(tmp_path):
    candidate = tmp_path / "code"
    candidate.write_text("inert")
    candidate.chmod(0o600)
    assert probe.select_executable(candidate, []) == {"status": "blocked", "reason": "nonexecutable"}


def test_lookup_preserves_indeterminate_access(tmp_path, monkeypatch):
    def denied(self):
        raise PermissionError("sensitive marker")

    monkeypatch.setattr(Path, "stat", denied)
    assert probe.select_executable("code", [str(tmp_path)]) == {"status": "error", "reason": "inspection_unavailable"}


def test_bounded_probe_timeout():
    assert probe.bounded([sys.executable, "-c", "import time; time.sleep(10)"], .05) == {
        "status": "error", "reason": "timeout"
    }


def test_bounded_probe_does_not_expose_failed_output():
    assert probe.bounded([sys.executable, "-c", "print('sensitive marker'); raise SystemExit(1)"], 5) == {
        "status": "error", "reason": "subprocess_failed_or_output_limit"
    }
