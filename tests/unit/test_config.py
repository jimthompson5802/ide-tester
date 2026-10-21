"""Strict schema, privacy, path rules, and evidence-based availability."""

from pathlib import Path

import pytest
import yaml

from ide_smoke.config import ConfigError, check_resources, load_config
from ide_smoke.results import Outcome, Reason


def load_document(tmp_path, document):
    path = tmp_path / "settings.yaml"
    path.write_text(yaml.safe_dump(document))
    return load_config(path)


def test_valid_config_preserves_unexecutable_file_as_available(config_file):
    config = load_config(config_file)
    assert config.ide_startup_seconds == 0.25
    assert config.copilot_response_seconds == 1.5
    assert check_resources(config) is None


@pytest.mark.parametrize("section", [(), ("harness",), ("harness", "timeouts"), ("ides",), ("ides", "vscode")])
def test_unknown_keys_at_every_level(tmp_path, settings, section):
    node = settings
    for key in section:
        node = node[key]
    node["SENSITIVE_UNKNOWN_KEY"] = "SENSITIVE_VALUE"
    with pytest.raises(ConfigError) as caught:
        load_document(tmp_path, settings)
    assert caught.value.result.reason == Reason.CONFIG_UNKNOWN
    assert "SENSITIVE" not in str(caught.value.result.as_dict())


@pytest.mark.parametrize("path", [
    ("harness",), ("ides",), ("harness", "platform"), ("harness", "execution_mode"),
    ("harness", "timeouts"), ("harness", "timeouts", "ide_startup_seconds"),
    ("harness", "timeouts", "copilot_response_seconds"), ("ides", "vscode"),
    ("ides", "vscode", "executable"), ("ides", "vscode", "profile_root"),
])
def test_missing_required_keys(tmp_path, settings, path):
    node = settings
    for name in path[:-1]:
        node = node[name]
    del node[path[-1]]
    with pytest.raises(ConfigError) as caught:
        load_document(tmp_path, settings)
    assert caught.value.result.reason == Reason.CONFIG_REQUIRED
    assert caught.value.result.key == ".".join(path)


@pytest.mark.parametrize("field", ["ide_startup_seconds", "copilot_response_seconds"])
@pytest.mark.parametrize("value", [True, False, 0, -0.1, float("inf"), float("-inf"), float("nan"), "30", None, [], 10**400])
def test_timeout_boundaries(tmp_path, settings, field, value):
    settings["harness"]["timeouts"][field] = value
    with pytest.raises(ConfigError) as caught:
        load_document(tmp_path, settings)
    assert caught.value.result.reason == Reason.CONFIG_TIMEOUT
    assert caught.value.result.key == "harness.timeouts." + field


@pytest.mark.parametrize("document", [None, [], "scalar", {1: "value"}])
def test_root_requires_mapping(tmp_path, document):
    with pytest.raises(ConfigError) as caught:
        load_document(tmp_path, document)
    assert caught.value.result.reason == Reason.CONFIG_MAPPING


@pytest.mark.parametrize("key,value,reason", [
    ("platform", "windows", Reason.CONFIG_PLATFORM),
    ("platform", True, Reason.CONFIG_TYPE),
    ("execution_mode", "parallel", Reason.CONFIG_MODE),
    ("execution_mode", [], Reason.CONFIG_TYPE),
    ("timeouts", [], Reason.CONFIG_MAPPING),
])
def test_unsupported_or_mistyped_settings(tmp_path, settings, key, value, reason):
    settings["harness"][key] = value
    with pytest.raises(ConfigError) as caught:
        load_document(tmp_path, settings)
    assert caught.value.result.reason == reason


@pytest.mark.parametrize("field", ["executable", "profile_root"])
@pytest.mark.parametrize("value", [None, 1, [], "", "   ", "bad\x00path"])
def test_invalid_resource_paths(tmp_path, settings, field, value):
    settings["ides"]["vscode"][field] = value
    with pytest.raises(ConfigError) as caught:
        load_document(tmp_path, settings)
    assert caught.value.result.reason == Reason.CONFIG_PATH


