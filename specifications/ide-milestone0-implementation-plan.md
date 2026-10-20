# Milestone 0 — Technical Implementation Plan

**Status:** Proposed execution plan; no setup commands have been run as part of writing this document. Unchecked tasks are pending, not evidence of a missing installation.  
**Scope:** Prepare one macOS checkout for Milestone 1 using prebuilt software, the existing Homebrew uv installation, Python 3.12, and a repository-local `.venv`.
**Source of requirements:** [Milestone 0 environment setup](ide-milestone0-environment-setup.md). See also the [README](../README.md), [harness proposal](ide-copilot-smoke-harness-proposal.md), and [Milestone 1 backlog](ide-copilot-milestone1-user-stories.md).

This is a documentation deliverable. Executing this plan is separate work. Commands below are planned operator steps from the setup guide, not verified working commands on this host. Run them as the normal user from the checkout root unless stated otherwise.

## Delivery approach and boundaries

Execute phases 1–5 in order. Each phase has an exit check that must pass before dependent work proceeds. Existing compatible installations may satisfy a task after verification; do not reinstall or upgrade tools merely to check a box. Record an actual installation or update separately from verification of an existing tool.

Milestone 0 does not initialize a Python project, implement the harness, install Python libraries, or prove IDE automation. Do not create `pyproject.toml`, `uv.lock`, source packages, tests, or shared Python pins. Do not install pytest, PyObjC, pyautogui, a YAML parser, Copilot, IntelliJ, compiler tools, SDKs, Xcode, or Apple's Command Line Tools for this work. Existing compiler tools need not be removed.

Dedicated IDE profiles, disposable workspaces, manual Copilot authentication, GUI automation permissions, and feasibility probes belong to M1-00. Windows setup belongs to Milestone 2.

## Phase 1 — Establish the host and checkout baseline

**User story M0-01:** As a developer preparing the test host, I want a documented host and checkout baseline so that setup targets the intended environment and preserves existing work.

**Acceptance criteria:**

- [ ] Local evidence identifies the checkout root, macOS version, architecture, and initial working-tree state.
- [ ] `git --version` succeeds; any Git installation used an approved prebuilt distribution without adding developer tools.
- [ ] Ignore checks identify rules for `.venv/` and `.python-version`, and tracked-file checks return neither path.
- [ ] Existing environment files and uv availability have been inspected, and unrelated work remains intact.
- [ ] An ignored local evidence location is established; unresolved prerequisites are recorded as blockers and prevent dependent setup.

**Prerequisites:** A macOS host, terminal access, network access for downloads, and this checkout.

- [ ] Read the setup guide and confirm that execution is limited to Milestone 0.
- [ ] Open a terminal at the intended checkout root and record the resolved checkout location locally.
- [ ] Inspect existing working-tree changes before editing documentation; preserve unrelated work.
- [ ] Record macOS version and architecture:

  ```bash
  pwd -P
  sw_vers
  uname -m
  ```

- [ ] Verify Git availability with `git --version`.
- [ ] If Git is missing or macOS offers developer-tool installation, decline that installation and obtain an organization-approved prebuilt Git distribution. Record the selected distribution and version. Treat an unavailable approved distribution as a blocked prerequisite.
- [ ] Once Git works, record `git status --short` and inspect `.gitignore`.
- [ ] Confirm that `.venv/` and `.python-version` are ignored:

  ```bash
  git check-ignore -v .venv/ .python-version
  git ls-files -- .venv .python-version
  ```

  The first command should identify both ignore rules; the second should return no tracked paths. An ignore rule alone does not untrack an existing file. Investigate any discrepancy before proceeding; do not silently remove tracked files.

- [ ] Check whether `.venv`, `.python-version`, and a uv installation already exist. Preserve existing contents until their compatibility and ownership are understood.
- [ ] Create local setup notes, for example `reports/milestone0-setup.local.md`. If using that location, first verify it is ignored with `git check-ignore -v reports/milestone0-setup.local.md`; create the directory only if needed. Record commands, results, timestamps, and blockers without credentials or unrelated host details.

**Exit check:** Host identity, checkout identity, Git availability, ignore rules, and existing local environment state are documented. Missing prerequisites are resolved or explicitly marked blocked.

