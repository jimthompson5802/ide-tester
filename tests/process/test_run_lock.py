"""Bounded cross-process tests, isolated from the user's real desktop lock."""

import subprocess
import sys
import time
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "darwin", reason="macOS lock qualification")
WORKER = Path(__file__).with_name("lock_worker.py")


def wait_until(predicate):
    deadline = time.monotonic() + 5
    while not predicate():
        if time.monotonic() >= deadline:
            pytest.fail("Child did not reach expected state within five seconds")
        time.sleep(0.01)


@pytest.fixture
def children(tmp_path):
    running = []

    def launch(name, *, start=None):
        cwd = tmp_path / name
        cwd.mkdir()
        # Distinct working directories/configs must not partition the lock.
        (cwd / "harness.local.yaml").write_text(f"qualification: {name}\n")
        ready, release = cwd / "action", cwd / "release"
        if start is None:
            start = cwd / "start"
            start.touch()
        child = subprocess.Popen(
            [sys.executable, str(WORKER), str(tmp_path / "desktop-run.lock"),
             str(ready), str(release), str(start)],
            cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        running.append(child)
        return child, ready, release

    yield launch
    for child in running:
        if child.poll() is None:
            child.terminate()
        try:
            child.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.communicate(timeout=5)


def test_contender_cannot_act_or_change_owner_file(children, tmp_path):
    path = tmp_path / "desktop-run.lock"
    path.write_text("retained owner metadata\n")
    inode = path.stat().st_ino
    owner, action, release = children("owner")
    wait_until(action.exists)
    contender, rejected_action, _ = children("contender")
    assert contender.wait(timeout=5) == 3
    assert not rejected_action.exists()
    assert owner.poll() is None
    assert path.read_text() == "retained owner metadata\n"
    assert path.stat().st_ino == inode
    # Help does not acquire the guard, even while another process owns it.
    help_result = subprocess.run(
        [sys.executable, "-m", "ide_smoke.cli", "--help"],
        capture_output=True, text=True, timeout=5, cwd=action.parent,
    )
    assert help_result.returncode == 0
    release.touch()
    assert owner.wait(timeout=5) == 0
    successor, next_action, next_release = children("successor")
    wait_until(next_action.exists)
    next_release.touch()
    assert successor.wait(timeout=5) == 0
    assert path.stat().st_ino == inode


@pytest.mark.parametrize("signal", ["terminate", "kill"])
def test_process_exit_releases_lock(children, tmp_path, signal):
    owner, action, _ = children("owner")
    wait_until(action.exists)
    inode = (tmp_path / "desktop-run.lock").stat().st_ino
    getattr(owner, signal)()
    owner.wait(timeout=5)
    successor, next_action, release = children("successor")
    wait_until(next_action.exists)
    release.touch()
    assert successor.wait(timeout=5) == 0
    assert (tmp_path / "desktop-run.lock").stat().st_ino == inode


def test_simultaneous_acquisition_has_one_winner(children, tmp_path):
    start = tmp_path / "start"
    first, first_action, first_release = children("first", start=start)
    second, second_action, second_release = children("second", start=start)
    start.touch()
    wait_until(lambda: first_action.exists() or second_action.exists())
    if first_action.exists():
        winner, loser, rejected_action = first, second, second_action
    else:
        winner, loser, rejected_action = second, first, first_action
    assert loser.wait(timeout=5) == 3
    assert not rejected_action.exists()
    assert winner.poll() is None
    first_release.touch()
    second_release.touch()
    assert winner.wait(timeout=5) == 0


def test_default_path_is_canonical_and_instance_reuse_is_safe(tmp_path):
    from ide_smoke.platforms.macos.run_lock import DesktopRunLock

    assert DesktopRunLock().path == Path.home() / ".ide-smoke/desktop-run.lock"
    lock = DesktopRunLock(_path=tmp_path / "lock")
    lock.acquire()
    try:
        with pytest.raises(RuntimeError, match="already owns"):
            lock.acquire()
    finally:
        lock.release()
    lock.release()
    lock.acquire()
    lock.release()
