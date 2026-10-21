"""Read-only Phase 1 profile-policy qualification; not production admission."""

from pathlib import Path
import json
import os
import stat

from ide_smoke.results import Outcome


def _finding(outcome, reason, resource):
    return {"outcome": outcome.value, "reason": reason, "resource": resource}


def _strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError
        result[key] = value
    return result


def _invalid_constant(value):
    raise ValueError


def _identity(path):
    try:
        metadata = path.stat()
    except (FileNotFoundError, NotADirectoryError):
        return None
    return metadata.st_dev, metadata.st_ino


def _overlap(left, right):
    if left.is_relative_to(right) or right.is_relative_to(left):
        return True
    # Existing directory identities catch case aliases on macOS filesystems.
    left_id, right_id = _identity(left), _identity(right)
    return ((left_id is not None and any(left_id == _identity(p) for p in [right, *right.parents]))
            or (right_id is not None and any(right_id == _identity(p) for p in [left, *left.parents])))


def _contains(parent, child):
    if child.is_relative_to(parent):
        return True
    parent_id = _identity(parent)
    return parent_id is not None and any(
        parent_id == _identity(p) for p in [child, *child.parents]
    )


def macos_protected_paths(home):
    """Explicit default Stable/Insiders/Exploration locations; metadata only."""
    home = Path(home)
    return tuple(home / relative for relative in (
        "Library/Application Support/Code", "Library/Application Support/Code - Insiders",
        "Library/Application Support/Code - Exploration", ".vscode", ".vscode-insiders",
        ".vscode-exploration",
    ))


def installation_path(executable):
    """Protect the resolved enclosing .app, or parent; establish no identity."""
    executable = Path(executable).resolve()
    for parent in executable.parents:
        if parent.suffix == ".app":
            return parent
    return executable.parent


def _marker_valid(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as source:
        metadata = os.fstat(source.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
            return False
        content = source.read(4097)
    if len(content) > 4096:
        return False
    marker = json.loads(content.decode("utf-8"), object_pairs_hook=_strict_object,
                        parse_constant=_invalid_constant)
    return (isinstance(marker, dict)
            and marker.keys() == {"schema_version", "purpose"}
            and type(marker["schema_version"]) is int
            and marker["schema_version"] == 1
            and marker["purpose"] == "ide-smoke-dedicated-vscode")


def inspect_profile_safety(root, *, home, protected_paths, checkout=None):
    root = Path(root).absolute()
    if ".." in root.parts:
        return _finding(Outcome.BLOCKED, "profile_path_invalid", "profile")
    try:
        for component in reversed([root, *root.parents]):
            try:
                mode = component.lstat().st_mode
            except (FileNotFoundError, NotADirectoryError):
                break
            if stat.S_ISLNK(mode):
                return _finding(Outcome.BLOCKED, "profile_symlink", "profile")
        canonical = root.resolve()
        home = Path(home).resolve()
        root_id = _identity(canonical)
        if (home.is_relative_to(canonical)
                or (root_id is not None and any(root_id == _identity(p) for p in [home, *home.parents]))):
            return _finding(Outcome.BLOCKED, "profile_protected_overlap", "profile")
        for protected in protected_paths:
            protected = Path(protected).resolve()
            if _overlap(canonical, protected):
                return _finding(Outcome.BLOCKED, "profile_protected_overlap", "profile")
        if checkout is not None:
            checkout = Path(checkout).resolve()
            if _overlap(canonical, checkout):
                allowed = checkout / "profiles"
                try:
                    allowed_symlink = stat.S_ISLNK(allowed.lstat().st_mode)
                except FileNotFoundError:
                    allowed_symlink = False
                if (allowed_symlink or not _contains(allowed, canonical)
                        or _contains(canonical, allowed)):
                    return _finding(Outcome.BLOCKED, "profile_checkout_overlap", "profile")
    except (OSError, RuntimeError):
        return _finding(Outcome.ERROR, "profile_inspection_unknown", "profile")
    resources = [("profile", root), ("user-data", root / "user-data"),
                 ("extensions", root / "extensions"),
                 ("marker", root / ".ide-smoke-profile.json")]
    identities = set()
    for resource, path in resources:
        try:
            for component in reversed([path, *path.parents]):
                metadata = component.lstat()
                mode = metadata.st_mode
                if stat.S_ISLNK(mode):
                    return _finding(Outcome.BLOCKED, "profile_symlink", resource)
            valid = stat.S_ISREG(mode) if resource == "marker" else stat.S_ISDIR(mode)
            if not valid:
                return _finding(Outcome.BLOCKED, "profile_wrong_kind", resource)
            identity = metadata.st_dev, metadata.st_ino
            if identity in identities:
                return _finding(Outcome.BLOCKED, "profile_resource_overlap", resource)
            identities.add(identity)
        except (FileNotFoundError, NotADirectoryError):
            return _finding(Outcome.BLOCKED, "profile_missing", resource)
        except OSError:
            return _finding(Outcome.ERROR, "profile_inspection_unknown", resource)
    try:
        if not _marker_valid(root / ".ide-smoke-profile.json"):
            return _finding(Outcome.BLOCKED, "profile_marker_invalid", "marker")
    except (ValueError, UnicodeError, RecursionError):
        return _finding(Outcome.BLOCKED, "profile_marker_invalid", "marker")
    except OSError:
        return _finding(Outcome.ERROR, "profile_inspection_unknown", "marker")
    return _finding(Outcome.PASS, "profile_safe", "profile")
