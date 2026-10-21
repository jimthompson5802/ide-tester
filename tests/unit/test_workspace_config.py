"""Strict optional retention configuration."""
import pytest
import yaml
from ide_smoke.config import load_config, ConfigError

@pytest.mark.parametrize('section,expected', [({}, False), ({'retain_on_failure': True}, True), ({'retain_on_failure': False}, False)])
def test_retention(config_file, settings, section, expected):
    settings['harness']['workspace'] = section
    config_file.write_text(yaml.safe_dump(settings))
    assert load_config(config_file).retain_workspace_on_failure is expected

@pytest.mark.parametrize('section', [None, [], 'private', {'retain_on_failure': None}, {'retain_on_failure': 1}, {'retain_on_failure': 'true'}, {'private': True}])
def test_invalid_retention(config_file, settings, section):
    settings['harness']['workspace'] = section
    config_file.write_text(yaml.safe_dump(settings))
    with pytest.raises(ConfigError):
        load_config(config_file)

def test_omitted_retention(config_file):
    assert load_config(config_file).retain_workspace_on_failure is False

def test_duplicate_retention_is_rejected(config_file):
    text = config_file.read_text()
    config_file.write_text(text.replace('harness:', 'harness:\n  workspace:\n    retain_on_failure: true\n    retain_on_failure: false', 1))
    with pytest.raises(ConfigError):
        load_config(config_file)
