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
    def launch(name, *, finish=False, retain=False, session=""):
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
            "harness": {"workspace": {"retain_on_failure": retain}, "platform": "macos", "execution_mode": "sequential",
                        "timeouts": {"ide_startup_seconds": 1, "copilot_response_seconds": 2}},
            "ides": {"vscode": {"executable": "./bin/fake-ide", "profile_root": "./profile"}},
        }))
        marker, release = cwd / "action", cwd / "release"
        if finish:
            release.touch()
        child = subprocess.Popen(
            [sys.executable, str(WORKER), str(tmp_path / "shared.lock"), str(marker), str(release), str(config), session],
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
    assert blocked["workspace"]["disposition"] == "not_created"
    assert not (contender_cwd / "source-checkout" / "workspaces").exists()
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


@pytest.mark.parametrize("retain", [False, True])
def test_sigint_finalizes_and_releases_for_next_cli_run(runs, retain):
    owner, cwd, action, _ = runs("interrupted", retain=retain)
    wait_until(action.exists)
    owner.send_signal(signal.SIGINT)
    assert owner.wait(timeout=5) == 130
    data = read_summary(cwd)
    assert data["workspace"]["disposition"] == ("retained" if retain else "removed")
    assert Path(data["workspace"]["target_path"]).exists() is retain
    assert data["tests"][0]["reason"] == "interrupted"
    assert data["tests"][0]["outcome"] == "HARNESS ERROR"
    assert data["tests"][0]["duration_seconds"] >= 0
    assert all(t["outcome"] == "SKIP" for t in data["tests"][1:])
    assert action.with_suffix(".cleanup").exists()
    successor, _, next_action, _ = runs("after-interrupt", finish=True)
    assert successor.wait(timeout=5) == 0
    assert next_action.exists()


@pytest.mark.parametrize('scenario,code,outcome,reason', [
    ('ready', 4, 'PASS', 'assertion_passed'),
    ('startup_failure', 4, 'HARNESS ERROR', 'ide_launch_failed'),
    ('readiness_timeout', 4, 'HARNESS ERROR', 'ide_readiness_timeout'),
    ('cleanup_failure', 4, 'PASS', 'assertion_passed'),
])
def test_production_t01_inert_session_records_bounded_result_and_retains_workspace(runs, scenario, code, outcome, reason):
    child, cwd, marker, _ = runs('production-' + scenario, finish=True, session=scenario)
    assert child.wait(timeout=5) == code
    data = read_summary(cwd)
    assert data['tests'][0]['outcome'] == outcome
    assert data['tests'][0]['reason'] == reason
    assert 0 <= data['tests'][0]['duration_seconds'] < 2
    assert all(test['outcome'] == 'SKIP' for test in data['tests'][1:])
    assert data['workspace']['disposition'] == 'retained'
    assert Path(data['workspace']['target_path']).is_file()
    assert marker.with_suffix('.cleanup').exists()
    assert data['cleanup']['outcome'] == ('HARNESS ERROR' if scenario == 'cleanup_failure' else 'PASS')


def test_production_t01_sigint_keeps_interrupted_result_and_releases_guard(runs):
    owner, cwd, marker, _ = runs('production-interrupted', session='interrupt')
    wait_until(marker.exists)
    owner.send_signal(signal.SIGINT)
    assert owner.wait(timeout=5) == 130
    data = read_summary(cwd)
    assert data['tests'][0]['outcome'] == 'HARNESS ERROR'
    assert data['tests'][0]['reason'] == 'interrupted'
    assert 0 <= data['tests'][0]['duration_seconds'] < 2
    assert all(test['outcome'] == 'SKIP' for test in data['tests'][1:])
    assert data['workspace']['disposition'] == 'retained'
    assert marker.with_suffix('.cleanup').exists()
    successor, _, action, _ = runs('after-production-interrupt', finish=True)
    assert successor.wait(timeout=5) == 0
    assert action.exists()
