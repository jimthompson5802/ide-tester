# Milestone 0 — Environment Setup with uv

**Status:** Setup guide for the proposed harness; commands have not been validated end to end on the target host.  
**Target:** macOS, uv, Python 3.12, and supporting development tools.  
**Related:** [Harness proposal](ide-copilot-smoke-harness-proposal.md) and [Milestone 1 user stories](ide-copilot-milestone1-user-stories.md).

## 1. Objective and boundaries

Prepare the local macOS Python environment for the IDE Smoke Test Harness and install only the software tooling needed for Milestone 1: the initial VS Code and GitHub Copilot Chat proof of concept. The broader harness targets VS Code or IntelliJ IDEA and selected extensions. Use uv to create a repository-local virtual environment from the developer-selected existing prebuilt Homebrew Python.

Apply YAGNI (You Aren’t Gonna Need It): add tools only for demonstrated needs in the current milestone. Local native compilation is outside the intended setup and execution workflow. Do not install Xcode, Apple’s Command Line Tools, compilers, or SDKs for this project. If a dependency requires a native source build, reconsider the dependency or automation approach instead of adding a build toolchain.

Milestone 1 owns project/package initialization, harness dependencies, dedicated IDE profiles, disposable workspaces, Copilot installation and authentication, macOS automation permissions, feasibility probes, and all harness implementation and validation. See the [Milestone 1 backlog](ide-copilot-milestone1-user-stories.md) for that work.

The repository currently has no `pyproject.toml`, `uv.lock`, source package, or tests. Milestone 0 uses a standalone virtual environment; project configuration and dependency locking belong to the Milestone 1 foundation.

## 2. Host prerequisites

- Have a terminal and network access for software and Python downloads.
- Install Git and VS Code as described below.
- Run commands as your normal user from the repository root. Replace `/path/to/ide-tester` below with your checkout path.

```bash
cd /path/to/ide-tester
sw_vers
uname -m
```

Record the macOS version and architecture. Verify an existing Git installation:

```bash
git --version
```

If Git is unavailable or macOS offers to install developer tools, use an organization-approved prebuilt Git distribution that does not require a compiler toolchain. Verify `git --version` before continuing.

## 3. Verify existing uv

The developer selected reuse of the existing Homebrew uv installation on
2026-10-20. No additional uv installation or update is needed. In the native
arm64 terminal intended for subsequent setup, check:

```bash
uname -m
command -v uv
type -a uv
uv --version
```

Record the resolved executable, Homebrew provenance, version, and reuse outcome.
Preserve the existing installation. If command resolution fails, report the
blocker and agree on the correction before changing shell configuration.
See the [M0-02 plan](../docs/implementation-plans/M0-02.md).

## 4. Create the Milestone 0 Python environment

Use Python 3.12 as the initial baseline, consistent with the proposal's Python 3.12+ requirement. On 2026-10-20 the developer selected the existing `/opt/homebrew/bin/python3.12` (observed Python 3.12.15, arm64); this supersedes the earlier uv-managed download requirement for this host. Preserve that installation and use the native arm64 terminal validated in M0-02. See the [M0-03 plan](../docs/implementation-plans/M0-03.md) for preflight and verification requirements. The commands below were executed successfully during M0-03 on 2026-10-20, using uv 0.13.1 and Python 3.12.15 arm64. Independent isolation checks passed; the developer validated M0-03 on 2026-10-20. Sandbox cache-lock denials required approved escalation for both uv commands. See the plan’s execution results:

```bash
uv python pin --no-config --offline --no-python-downloads --no-managed-python 3.12
uv venv --no-config --offline --no-python-downloads --no-managed-python --python /opt/homebrew/bin/python3.12 .venv
.venv/bin/python --version
.venv/bin/python -c 'import sys; print(sys.executable); assert sys.prefix != sys.base_prefix'
```

