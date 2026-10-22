"""The Phase 1 CLI is intentionally limited to help and explicit rejection."""

from importlib.metadata import metadata

import pytest

from ide_smoke.cli import main


def test_python_support_is_limited_to_312():
    assert metadata("ide-smoke")["Requires-Python"] == ">=3.12,<3.13"


@pytest.mark.parametrize("arguments", [["--help"], ["run", "--help"]])
def test_help(arguments, capsys):
    with pytest.raises(SystemExit) as caught:
        main(arguments)
    assert caught.value.code == 0
    output = capsys.readouterr().out
    assert "usage: ide-smoke" in output
    assert "run" in output
    if arguments == ["--help"]:
        assert "T01" in output and "T02" in output


@pytest.mark.parametrize("arguments", [[], ["run"], ["run", "--ide", "idea"], ["unknown"]])
def test_invalid_arguments(arguments):
    with pytest.raises(SystemExit) as caught:
        main(arguments)
    assert caught.value.code == 2


def test_cli_runs_default_t01_with_inert_session(capsys, config_file, tmp_path, monkeypatch, guard):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("ide_smoke.orchestrator.create_guard", lambda: guard)
    from test_t01_integration import Session
    monkeypatch.setattr("ide_smoke.adapters.vscode.VSCodeIDE", lambda *args: Session())
    assert main(["run", "--ide", "vscode", "--config", str(config_file)]) == 4
    output = capsys.readouterr().err
    assert "HARNESS ERROR" in output
    assert "T02" in output and "not implemented" in output
    assert "Summary saved:" in output


def test_argument_errors_do_not_echo_arbitrary_values(capsys):
    with pytest.raises(SystemExit) as caught:
        main(["run", "--ide", "SENSITIVE_ARGUMENT"])
    assert caught.value.code == 2
    output = capsys.readouterr().err
    assert "SENSITIVE" not in output
    assert "--help" in output
