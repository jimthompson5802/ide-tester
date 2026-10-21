"""Read-only profile policy with explicit, platform-neutral protected context."""

from pathlib import Path
import json
import os
import stat

from ide_smoke.results import Outcome, Reason, Result


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


def installation_path(executable):
    """Protect the resolved enclosing .app, or parent; establish no identity."""
    executable = Path(executable).resolve()
    for parent in executable.parents:
        if parent.suffix.casefold() == ".app":
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


def check_profile_safety(root, *, home, protected_paths, checkout):
    root = Path(root).absolute()
    if ".." in root.parts:
        return Result(Outcome.BLOCKED, Reason.PROFILE_PATH_INVALID, key="profile")
    try:
        for component in reversed([root, *root.parents]):
            try:
                mode = component.lstat().st_mode
            except (FileNotFoundError, NotADirectoryError):
                break
            if stat.S_ISLNK(mode):
                return Result(Outcome.BLOCKED, Reason.PROFILE_SYMLINK, key="profile")
        canonical = root.resolve()
        home = Path(home).resolve()
        root_id = _identity(canonical)
        if (home.is_relative_to(canonical)
                or (root_id is not None and any(root_id == _identity(p) for p in [home, *home.parents]))):
            return Result(Outcome.BLOCKED, Reason.PROFILE_PROTECTED_OVERLAP, key="profile")
        for protected in protected_paths:
            protected = Path(protected).resolve()
            if _overlap(canonical, protected):
                return Result(Outcome.BLOCKED, Reason.PROFILE_PROTECTED_OVERLAP, key="profile")
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
                    return Result(Outcome.BLOCKED, Reason.PROFILE_CHECKOUT_OVERLAP, key="profile")
    except (OSError, RuntimeError):
        return Result(Outcome.ERROR, Reason.PROFILE_INSPECTION_UNKNOWN, key="profile")
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
                    return Result(Outcome.BLOCKED, Reason.PROFILE_SYMLINK, key=resource)
            valid = stat.S_ISREG(mode) if resource == "marker" else stat.S_ISDIR(mode)
            if not valid:
                return Result(Outcome.BLOCKED, Reason.PROFILE_WRONG_KIND, key=resource)
            identity = metadata.st_dev, metadata.st_ino
            if identity in identities:
                return Result(Outcome.BLOCKED, Reason.PROFILE_RESOURCE_OVERLAP, key=resource)
            identities.add(identity)
        except (FileNotFoundError, NotADirectoryError):
            return Result(Outcome.BLOCKED, Reason.PROFILE_MISSING, key=resource)
        except OSError:
            return Result(Outcome.ERROR, Reason.PROFILE_INSPECTION_UNKNOWN, key=resource)
    try:
        if not _marker_valid(root / ".ide-smoke-profile.json"):
            return Result(Outcome.BLOCKED, Reason.PROFILE_MARKER_INVALID, key="marker")
    except (ValueError, UnicodeError, RecursionError):
        return Result(Outcome.BLOCKED, Reason.PROFILE_MARKER_INVALID, key="marker")
    except OSError:
        return Result(Outcome.ERROR, Reason.PROFILE_INSPECTION_UNKNOWN, key="marker")
    return Result(Outcome.PASS, Reason.PROFILE_SAFE, key="profile")


def source_checkout():
    """Use the qualified editable src layout, independently of cwd/config paths."""
    package = Path(__file__).resolve().parent
    checkout = package.parent.parent
    if package.parent.name != "src" or not (checkout / "pyproject.toml").is_file():
        raise OSError("Unqualified package layout")
    return checkout


def check_configured_profile(root, executable):
    """Assemble known host context without executing or inspecting IDE content."""
    from ide_smoke.platforms.macos.profile_paths import macos_protected_paths

    try:
        home = Path.home()
        checkout = source_checkout()
        protected = (*macos_protected_paths(home), installation_path(executable))
    except (OSError, RuntimeError):
        return Result(Outcome.ERROR, Reason.PROFILE_INSPECTION_UNKNOWN, key="profile")
    return check_profile_safety(root, home=home, protected_paths=protected, checkout=checkout)
