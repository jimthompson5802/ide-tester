"""Behavioral qualification of the read-only Phase 1 profile-policy seam."""

import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "m1_02_profile_safety",
    Path(__file__).resolve().parents[2] / "scripts/spikes/m1_02/profile_safety.py",
)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


@pytest.fixture
def layout(tmp_path):
    root = tmp_path / "dedicated"
    root.mkdir()
    (root / "user-data").mkdir()
    (root / "extensions").mkdir()
    (root / ".ide-smoke-profile.json").write_text(
        '{"schema_version": 1, "purpose": "ide-smoke-dedicated-vscode"}\n'
    )
    return root


def inspect(root, **context):
    return probe.inspect_profile_safety(
        root, home=root.parent / "home", protected_paths=(), **context
    )


def test_dedicated_layout_and_marker_pass(layout):
    assert inspect(layout) == {
        "outcome": "PASS", "reason": "profile_safe", "resource": "profile"
    }


@pytest.mark.parametrize("resource", ["profile", "user-data", "extensions", "marker"])
@pytest.mark.parametrize("kind", ["missing", "file", "symlink"])
def test_unsafe_resource_is_blocked(layout, tmp_path, resource, kind):
    path = {"profile": layout, "marker": layout / ".ide-smoke-profile.json"}.get(
        resource, layout / resource
    )
    if resource == "profile":
        path = tmp_path / "other"
    elif path.is_dir():
        path.rmdir()
    else:
        path.unlink()
    if kind == "file":
        if resource == "marker":
            path.mkdir()
        else:
            path.write_text("inert")
    elif kind == "symlink":
        path.symlink_to(tmp_path / "absent-target")
    result = inspect(path if resource == "profile" else layout)
    assert result["outcome"] == "BLOCKED"
    assert result["resource"] == resource


def test_symlink_ancestor_is_blocked(layout, tmp_path):
    alias = tmp_path / "alias"
    alias.symlink_to(layout.parent, target_is_directory=True)
    assert inspect(alias / layout.name)["reason"] == "profile_symlink"


@pytest.mark.parametrize("content", [
    "", "not json", "[]", "null", '{"schema_version": 1}',
    '{"schema_version": true, "purpose": "ide-smoke-dedicated-vscode"}',
    '{"schema_version": 1.0, "purpose": "ide-smoke-dedicated-vscode"}',
    '{"schema_version": 2, "purpose": "ide-smoke-dedicated-vscode"}',
    '{"schema_version": 1, "purpose": "personal"}',
    '{"schema_version": 1, "purpose": "ide-smoke-dedicated-vscode", "secret": "private"}',
    '{"schema_version": 1, "schema_version": 1, "purpose": "ide-smoke-dedicated-vscode"}',
    '{"schema_version": NaN, "purpose": "ide-smoke-dedicated-vscode"}',
    " " * 4097,
])
def test_invalid_marker_is_blocked_without_echo(layout, content):
    (layout / ".ide-smoke-profile.json").write_text(content)
    assert inspect(layout) == {
        "outcome": "BLOCKED", "reason": "profile_marker_invalid", "resource": "marker"
    }


def test_invalid_utf8_marker_is_blocked(layout):
    (layout / ".ide-smoke-profile.json").write_bytes(b"\xff")
    assert inspect(layout)["reason"] == "profile_marker_invalid"


def test_hardlinked_marker_is_blocked(layout, tmp_path):
    (tmp_path / "marker-alias").hardlink_to(layout / ".ide-smoke-profile.json")
    assert inspect(layout)["reason"] == "profile_marker_invalid"


@pytest.mark.parametrize("relationship", ["same", "ancestor", "descendant"])
def test_protected_path_overlap_blocks_before_marker_read(layout, relationship, monkeypatch):
    protected = {"same": layout, "ancestor": layout.parent,
                 "descendant": layout / "user-data"}[relationship]
    def forbidden(*args, **kwargs):
        pytest.fail("protected resource contents must not be opened")
    monkeypatch.setattr(probe.os, "open", forbidden)
    result = probe.inspect_profile_safety(layout, home=layout.parent / "home",
                                        protected_paths=(protected,))
    assert result == {"outcome": "BLOCKED", "reason": "profile_protected_overlap",
                      "resource": "profile"}


def test_protected_symlink_alias_cannot_hide_overlap(layout, tmp_path):
    alias = tmp_path / "protected-alias"
    alias.symlink_to(layout / "extensions")
    result = probe.inspect_profile_safety(layout, home=tmp_path / "home",
                                        protected_paths=(alias,))
    assert result["reason"] == "profile_protected_overlap"