## Phase 2 — Verify existing uv

**User story M0-02:** As a developer, I want to verify the existing uv installation so that subsequent setup can reuse it.

**Developer decision (2026-10-20):** Reuse existing Homebrew uv; no additional installation is needed. This supersedes the earlier standalone-only requirement locally. The external issue has not been updated.

**Acceptance criteria:**

- [ ] In the native arm64 terminal used for subsequent setup, bare `uv` resolves to the intended existing Homebrew executable and `uv --version` succeeds.
- [ ] Evidence records terminal architecture, resolved executable path, Homebrew provenance, version, and reuse outcome.
- [ ] No uv installation, update, uninstall, native compilation, or added compiler tools occurs.
- [ ] Any resolution failure remains an explicit blocker; existing software and unrelated work are preserved.

**Dependency:** Phase 1 complete.

Follow the [M0-02 verification plan](../docs/implementation-plans/M0-02.md). Check `uname -m`, `command -v uv`, `type -a uv`, and `uv --version` in the intended native terminal. Record actual results and reuse provenance. Report failures before changing configuration. No installer download or additional binary is required.

**Exit check:** Native-terminal uv resolution, provenance, version, and reuse are documented and presented for developer validation before subsequent setup.

## Phase 3 — Install Python and create the standalone environment

**User story M0-03:** As a developer, I want an isolated Python 3.12 environment in this checkout so that later feasibility work can use a known interpreter without changing system Python.

**Acceptance criteria:**

- [ ] `.venv/bin/python` reports Python 3.12, and evidence records its exact patch version and existing Homebrew prebuilt provenance (developer-approved Homebrew requirement).
- [ ] Interpreter assertions pass: `sys.prefix != sys.base_prefix`, and the resolved `sys.prefix` equals this checkout's resolved `.venv` path.
- [ ] `.python-version` contains `3.12`; it and `.venv/` remain ignored and untracked.
- [ ] Existing environment conflicts were resolved without silently overwriting unrelated state, and system Python remains unchanged.
- [ ] No harness or automation packages, project metadata, or lockfile were introduced, and setup did not use `uv sync` or native source builds.

**Dependency:** Phase 2 complete and developer validated.

**Developer decision (2026-10-20):** Reuse `/opt/homebrew/bin/python3.12`, observed as Python 3.12.15 arm64. Do not download another Python. Follow the detailed [M0-03 plan](../docs/implementation-plans/M0-03.md); issue #4 has been aligned with this approved replacement for its original uv-managed provenance criterion.

Before running these commands, follow the [M0-03 preflight and verification controls](../docs/implementation-plans/M0-03.md): verify a native arm64 execution context, block conflicting inherited uv settings and nonempty `PYTHONPATH`/`PYTHONHOME`, and verify disabled user-site access. An existing newer Homebrew 3.12.x patch is acceptable if all checks pass. Preserve partial artifacts and failure evidence without automatic rollback. Execution requires separate authorization.

- [ ] Inspect an existing `.python-version`, if present. Confirm that changing its local value to `3.12` will not overwrite unrelated setup intentions; resolve conflicts before changing it.
- [ ] Verify the selected Homebrew Python and set the local minor-version pin:

  ```bash
  /opt/homebrew/bin/python3.12 --version
  uv python pin --no-config --offline --no-python-downloads --no-managed-python 3.12
  ```

- [ ] Confirm that `.python-version` contains `3.12` and remains ignored. The minor-version pin is not an exact reproducibility lock.
- [ ] If `.venv` does not exist, create it:

  ```bash
  uv venv --no-config --offline --no-python-downloads --no-managed-python --python /opt/homebrew/bin/python3.12 .venv
  ```

- [ ] If `.venv` exists, inspect its interpreter using the checks below before deciding whether it can be reused. Do not delete or overwrite an incompatible environment automatically. Preserve it and agree on replacement before recreating the required `.venv` path.
- [ ] Verify Python 3.12, virtual-environment isolation, and checkout ownership:

  ```bash
  .venv/bin/python --version
  .venv/bin/python -c 'import sys; print(sys.executable); assert sys.version_info[:2] == (3, 12); assert sys.prefix != sys.base_prefix'
  .venv/bin/python -c 'import pathlib, sys; expected = pathlib.Path(".venv").resolve(); print(sys.prefix); assert pathlib.Path(sys.prefix).resolve() == expected'
  ```

