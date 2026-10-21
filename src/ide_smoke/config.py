"""Strict safe YAML validation and non-GUI basic resource availability."""

import math
import os
import stat
from dataclasses import dataclass
from pathlib import Path

import yaml

from ide_smoke.results import Outcome, Reason, Result


class ConfigError(Exception):
    def __init__(self, reason: Reason, key: str = "document", path: str | None = None):
        self.result = Result(Outcome.ERROR, reason, key=key, path=path)
        super().__init__(reason.code)


class StrictLoader(yaml.SafeLoader):
    def construct_mapping(self, node, deep=False):
        if not isinstance(node, yaml.MappingNode):
            raise ConfigError(Reason.CONFIG_MAPPING)
        result = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if not isinstance(key, str):
                raise ConfigError(Reason.CONFIG_MAPPING)
            if key in result:
                raise ConfigError(Reason.CONFIG_DUPLICATE)
            result[key] = self.construct_object(value_node, deep=deep)
        return result


@dataclass(frozen=True)
class Config:
    executable: Path | str
    profile_root: Path
    ide_startup_seconds: float
    copilot_response_seconds: float


def _section(value, required: tuple[str, ...], key: str) -> dict:
    if not isinstance(value, dict) or any(not isinstance(k, str) for k in value):
        raise ConfigError(Reason.CONFIG_MAPPING, key)
    if value.keys() - set(required):
        # Never echo arbitrary user-supplied keys or their values.
        raise ConfigError(Reason.CONFIG_UNKNOWN, key)
    for name in required:
        if name not in value:
            raise ConfigError(Reason.CONFIG_REQUIRED, f"{key}.{name}".removeprefix("document."))
    return value


def _choice(value, expected: str, key: str, reason: Reason) -> None:
    if not isinstance(value, str):
        raise ConfigError(Reason.CONFIG_TYPE, key)
    if value != expected:
        raise ConfigError(reason, key)


def _timeout(value, key: str) -> float:
    try:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError
        number = float(value)
        if not math.isfinite(number) or number <= 0:
            raise ValueError
    except (ValueError, OverflowError):
        raise ConfigError(Reason.CONFIG_TIMEOUT, key) from None
    return number


def _path(value, base: Path, key: str, *, allow_name=False) -> Path | str:
    if not isinstance(value, str) or not value.strip() or "\x00" in value:
        raise ConfigError(Reason.CONFIG_PATH, key)
    if allow_name and "/" not in value and not value.startswith("~"):
        return value
    try:
        path = Path(value).expanduser()
    except (RuntimeError, ValueError):
        raise ConfigError(Reason.CONFIG_PATH, key) from None
    return path if path.is_absolute() else base / path


def load_config(path: Path) -> Config:
    try:
        with path.open(encoding="utf-8") as source:
            document = yaml.load(source, Loader=StrictLoader)
    except FileNotFoundError:
        raise ConfigError(Reason.CONFIG_MISSING, path=str(path)) from None
    except (OSError, UnicodeError):
        raise ConfigError(Reason.CONFIG_UNREADABLE, path=str(path)) from None
    except ValueError:
        raise ConfigError(Reason.CONFIG_PATH) from None
    except yaml.YAMLError:
        raise ConfigError(Reason.CONFIG_SYNTAX, path=str(path)) from None
    except ConfigError as error:
        raise ConfigError(error.result.reason, error.result.key, str(path)) from None
    try:
        root = _section(document, ("harness", "ides"), "document")
        harness = _section(root["harness"], ("platform", "execution_mode", "timeouts"), "harness")
        _choice(harness["platform"], "macos", "harness.platform", Reason.CONFIG_PLATFORM)
        _choice(harness["execution_mode"], "sequential", "harness.execution_mode", Reason.CONFIG_MODE)
        timeouts = _section(harness["timeouts"], ("ide_startup_seconds", "copilot_response_seconds"), "harness.timeouts")
        ides = _section(root["ides"], ("vscode",), "ides")
        vscode = _section(ides["vscode"], ("executable", "profile_root"), "ides.vscode")
        return Config(
            executable=_path(vscode["executable"], path.parent, "ides.vscode.executable", allow_name=True),
            profile_root=_path(vscode["profile_root"], path.parent, "ides.vscode.profile_root"),
            ide_startup_seconds=_timeout(timeouts["ide_startup_seconds"], "harness.timeouts.ide_startup_seconds"),
            copilot_response_seconds=_timeout(timeouts["copilot_response_seconds"], "harness.timeouts.copilot_response_seconds"),
        )
    except ConfigError as error:
        raise ConfigError(error.result.reason, error.result.key, str(path)) from None


def _inspect(path: Path, *, directory: bool, key: str) -> Result | None:
    try:
        mode = path.stat().st_mode
    except (FileNotFoundError, NotADirectoryError):
        return Result(Outcome.BLOCKED, Reason.PROFILE_MISSING if directory else Reason.EXECUTABLE_MISSING,
                      key=key, path=str(path))
    except OSError:
        return Result(Outcome.ERROR, Reason.AVAILABILITY, key=key, path=str(path))
    valid = stat.S_ISDIR(mode) if directory else stat.S_ISREG(mode)
    if not valid:
        return Result(Outcome.BLOCKED, Reason.PROFILE_KIND if directory else Reason.EXECUTABLE_KIND,
                      key=key, path=str(path))
    return None


def resolve_resources(config: Config) -> tuple[Path | None, Result | None]:
    """Return the metadata-selected executable and any basic availability issue."""
    executable = config.executable
    if isinstance(executable, str):
        # Basic existence only. shutil.which would mislabel a nonexecutable file
        # as absent; executable runnability is outside basic availability checks.
        first_wrong_kind = None
        for entry in os.get_exec_path():
            candidate = Path(entry) / executable
            issue = _inspect(candidate, directory=False, key="ides.vscode.executable")
            if issue is None:
                executable = candidate
                break
            if issue.reason == Reason.EXECUTABLE_KIND:
                if first_wrong_kind is None:
                    first_wrong_kind = issue
                continue
            if issue.reason != Reason.EXECUTABLE_MISSING:
                return None, issue
        else:
            if first_wrong_kind is not None:
                return None, first_wrong_kind
            return None, Result(Outcome.BLOCKED, Reason.EXECUTABLE_MISSING, key="ides.vscode.executable")
    else:
        issue = _inspect(executable, directory=False, key="ides.vscode.executable")
        if issue:
            return None, issue
    return executable, _inspect(config.profile_root, directory=True, key="ides.vscode.profile_root")


def check_resources(config: Config) -> Result | None:
    return resolve_resources(config)[1]
