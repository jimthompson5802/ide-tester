# Repository instructions

## Current state

This repository contains design documents for an IDE smoke-test harness. There is no implemented harness, Python project configuration, or runnable test suite yet. Treat proposed commands, source layouts, APIs, and configuration schemas as design targets until implementation establishes them.

Keep documentation changes within the requested scope; a documentation task does not initiate environment setup or harness implementation.

## Read before working

- For project scope and delivery status, read [README.md](README.md).
- For environment setup or dependency installation, read [Milestone 0 setup](specifications/ide-milestone0-environment-setup.md). It describes a standalone uv environment; project initialization belongs to Milestone 1.
- For architecture, adapter contracts, isolation, or milestone planning, read the [harness proposal](specifications/ide-copilot-smoke-harness-proposal.md). It is a draft design, with feasibility assumptions still to validate.
- For Milestone 1 implementation or acceptance review, read the [user stories](specifications/ide-copilot-milestone1-user-stories.md), including the applicable story's dependencies, acceptance criteria, evidence, and developer gate.
- For VS Code testing approaches, consult the [testing overview](docs/vscode-testing-overview.md). Distinguish extension-host/API testing from evidence that actual IDE and Copilot UI interactions work.

## GitHub operations

For creating GitHub issues, use the repository-local [create-github-issue skill](.agents/skills/create-github-issue/SKILL.md).

For creating pull requests, use the repository-local [create-pull-request skill](.agents/skills/create-pull-request/SKILL.md), which uses the repository's pull request template.

Use the GitHub CLI (`gh`) for this repository's GitHub operations, including issues, pull requests, reviews, and Actions runs. Run commands from this checkout so `gh` targets its GitHub remote; use `--repo jimthompson5802/ide-tester` when an explicit target is needed. Use `git` for local version-control operations.

## Implementation boundaries

The initial implementation targets VS Code and GitHub Copilot Chat on macOS. Begin with M1-00 feasibility: demonstrate UI interaction, response-completion detection, test-instance isolation, and authentication reuse before building the main harness. Record observed behavior separately from assumptions and unresolved decisions.

Work in the reviewable slices defined by the backlog. Complete the authorized slice and present validation evidence at its developer checkpoint. Honor approvals already given in the conversation; obtain developer validation before advancing through an unapproved slice or milestone gate.

Apply YAGNI: add dependencies, tools, and abstractions only for current acceptance criteria. Windows setup and implementation begin in Milestone 2; IntelliJ support begins in Milestone 3; release monitoring and scheduling belong to Milestone 5.

Keep contracts, logical tests, orchestration, and verification platform-neutral. Isolate platform-specific automation and imports. File and extension adapters target the same IDE session; the IDE adapter owns launch and process cleanup. Consult the proposal's contract rules when changing these boundaries.

## Technical environment

These requirements come from the Milestone 0 setup guide and the proposal's technology choices. They describe the intended environment, not a verified installation on this host.

- **Environment manager:** Use `uv` to install prebuilt Python and manage the repository-local `.venv`. Milestone 0 specifies Astral's standalone uv installation; no uv version is pinned yet.
- **Python:** Use **3.12** as the initial baseline within the proposal's Python 3.12+ requirement. Record the resolved patch version for reproducibility.
- **Interpreter:** Use `.venv/bin/python` explicitly during standalone setup and select it as the editor interpreter. Keep the system Python unchanged.
- **Project lifecycle:** Until `pyproject.toml` exists, use the standalone environment workflow rather than `uv sync`. Project initialization, dependency declarations, and version locking belong to the Milestone 1 foundation.
- **Python pin:** `.python-version` is currently ignored and remains local during Milestone 0. When the foundation establishes the shared version, remove that ignore entry and commit the agreed pin with the package configuration.
- **Host tooling:** Initially macOS with Git, VS Code, and the `code` CLI available. Record macOS version, architecture, and installed tool versions. Copilot installation, manual sign-in, dedicated profiles, and observed automation permissions belong to Milestone 1.

Known Python package choices are not yet declared or version-locked:

M0-01 baseline inspection on 2026-10-20 verified macOS 15.7.9 (24G830),
`uname -m` reporting `x86_64`, and working Git 2.54.0. Neither `.venv` nor
`.python-version` exists. Existing uv 0.13.1 runs, but its symlink and version
output identify a Homebrew installation reporting `aarch64-apple-darwin`.
Resolve this installation against the standalone requirement before M0-02
mutation; Python compatibility remains unverified. No software was installed.
See [M0-01 results](docs/implementation-plans/M0-01.md#execution-results).
Developer validated M0-01 on 2026-10-20; later setup remains outside this execution.

| Package / capability | Status and intended use |
| --- | --- |
| `pytest` | Planned test runner for assertions, parametrization, and JUnit XML reporting. |
| PyObjC | Candidate for macOS Accessibility automation; requires feasibility evidence and compatible prebuilt wheels for the target Python, macOS, and architecture. |
| `pyautogui` | Candidate fallback for keyboard/mouse actions only when needed and validated on the target platform. |
| YAML parsing | Required configuration capability; the references have not selected a Python parser package. |

Install harness and automation packages only when justified by current Milestone 1 work; Milestone 0 installs none of them.

Use prebuilt applications and Python, plus pure-Python packages or compatible prebuilt wheels, with dependency source builds disabled. Reconsider dependencies that require native compilation; compiler toolchain installation is outside this project's workflow.

## Isolation

Run GUI automation sequentially against dedicated persistent test profiles and fresh disposable workspaces. Preserve authenticated profiles, target only test-owned processes/windows, and constrain cleanup to harness-owned paths.

Authentication is established manually. Never automate passwords or MFA, extract credentials, or copy authenticated profiles between hosts. Classify expired authentication as blocked. Keep tokens, private conversations, and unrelated desktop content out of committed evidence and diagnostics.

## Validation and documentation

Maintain this file as work progresses: update environment requirements, selected packages, validated versions, and working commands when implementation or feasibility evidence establishes them. Keep these entries consistent with the reference documents; once package metadata and a lockfile exist, use them as the source of truth for exact dependency versions.

For documentation changes, check relative links and consistency across affected specifications and the README. Preserve the distinction between proposed behavior and verified results.

Once code exists, use the applicable story's acceptance criteria to select checks. Test non-GUI logic independently; validate GUI behavior on the target host. Verify observable outcomes: an IDE edit must be checked independently on disk, and a Copilot response must be fresh and complete. Report blocked prerequisites separately from functional failures and harness errors.

**Stop after four unsuccessful fix rounds for the same error and ask the developer for guidance.** A round consists of applying a proposed fix and rerunning the check that exposed the error. Report the error, the four attempted fixes, their results, and relevant diagnostic paths. Do not begin a fifth round or work around the failing requirement until the developer provides guidance.

Report checks actually performed, their results, and remaining limitations. Until project tooling exists, state that runtime tests are unavailable rather than presenting proposed CLI examples as working commands.