- [ ] Record the resolved Python patch version, interpreter path, and verification results. A later `3.12` installation may resolve a different patch; use the recorded version when comparing environments.
- [ ] Use `.venv/bin/python` explicitly for remaining interpreter checks. Do not depend on shell activation or a system `python` command.
- [ ] Confirm that this phase installed no harness or automation packages and introduced no package configuration or lockfile. Do not use `uv sync` while there is no uv project.
- [ ] Recheck Git ignore behavior and working-tree status so the local environment and local pin cannot accidentally become part of the documentation change.

**Exit check:** A prebuilt Python 3.12 interpreter runs inside this checkout's `.venv`, its patch version is recorded, and the environment and pin remain local. System Python is unchanged.

## Phase 4 — Establish VS Code and editor interpreter selection

**User story M0-04:** As a developer, I want VS Code and its CLI available with a recorded editor interpreter choice so that I can edit the project using the prepared environment.

**Acceptance criteria:**

- [ ] VS Code opens the checkout, and its prebuilt application is compatible with the recorded host architecture.
- [ ] In a fresh terminal, `command -v code` resolves the intended installation and `code --version` succeeds; the path and full version output are recorded.
- [ ] The editor selects this checkout's `.venv/bin/python`, or evidence explicitly records that selection was deferred because the optional Python editor UI is unavailable.
- [ ] Any checkout-specific editor settings remain local and ignored.
- [ ] This phase introduces no Copilot configuration, authentication, dedicated test profiles, or automation permissions.

**Dependency:** Phase 3 complete; host architecture recorded in Phase 1.

