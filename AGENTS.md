# Repository instructions

## Current state

This repository contains design documents and an M1-00 prerequisite probe for an IDE smoke-test harness. There is no implemented harness, Python project configuration, or runnable test suite yet. Treat proposed commands, source layouts, APIs, and configuration schemas as design targets until implementation establishes them.

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

These requirements come from the Milestone 0 setup guide and the proposal's technology choices. Python environment observations are recorded below; remaining tooling and harness requirements are design targets.

- **Environment manager:** Use `uv` to manage the repository-local `.venv`. Reuse the existing Homebrew uv installation per the developer's 2026-10-20 direction; no additional uv installation is needed and no uv version is pinned yet.
- **Python:** Use **3.12** as the initial baseline. The developer selected existing `/opt/homebrew/bin/python3.12` on 2026-10-20; M0-02 read-only checks observed Python 3.12.15 arm64. Reuse it as the explicit base for uv environment creation; do not download another Python. M0-03 verified Python 3.12.15 arm64 and checkout-local environment isolation on 2026-10-20; developer validated M0-03 on 2026-10-20. See [M0-03 plan](docs/implementation-plans/M0-03.md).
- **Interpreter:** Use `.venv/bin/python` explicitly during standalone setup and select it as the editor interpreter. Keep the system Python unchanged.
- **Project lifecycle:** Until `pyproject.toml` exists, use the standalone environment workflow rather than `uv sync`. Project initialization, dependency declarations, and version locking belong to the Milestone 1 foundation.
- **Python pin:** `.python-version` is currently ignored and remains local during Milestone 0. When the foundation establishes the shared version, remove that ignore entry and commit the agreed pin with the package configuration.
- **Host tooling:** Initially macOS with Git, VS Code, and the `code` CLI available. Record macOS version, architecture, and installed tool versions. Copilot installation, manual sign-in, dedicated profiles, and observed automation permissions belong to Milestone 1.

Known Python package choices are not yet declared or version-locked:

