"""Cross-process CLI exclusion, independent evidence, and real SIGINT handling."""

import json
import signal
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

from test_run_lock import wait_until

pytestmark = pytest.mark.skipif(sys.platform != "darwin", reason="macOS run-entry qualification")
WORKER = Path(__file__).with_name("run_worker.py")


@pytest.fixture
def runs(tmp_path):
    children = []
    def launch(name, *, finish=False):
        cwd = tmp_path / name
        cwd.mkdir()
        executable = cwd / "bin" / "fake-ide"
        executable.parent.mkdir()
        executable.write_text("inert\n")
        profile = cwd / "profile"
        profile.mkdir()
        (profile / "user-data").mkdir()
        (profile / "extensions").mkdir()
        (profile / ".ide-smoke-profile.json").write_text(
            '{"schema_version": 1, "purpose": "ide-smoke-dedicated-vscode"}'
        )
        config = cwd / f"{name}.yaml"
        config.write_text(yaml.safe_dump({
            "harness": {"platform": "macos", "execution_mode": "sequential",
                        "timeouts": {"ide_startup_seconds": 1, "copilot_response_seconds": 2}},
            "ides": {"vscode": {"executable": "./bin/fake-ide", "profile_root": "./profile"}},
        }))
        marker, release = cwd / "action", cwd / "release"
        if finish:
            release.touch()
        child = subprocess.Popen(
            [sys.executable, str(WORKER), str(tmp_path / "shared.lock"), str(marker), str(release), str(config)],
            cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        children.append(child)
        return child, cwd, marker, release
    yield launch
    for child in children:
        if child.poll() is None:
            child.terminate()
        try:
            child.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.communicate(timeout=5)


def read_summary(cwd):
    files = list((cwd / "reports").glob("*/summary.json"))
    assert len(files) == 1
    return json.loads(files[0].read_text())


def test_cli_overlap_keeps_owner_and_evidence_independent(runs, tmp_path):
    lock = tmp_path / "shared.lock"
    lock.write_text("retained owner metadata\n")
    inode = lock.stat().st_ino
    owner, owner_cwd, owner_action, release = runs("owner")
    wait_until(owner_action.exists)
    contender, contender_cwd, rejected_action, _ = runs("contender", finish=True)
    assert contender.wait(timeout=5) == 3
    assert not rejected_action.exists()
    assert not rejected_action.with_suffix(".profile-check").exists()
    assert owner_action.with_suffix(".profile-check").exists()
    assert not rejected_action.with_suffix(".cleanup").exists()
    blocked = read_summary(contender_cwd)
    assert blocked["result"]["reason"] == "active_run_conflict"
    assert all(t["outcome"] == "SKIP" for t in blocked["tests"])
    assert owner.poll() is None
    assert lock.read_text() == "retained owner metadata\n"
    assert lock.stat().st_ino == inode
    help_result = subprocess.run(
        [sys.executable, "-m", "ide_smoke.cli", "--help"], cwd=contender_cwd,
        capture_output=True, text=True, timeout=5,
    )
    assert help_result.returncode == 0
    release.touch()
    assert owner.wait(timeout=5) == 0
    successful = read_summary(owner_cwd)
    assert successful["exit_code"] == 0
    assert successful["run_id"] != blocked["run_id"]
    assert owner_action.with_suffix(".cleanup").exists()
    successor, successor_cwd, next_action, _ = runs("successor", finish=True)
    assert successor.wait(timeout=5) == 0
    assert next_action.exists()
    assert read_summary(successor_cwd)["exit_code"] == 0
    assert lock.stat().st_ino == inode


def test_sigint_finalizes_and_releases_for_next_cli_run(runs):
    owner, cwd, action, _ = runs("interrupted")
    wait_until(action.exists)
    owner.send_signal(signal.SIGINT)
    assert owner.wait(timeout=5) == 130
    data = read_summary(cwd)
    assert data["issues"][0]["reason"] == "interrupted"
    assert all(t["outcome"] == "SKIP" for t in data["tests"])
    assert action.with_suffix(".cleanup").exists()
    successor, _, next_action, _ = runs("after-interrupt", finish=True)
    assert successor.wait(timeout=5) == 0
    assert next_action.exists()