- [ ] Check whether VS Code is installed and whether `command -v code` succeeds. A missing CLI does not by itself mean the application is absent.
- [ ] If needed, install a prebuilt VS Code application following the official [macOS setup instructions](https://code.visualstudio.com/docs/setup/mac), choosing a build compatible with the recorded architecture.
- [ ] If the CLI is absent, open VS Code's Command Palette and run **Shell Command: Install 'code' command in PATH**.
- [ ] Open a fresh terminal, return to the checkout root, and verify:

  ```bash
  command -v code
  code --version
  ```

- [ ] Record the CLI path and full version output, including build/architecture information when supplied. Investigate unexpected resolution to another installation.
- [ ] Open the checkout in VS Code and select its `.venv/bin/python` as the editor interpreter using the available Python interpreter-selection UI.
- [ ] If that UI is unavailable, record the limitation. A Python editor extension is optional in Milestone 0; decide whether to install one for editing convenience or defer editor selection rather than treating it as a harness dependency. The explicit interpreter checks remain required.
- [ ] Keep editor settings local and confirm they are ignored if written under `.vscode/`.
- [ ] Record whether interpreter selection was completed or deferred. Do not configure Copilot, authentication, test profiles, or automation permissions during this phase.

**Exit check:** VS Code and its CLI are available, version evidence is captured, and editor interpreter selection has a recorded outcome. Any optional editor limitation is explicit.

## Phase 5 — Validate, document, and present the milestone checkpoint

**User story M0-05:** As the developer reviewing Milestone 0, I want consolidated setup evidence and an explicit acceptance checkpoint so that I can assess readiness before authorizing Milestone 1 work.

**Acceptance criteria:**

- [ ] Final checks from a fresh terminal pass for Git, uv, Python 3.12 isolation, the VS Code CLI, and ignored/untracked local environment files.
- [ ] The evidence record contains actual versions, verification outcomes, installation actions, and any optional deferrals; required prerequisites have no unresolved blockers.
- [ ] Recorded setup actions confirm that no compiler tools were added and no native source builds occurred.
- [ ] Relevant documentation and `AGENTS.md` reflect established facts, local links resolve, and the reviewed diff excludes private evidence and unrelated changes.
- [ ] The review states that runtime harness tests are unavailable and that Milestone 0 does not establish GUI or Copilot feasibility.
- [ ] Developer acceptance and its date are recorded before advancing to Milestone 1; any subsequent work follows M1-00 authorization and review gates.

**Dependency:** Required checks from Phases 1–4 pass.

- [ ] From a fresh terminal at the checkout root, run the final availability and isolation checks:

  ```bash
  git --version
  command -v uv
  uv --version
  .venv/bin/python --version
  .venv/bin/python -c 'import pathlib, sys; expected = pathlib.Path(".venv").resolve(); print(sys.executable); assert sys.version_info[:2] == (3, 12); assert sys.prefix != sys.base_prefix; assert pathlib.Path(sys.prefix).resolve() == expected'
  command -v code
  code --version
  git check-ignore -v .venv/ .python-version
  git ls-files -- .venv .python-version
  git status --short
  ```

- [ ] Compare the results with the completion checklist in the setup guide. Resolve failures and rerun the affected checks; report unresolved prerequisites as blocked.
- [ ] Record that no compiler tools were installed and no native source builds occurred during setup. Base this statement on the actions actually performed; it does not assert that the host has no pre-existing toolchain.
- [ ] Complete the evidence record below. Keep raw local output private; include only sanitized, relevant facts in repository documentation.
- [ ] Update `AGENTS.md` and affected setup documentation with established environment requirements, actual validated versions, and working commands where evidence supports them. Keep observed results distinct from design targets; exact dependency metadata remains deferred to Milestone 1.
- [ ] Check relative links and consistency across any changed specifications, `AGENTS.md`, and the README. Review the diff for accidental environment files, personal paths, tokens, or unrelated changes.
- [ ] Present the completed checklist, evidence, blockers, and optional deferrals for developer validation. Do not mark the milestone complete while required prerequisites remain blocked.
- [ ] Record developer acceptance before advancing to Milestone 1. The next work is planning/executing M1-00 within its authorization and review gates; this plan does not authorize the main harness or M1-01.

**Exit check:** All required Milestone 0 criteria have observed evidence, documentation reflects that evidence, and the developer has validated the milestone.

### Evidence record to complete during execution

| Item | Required record |
| --- | --- |
| Execution context | Date, macOS version, architecture; checkout location kept local |
| Git | Version, availability result, installation source if installed |
| uv | Existing Homebrew installation provenance, version, resolved path, reuse outcome |
| Python | Exact 3.12 patch version, selected Homebrew provenance and architecture, virtual-environment assertions |
| Local environment | `.venv` ownership result, local `3.12` pin, ignore and tracked-file checks |
| VS Code | CLI location and version output, installation/reuse outcome |
| Editor | Interpreter-selection result or explicit optional deferral |
| Build policy | Actions performed; confirmation of no added toolchain or source builds |
| Exceptions | Failed command, sanitized symptom, corrective action, recheck result or blocker |
| Developer checkpoint | Acceptance decision and date; remaining limitations |

## Failure handling and recovery

| Condition | Action and resumption point |
| --- | --- |
| Missing Git or developer-tool prompt | Use an approved prebuilt Git distribution; resume Phase 1 verification. |
| uv or code not found after installation | Apply the installer/VS Code PATH instructions and verify in a fresh terminal; resume the affected phase. |
| Download blocked by network policy | Use approved network configuration; retain completed phases and retry only the blocked step. |
| Existing pin or environment conflicts | Preserve it, document the conflict, and resolve replacement before mutation; resume Phase 3. |
| Interpreter assertions fail | Inspect the selected environment and Python version; resolve the cause before continuing. |
| Installation attempts a source build | Stop; reconsider the distribution or approach. Do not install a compiler to proceed. |
| Ignore or tracked-file checks fail | Resolve repository hygiene without deleting unrelated work; repeat the checks before acceptance. |

Do not clean up authenticated profiles, personal projects, existing installations, or unrelated environments. A failed setup attempt does not justify broad deletion or uninstalling shared tools.

## Validation limits

Milestone 0 checks establish tool availability and Python isolation. Runtime harness tests are unavailable because the harness and its test tooling do not exist. These checks do not establish Copilot authentication, UI automation feasibility, IDE test-instance isolation, response completion, or unattended reliability; those require Milestone 1 evidence.