M0-01 baseline inspection on 2026-10-20 verified macOS 15.7.9 (24G830),
`uname -m` reporting `x86_64`, and working Git 2.54.0. At that baseline, neither `.venv` nor
`.python-version` existed. Existing uv 0.13.1 runs, but its symlink and version
output identify a Homebrew installation reporting `aarch64-apple-darwin`.
The developer selected reuse of this installation on 2026-10-20; developer-provided
native arm64 terminal output verified its resolution and version under M0-02. Python
environment compatibility was unverified at that baseline. No software was installed.
See [M0-01 results](docs/implementation-plans/M0-01.md#execution-results).
Developer validated M0-01 on 2026-10-20; later setup remains outside this execution.

Architecture follow-up on 2026-10-20 established an Apple Silicon host and
Rosetta translation for this agent session. The developer reports a separate
native arm64 terminal. M0-02 verification on 2026-10-20 reconfirmed Homebrew
uv 0.13.1 and its arm64 executable. An attempted arm64 login shell still
reported `uname -m=x86_64`. Subsequent developer-provided output confirms
`arm64` in the intended native terminal and an existing alias to the same
Homebrew uv executable, with successful uv 0.13.1 version output. M0-02
verification is complete and developer validated on 2026-10-20. Preserve/reuse
uv without installation or shell changes; M0-03 results follow. See [M0-02 observations](docs/implementation-plans/M0-02.md#scope-dependencies-and-current-state).

| Package / capability | Status and intended use |
| --- | --- |
| `pytest` | Planned test runner for assertions, parametrization, and JUnit XML reporting. |
| PyObjC | Candidate for macOS Accessibility automation; requires feasibility evidence and compatible prebuilt wheels for the target Python, macOS, and architecture. |
| `pyautogui` | Candidate fallback for keyboard/mouse actions only when needed and validated on the target platform. |
| YAML parsing | Required configuration capability; the references have not selected a Python parser package. |

Install harness and automation packages only when justified by current Milestone 1 work; Milestone 0 installs none of them.

Use prebuilt applications and Python, plus pure-Python packages or compatible prebuilt wheels, with dependency source builds disabled. Reconsider dependencies that require native compilation; compiler toolchain installation is outside this project's workflow.

M0-03 review on 2026-10-20 observed the current agent context and selected Python reporting arm64. Recheck architecture in the execution context; a verified native agent may execute separately authorized setup. Follow the [M0-03 plan](docs/implementation-plans/M0-03.md) for approved patch tolerance, offline uv commands, inherited-setting checks, isolation checks, and partial-failure preservation. M0-03 execution on 2026-10-20 created the ignored local `3.12` pin and unseeded `.venv` using those offline commands. Independent checks passed for Python 3.12.15 arm64, selected Homebrew base identity, checkout prefix, disabled system/user site packages, and zero installed distributions. The sandbox initially denied uv cache locks; identical commands succeeded after approved escalation. Developer validated M0-03 on 2026-10-20. Subsequent M0-04 validation and M0-05 final checks are recorded below.

## Isolation

M0-04 execution on 2026-10-20 verified the existing VS Code 1.135.0
application executable as arm64 and its bundled CLI version output as arm64.
Bare `code` did not resolve in the agent shell. Subsequent developer-terminal
output resolves `code` to `/usr/local/bin/code` and reports the matching version,
commit and arm64 architecture. The CLI symlink targets the inspected application.
The developer confirmed fresh-terminal provenance, visible checkout/README opening,
and satisfaction of editor interpreter selection or the permitted unavailable-UI
deferral; the combined confirmation does not distinguish the interpreter outcomes. Independent checkout Python
3.12.15 isolation checks passed again. No editor settings or installations were
changed. See [M0-04 results](docs/implementation-plans/M0-04.md#execution-results--2026-10-20).
M0-04 is complete and developer validated on 2026-10-20.
M0-05 final checks on 2026-10-20 passed in a fresh native arm64 agent login
PTY: Git 2.54.0, Homebrew uv 0.13.1, Python 3.12.15 with checkout isolation,
and VS Code CLI 1.135.0 arm64. Bare `code` now resolves in that context;
its version command exits 0 with the previously observed `task_name_for_pid`
diagnostic. Local environment, pin, settings and evidence remain ignored and
untracked. No software or compiler tools were installed and no source builds
occurred during Milestone 0. See [M0-05 results](docs/implementation-plans/M0-05.md#execution-results--2026-10-20).
Developer accepted Milestone 0 on 2026-10-20; M1-00 requires separate authorization.

M1-00 execution was authorized on 2026-10-20 and Phase 1 is partial; see the
[execution report](docs/reports/M1-00-phase1.md) before resuming feasibility work.
The binary-only PyObjC installation/import checks passed on Python 3.12.15 arm64;
use the [spike requirements and commands](scripts/spikes/m1_00/README.md) for exact
tested dependencies. Host execution reports Accessibility trusted and a visible
graphical session; sandbox checks report different visibility. VS Code 1.135.0
bundles GitHub.copilot-chat 0.63.0. Attended probes established scoped lifecycle,
regular-window coexistence, Chat toggle, Ask selection via the Command Palette,
and unsent keyboard input. The diagnosed input false negative requires verified
`editor.accessibilitySupport=on` for editor-text readback in this tested setup;
`AXManualAccessibility` exposes the app tree but alone did not establish reliable
editor readback. Test-profile settings were restored after diagnosis. Authentication
and response completion remain unverified; Phase 1 validation is required before
Phase 2. No main harness exists.

Run GUI automation sequentially against dedicated persistent test profiles and fresh disposable workspaces. Preserve authenticated profiles, target only test-owned processes/windows, and constrain cleanup to harness-owned paths.

Authentication is established manually. Never automate passwords or MFA, extract credentials, or copy authenticated profiles between hosts. Classify expired authentication as blocked. Keep tokens, private conversations, and unrelated desktop content out of committed evidence and diagnostics.

## Validation and documentation

Maintain this file as work progresses: update environment requirements, selected packages, validated versions, and working commands when implementation or feasibility evidence establishes them. Keep these entries consistent with the reference documents; once package metadata and a lockfile exist, use them as the source of truth for exact dependency versions.

For documentation changes, check relative links and consistency across affected specifications and the README. Preserve the distinction between proposed behavior and verified results.

Once code exists, use the applicable story's acceptance criteria to select checks. Test non-GUI logic independently; validate GUI behavior on the target host. Verify observable outcomes: an IDE edit must be checked independently on disk, and a Copilot response must be fresh and complete. Report blocked prerequisites separately from functional failures and harness errors.

**Stop after four unsuccessful fix rounds for the same error and ask the developer for guidance.** A round consists of applying a proposed fix and rerunning the check that exposed the error. Report the error, the four attempted fixes, their results, and relevant diagnostic paths. Do not begin a fifth round or work around the failing requirement until the developer provides guidance.

Report checks actually performed, their results, and remaining limitations. Until project tooling exists, state that runtime tests are unavailable rather than presenting proposed CLI examples as working commands.
