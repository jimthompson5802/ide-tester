"""Synthetic settings and guard isolation; no real IDE/profile access."""

from pathlib import Path

import pytest
import yaml


@pytest.fixture
def settings(tmp_path):
    executable = tmp_path / "fake-ide"
    executable.write_text("inert executable placeholder\n")
    profile = tmp_path / "fake-profile"
    profile.mkdir()
    return {
        "harness": {"platform": "macos", "execution_mode": "sequential",
                    "timeouts": {"ide_startup_seconds": 0.25, "copilot_response_seconds": 1.5}},
        "ides": {"vscode": {"executable": str(executable), "profile_root": str(profile)}},
    }


@pytest.fixture
def config_file(tmp_path, settings):
    path = tmp_path / "config" / "harness.local.yaml"
    path.parent.mkdir()
    path.write_text(yaml.safe_dump(settings))
    return path


class InertGuard:
    def __init__(self):
        self.owned = False
        self.released = False

    def acquire(self):
        assert not self.owned
        self.owned = True

    def release(self):
        assert self.owned
        self.owned = False
        self.released = True


@pytest.fixture
def guard():
    return InertGuard()