@pytest.mark.parametrize("which", ["home", "home-ancestor", "filesystem-root"])
def test_home_and_ancestors_are_blocked(layout, which):
    home = {"home": layout, "home-ancestor": layout / "personal",
            "filesystem-root": Path.home()}[which]
    root = Path("/") if which == "filesystem-root" else layout
    assert probe.inspect_profile_safety(root, home=home, protected_paths=())[
        "reason"
    ] == "profile_protected_overlap"


def test_parent_traversal_is_rejected(layout):
    assert inspect(layout / "user-data" / "..")['reason'] == "profile_path_invalid"


@pytest.mark.parametrize("boundary", ["metadata", "marker-open", "marker-read", "protected-resolution"])
def test_indeterminate_inspection_is_error_and_private(layout, monkeypatch, boundary):
    def denied(*args, **kwargs):
        raise PermissionError("private exception text")
    if boundary == "metadata":
        monkeypatch.setattr(Path, "lstat", denied)
    elif boundary == "marker-open":
        monkeypatch.setattr(probe.os, "open", denied)
    elif boundary == "marker-read":
        monkeypatch.setattr(probe.os, "fstat", denied)
    else:
        monkeypatch.setattr(Path, "resolve", denied)
    result = inspect(layout)
    assert result["outcome"] == "HARNESS ERROR"
    assert result["reason"] == "profile_inspection_unknown"
    assert "private" not in json.dumps(result)


def test_profile_inspection_is_narrow_and_preserves_files(layout, monkeypatch):
    private = layout / "user-data" / "unrelated-secret"
    private.write_bytes(b"private content")
    marker = layout / ".ide-smoke-profile.json"
    before = {p: (p.stat().st_ino, p.stat().st_size, p.stat().st_mtime_ns)
              for p in (layout, layout / "user-data", layout / "extensions", marker, private)}
    real_open = probe.os.open
    def narrow_open(path, flags, *args, **kwargs):
        assert path == marker
        assert flags & (probe.os.O_WRONLY | probe.os.O_RDWR | probe.os.O_CREAT | probe.os.O_TRUNC) == 0
        return real_open(path, flags, *args, **kwargs)
    def no_enumeration(*args, **kwargs):
        pytest.fail("profile contents must not be enumerated")
    monkeypatch.setattr(probe.os, "open", narrow_open)
    monkeypatch.setattr(Path, "iterdir", no_enumeration)
    monkeypatch.setattr(probe.os, "scandir", no_enumeration)
    assert inspect(layout)["outcome"] == "PASS"
    after = {p: (p.stat().st_ino, p.stat().st_size, p.stat().st_mtime_ns) for p in before}
    assert after == before


def test_case_alias_of_protected_directory_cannot_hide_overlap(layout):
    alias = layout.with_name("DEDICATED")
    if not alias.exists():
        pytest.skip("filesystem is case sensitive")
    result = probe.inspect_profile_safety(layout, home=layout.parent / "home",
                                        protected_paths=(alias / "user-data",))
    assert result["reason"] == "profile_protected_overlap"


def test_symlink_loop_is_known_unsafe(layout, tmp_path):
    loop = tmp_path / "loop"
    loop.symlink_to(loop)
    assert inspect(loop)["outcome"] == "BLOCKED"
    assert inspect(loop)["reason"] == "profile_symlink"


@pytest.mark.parametrize("relative", [
    "Library/Application Support/Code", "Library/Application Support/Code - Insiders",
    "Library/Application Support/Code - Exploration", ".vscode", ".vscode-insiders",
    ".vscode-exploration",
])
def test_macos_everyday_locations_are_protected(tmp_path, relative):
    home = tmp_path / "home"
    root = home / relative / "accidental-profile"
    result = probe.inspect_profile_safety(
        root, home=home, protected_paths=probe.macos_protected_paths(home)
    )
    assert result["reason"] == "profile_protected_overlap"


def test_installation_context_uses_metadata_without_execution(tmp_path):
    app = tmp_path / "Editor.app"
    executable = app / "Contents" / "MacOS" / "Electron"
    executable.parent.mkdir(parents=True)
    executable.write_text("inert, nonexecutable file")
    alias = tmp_path / "code"
    alias.symlink_to(executable)
    assert probe.installation_path(alias) == app


