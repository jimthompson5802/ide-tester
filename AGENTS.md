# Repository instructions

## Current state

The `vscode-smoke-tester` branch contains a standalone TypeScript tester under `smoke/`, with verified compilation, 41 non-GUI tests, editing-only, two-turn mocked Chat-only and combined GUI commands against VS Code 1.135.0 / Copilot Chat 0.63.0 on macOS arm64. The foundation, selected suites and final handoff are developer accepted; [the replacement plan](docs/vscode-smoke-tester-plan.md) is complete. For execution or maintenance, read [current usage and compatibility limits](smoke/README.md). The optional [real Copilot backend plan](docs/implementation-plans/real-chat-backend.md) has developer-validated slice 1 and implemented, non-GUI-verified slice 2 pending developer validation. Real setup, two-turn Chat, combined mode and signed-out blocking remain GUI-unverified and require separate GUI authorization. Further scope requires developer direction. The previous Python harness, tests, experiments, configuration, and execution reports were removed. Historical specifications and the root uv environment remain.

Retained historical documents preserve old decisions, completion records, commands, and approvals. Treat them as reference material pending review, not current functionality or authorization. M1-05 remains on hold; M1-06 and replacement design/implementation require explicit developer direction. This reset does not accept any outstanding milestone or slice gate.

## Read before working

- For current scope, retained artifacts, and environment limitations, read [README.md](README.md).
- For environment work, read the historical [Milestone 0 setup guide](specifications/ide-milestone0-environment-setup.md) and inspect current `pyproject.toml`, `uv.lock`, and `.python-version`.
- For architecture or milestone planning, read the historical [harness proposal](specifications/ide-copilot-smoke-harness-proposal.md). Review its assumptions before adopting them.
- For a selected Milestone 1 story, read the [historical backlog](specifications/ide-copilot-milestone1-user-stories.md) and applicable [implementation plan](docs/implementation-plans/). Historical acceptance does not establish current implementation.
- For VS Code testing approaches, read the [testing overview](docs/vscode-testing-overview.md) and [smoke testing research](docs/research/vscode-tester-approach.md). Distinguish extension-host/API tests from evidence that real IDE and Copilot UI interactions work.

Documentation work stays within its requested scope; it does not initiate setup or implementation.

## GitHub operations

Use `gh` for this repository's GitHub operations, from this checkout or with `--repo jimthompson5802/ide-tester`. Use `git` for local version control.

For issue creation, use the repository-local [create-github-issue skill](.agents/skills/create-github-issue/SKILL.md). For pull requests, use [create-pull-request](.agents/skills/create-pull-request/SKILL.md) and the repository PR template. Publish only when requested.

## Commit messages

Use Conventional Commits: `<type>(<optional scope>): <description>`. Select `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, or `chore` based on the change. Use a concise imperative description. Mark breaking changes with `!` and explain them in a `BREAKING CHANGE:` footer.

## Implementation boundaries

Authorize replacement implementation separately from planning. Work in approved reviewable slices and obtain explicit developer validation before advancing through an unapproved phase, slice, or milestone gate. Honor approvals already given for the applicable work.

Apply YAGNI. Add dependencies, tooling, abstractions, or platform support only for approved current acceptance criteria. The historical macOS-first, Windows, IntelliJ, scheduling, and adapter designs remain proposals until selected for replacement work.

## Technical environment

Preserve the existing `.venv/`, `.vscode/`, `pyproject.toml`, `uv.lock`, and `.python-version`. These were retained unchanged during the reset. Metadata and installed entry points may reference deleted source; installation and CLI commands are unavailable until a replacement package is approved and implemented.

Use uv for the repository-local environment. Reuse existing Homebrew uv and `/opt/homebrew/bin/python3.12`; do not install another uv or download Python. Python 3.12.15 arm64 was historically qualified. Recheck architecture in the actual execution context before authorized environment work, and use `.venv/bin/python` explicitly. Keep system Python unchanged.

Use `pyproject.toml` and `uv.lock` as the sources of truth for declared dependencies and exact versions. For separately authorized dependency work, preserve extra distributions with `--inexact`, install compatible wheels with source builds and Python downloads disabled, and install local pure-Python source offline only after its backend is available. Plain `uv sync` can prune preserved packages. Report-local uv caches and qualification environments were intentionally removed; do not assume offline artifacts are still available. Compiler/toolchain installation is outside this workflow.

## Isolation

Preserve all existing dedicated profiles and their markers, plus `reports/m1-03/preserved-workspaces/`. Keep `.vscode/` settings unchanged unless separately requested. Inspect any retained environment references before proposing changes.

GUI automation requires separate authorization, an unlocked exclusively reserved desktop, sequential runs, dedicated persistent test profiles, and disposable workspaces. Target only test-owned processes/windows and constrain cleanup to explicitly owned paths. Preserved profiles and saved workspace data do not automatically become replacement-harness resources.

Authentication is manual. Never automate passwords or MFA, extract credentials, or copy authenticated profiles between hosts. Classify expired authentication as blocked. Keep tokens, private conversations, and unrelated desktop content out of committed evidence and diagnostics.

## Validation and documentation

Keep these instructions and the README consistent with verified implementation and environment changes. Preserve the distinction between design targets, historical observations, and current verified behavior. Check relative links after documentation changes.

Use TDD for software features and bug fixes: derive observable tests from acceptance criteria, confirm the intended failure, implement the minimum passing change, and run relevant regression checks. Documentation-only changes do not require runtime tests. Current non-GUI tests live under `smoke/tests/`; do not present historical Python test results or passing non-GUI tests as current GUI checks.

Test non-GUI logic independently. Validate GUI outcomes on the authorized target host; define observable manual checks before implementation when automation is unsuitable. Missing prerequisites do not establish a pass. Independently verify IDE edits on disk and require fresh complete Copilot responses. Report blocked prerequisites separately from functional failures and harness errors.

**Stop after four unsuccessful fix rounds for the same error and ask the developer for guidance.** A round is a proposed fix followed by rerunning the exposing check. Report the error, all four attempts and results, and diagnostic paths. Do not begin a fifth round or work around the requirement without guidance.

Report checks actually performed and their limitations. Preserve local environments and private data during branch changes; ignored files are shared across branches in this checkout.