@pytest.mark.parametrize("text,reason", [
    ("a: [", Reason.CONFIG_SYNTAX),
    ("harness: {}\nharness: {}", Reason.CONFIG_DUPLICATE),
    ("harness: {timeouts: {x: 1, x: 2}}", Reason.CONFIG_DUPLICATE),
    ("!!python/object/apply:os.system ['SENSITIVE_PAYLOAD']", Reason.CONFIG_SYNTAX),
    ("? [a, b]\n: value", Reason.CONFIG_MAPPING),
])
def test_yaml_errors_do_not_echo_document(tmp_path, text, reason):
    path = tmp_path / "bad.yaml"
    path.write_text(text)
    with pytest.raises(ConfigError) as caught:
        load_config(path)
    assert caught.value.result.reason == reason
    assert caught.value.result.path == str(path)
    assert "SENSITIVE" not in str(caught.value.result.as_dict())


def test_unreadable_and_absent_config(tmp_path, monkeypatch):
    with pytest.raises(ConfigError) as caught:
        load_config(tmp_path / "absent.yaml")
    assert caught.value.result.reason == Reason.CONFIG_MISSING
    def denied(*args, **kwargs):
        raise PermissionError("SENSITIVE_EXCEPTION")
    monkeypatch.setattr(Path, "open", denied)
    with pytest.raises(ConfigError) as caught:
        load_config(tmp_path / "private.yaml")
    assert caught.value.result.reason == Reason.CONFIG_UNREADABLE
    assert "SENSITIVE" not in str(caught.value)


def test_yaml_paths_relative_to_config_and_home(tmp_path, settings, monkeypatch):
    settings["ides"]["vscode"] = {"executable": "./bin/ide", "profile_root": "./profile"}
    config = load_document(tmp_path, settings)
    assert config.executable == tmp_path / "bin/ide"
    assert config.profile_root == tmp_path / "profile"
    assert not config.profile_root.exists()  # Loading never creates profiles.
    settings["ides"]["vscode"]["profile_root"] = "~/dedicated-test-profile"
    assert load_document(tmp_path, settings).profile_root == Path.home() / "dedicated-test-profile"


def test_cli_name_lookup_checks_existence_not_executable_permission(tmp_path, settings, monkeypatch):
    settings["ides"]["vscode"]["executable"] = "fake-ide"
    monkeypatch.setenv("PATH", str(tmp_path))
    assert check_resources(load_document(tmp_path, settings)) is None
    monkeypatch.setenv("PATH", str(tmp_path / "no-directory"))
    assert check_resources(load_document(tmp_path, settings)).reason == Reason.EXECUTABLE_MISSING


@pytest.mark.parametrize("field,reason", [("executable", Reason.EXECUTABLE_MISSING), ("profile_root", Reason.PROFILE_MISSING)])
def test_absent_resources_are_blocked(tmp_path, settings, field, reason):
    settings["ides"]["vscode"][field] = str(tmp_path / "absent")
    result = check_resources(load_document(tmp_path, settings))
    assert result.outcome == Outcome.BLOCKED
    assert result.reason == reason


def test_indeterminate_availability_is_error(config_file, monkeypatch):
    config = load_config(config_file)
    def denied(*args, **kwargs):
        raise PermissionError("SENSITIVE_EXCEPTION")
    monkeypatch.setattr(Path, "stat", denied)
    result = check_resources(config)
    assert result.outcome == Outcome.ERROR
    assert result.reason == Reason.AVAILABILITY


def test_existing_wrong_resource_types_are_not_reported_missing(tmp_path, settings):
    settings["ides"]["vscode"]["executable"] = str(tmp_path)
    assert check_resources(load_document(tmp_path, settings)).reason == Reason.EXECUTABLE_KIND
    settings["ides"]["vscode"]["executable"] = str(tmp_path / "fake-ide")
    settings["ides"]["vscode"]["profile_root"] = str(tmp_path / "fake-ide")
    assert check_resources(load_document(tmp_path, settings)).reason == Reason.PROFILE_KIND