Before running these commands, follow the [M0-03 preflight and verification controls](../docs/implementation-plans/M0-03.md): verify a native arm64 execution context, block conflicting inherited uv settings and nonempty `PYTHONPATH`/`PYTHONHOME`, and verify disabled user-site access. An existing newer Homebrew 3.12.x patch is acceptable if all checks pass. Preserve partial artifacts and failure evidence without automatic rollback. Execution requires separate authorization.

The executable should be inside this checkout's `.venv`. No system Python changes or environment activation are required. The `3.12` pin selects a minor version; record the resolved patch version from `python --version` for reproducibility.

At this stage, use `.venv/bin/python` explicitly because there is no uv project yet. Avoid `uv sync` until `pyproject.toml` exists. uv documents this standalone environment workflow in [Using environments](https://docs.astral.sh/uv/pip/environments/).

The current `.gitignore` excludes both `.venv/` and `.python-version`. Keep the Milestone 0 pin local. When the foundation establishes a shared Python version, remove `.python-version` from `.gitignore` and commit the agreed pin alongside the package configuration.

## 5. Install supporting development tools

Install VS Code using the official [macOS setup instructions](https://code.visualstudio.com/docs/setup/mac). Choose the build appropriate for the host architecture recorded above.

Make the `code` CLI available: open VS Code's Command Palette, run **Shell Command: Install 'code' command in PATH**, and open a new terminal. Verify installation:

```bash
command -v code
code --version
```

For editing Python, select this checkout's `.venv/bin/python` as the editor interpreter. Installing editor extensions is optional for Milestone 0.

IntelliJ installation is not needed for the initial VS Code milestone. Copilot extension setup, sign-in, test profiles, and GUI automation configuration are Milestone 1 tasks.

## 6. Verify the environment

From the repository root:

```bash
git --version
uv --version
.venv/bin/python --version
.venv/bin/python -c 'import pathlib, sys; expected = pathlib.Path(".venv").resolve(); print(sys.executable); assert pathlib.Path(sys.prefix).resolve() == expected'
code --version
```

Record tool versions in local setup notes. These checks establish software availability and interpreter isolation only.

Do not install harness or automation libraries during Milestone 0. Milestone 1 will select and declare only dependencies justified by the approved implementation and feasibility findings. Use pure-Python packages or compatible prebuilt wheels; disable dependency builds from source during installation. PyObjC is a candidate only if compatible prebuilt wheels are available for the target Python, macOS version, and architecture. A missing wheel is a reason to revisit the dependency or approach, not to install compiler tools.

## 7. Troubleshooting

| Symptom | Next step |
| --- | --- |
| `uv` is not found | Open a new terminal and check the installation method's PATH instructions. |
| Git is unavailable or prompts for developer tools | Use an organization-approved prebuilt Git distribution without a compiler toolchain, then rerun `git --version`. |
| A dependency requests a compiler or source build | Stop that installation and revisit the dependency/version or approach; do not add build tools. |
| Wrong Python is used | Use `.venv/bin/python` explicitly and select it as the editor interpreter. |
| `uv sync` reports no project | Use the standalone environment steps above; project synchronization starts in Milestone 1. |
| `code` is not found | Install the CLI through VS Code's Command Palette and restart the terminal. |
| Downloads fail on a managed network | Use organization-approved proxy and certificate configuration. |

## 8. Milestone 0 completion checklist

- [ ] Record macOS version and architecture.
- [ ] Verify Git is available; use a prebuilt distribution if installation is needed.
- [ ] Verify existing uv and record its provenance, version, and reuse outcome.
- [ ] Verify the selected Homebrew Python 3.12 and record its provenance, architecture, and resolved patch version.
- [ ] Create `.venv` and verify that its interpreter belongs to this checkout.
- [ ] Install VS Code and verify the `code` CLI is available.
- [ ] Confirm `.venv/` and the local `.python-version` remain ignored by Git.
- [ ] Complete setup without installing compiler tools or performing native source builds.

Milestone 0 is complete when the Python environment and supporting software are available. Continue with M1-00 for IDE configuration and feasibility work, followed by the existing Milestone 1 review gates.