def test_non_bundle_installation_protects_executable_parent(tmp_path):
    executable = tmp_path / "bin" / "editor"
    assert probe.installation_path(executable) == executable.parent


def test_children_cannot_share_filesystem_identity(layout, monkeypatch):
    real_lstat = Path.lstat
    def aliased(path, *args, **kwargs):
        if path == layout / "extensions":
            return real_lstat(layout / "user-data", *args, **kwargs)
        return real_lstat(path, *args, **kwargs)
    monkeypatch.setattr(Path, "lstat", aliased)
    assert inspect(layout)["reason"] == "profile_resource_overlap"


def test_marker_fifo_is_rejected_without_opening(layout, monkeypatch):
    marker = layout / ".ide-smoke-profile.json"
    marker.unlink()
    probe.os.mkfifo(marker)
    def forbidden(*args, **kwargs):
        pytest.fail("a FIFO marker must never be opened")
    monkeypatch.setattr(probe.os, "open", forbidden)
    assert inspect(layout)["reason"] == "profile_wrong_kind"


def test_home_case_alias_is_blocked(layout):
    alias = layout.with_name("DEDICATED")
    if not alias.exists():
        pytest.skip("filesystem is case sensitive")
    assert probe.inspect_profile_safety(alias, home=layout, protected_paths=())[
        "reason"
    ] == "profile_protected_overlap"


@pytest.mark.parametrize("relative,expected", [
    ("profiles/m1-00", "PASS"),
    ("profiles/team/test", "PASS"),
    ("profiles", "BLOCKED"),
    ("src/profile", "BLOCKED"),
    ("profiles-other/test", "BLOCKED"),
    (".", "BLOCKED"),
])
def test_checkout_only_allows_roots_beneath_profiles(layout, tmp_path, relative, expected):
    checkout = tmp_path / "repository"
    target = checkout / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    layout.rename(target)
    result = inspect(target, checkout=checkout)
    assert result["outcome"] == expected
    assert result["reason"] == ("profile_safe" if expected == "PASS"
                                else "profile_checkout_overlap")


def test_profile_outside_checkout_remains_supported(layout, tmp_path):
    assert inspect(layout, checkout=tmp_path / "repository")["outcome"] == "PASS"


def test_checkout_ancestor_is_rejected_before_marker_access(tmp_path):
    assert inspect(tmp_path, checkout=tmp_path / "repository")[
        "reason"
    ] == "profile_checkout_overlap"


def test_checkout_allowance_does_not_override_other_protection(layout, tmp_path):
    checkout = tmp_path / "repository"
    target = checkout / "profiles" / "test"
    target.parent.mkdir(parents=True)
    layout.rename(target)
    result = probe.inspect_profile_safety(
        target, home=tmp_path / "home", protected_paths=(target / "user-data",),
        checkout=checkout,
    )
    assert result["reason"] == "profile_protected_overlap"


def test_symlink_profiles_folder_cannot_allow_source_directory(layout, tmp_path):
    checkout = tmp_path / "repository"
    source = checkout / "src"
    source.mkdir(parents=True)
    (checkout / "profiles").symlink_to(source, target_is_directory=True)
    layout.rename(source / "test")
    assert inspect(source / "test", checkout=checkout)["reason"] == "profile_checkout_overlap"


def test_allowed_subtree_cannot_escape_through_symlink(layout, tmp_path):
    checkout = tmp_path / "repository"
    (checkout / "profiles").mkdir(parents=True)
    alias = checkout / "profiles" / "test"
    alias.symlink_to(layout, target_is_directory=True)
    assert inspect(alias, checkout=checkout)["reason"] == "profile_symlink"


def test_checkout_case_alias_still_rejects_source_profile(layout, tmp_path):
    checkout = tmp_path / "repository"
    target = checkout / "src" / "test"
    target.parent.mkdir(parents=True)
    layout.rename(target)
    alias = checkout.with_name("REPOSITORY")
    if not alias.exists():
        pytest.skip("filesystem is case sensitive")
    assert inspect(target, checkout=alias)["reason"] == "profile_checkout_overlap"


def test_profiles_case_alias_still_allows_dedicated_profile(layout, tmp_path):
    checkout = tmp_path / "repository"
    target = checkout / "profiles" / "test"
    target.parent.mkdir(parents=True)
    layout.rename(target)
    alias = checkout / "PROFILES" / "test"
    if not alias.exists():
        pytest.skip("filesystem is case sensitive")
    assert inspect(alias, checkout=checkout)["outcome"] == "PASS"
