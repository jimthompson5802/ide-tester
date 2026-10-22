# Repository instructions

## Project overview

This repository contains a standalone TypeScript VS Code smoke tester under `smoke/`. Retained Python environment files and historical planning documents have separate preservation and authorization rules below.

## Start here

- For current scope, retained artifacts, and environment limitations, read [README.md](README.md).
- For work under `smoke/`, read [tester instructions](smoke/AGENTS.md); they add tester-specific guidance to these repository-wide rules.
- For environment work, read the historical [Milestone 0 setup guide](specifications/ide-milestone0-environment-setup.md) and inspect current `pyproject.toml`, `uv.lock`, and `.python-version`.
- For architecture or milestone planning, read the historical [harness proposal](specifications/ide-copilot-smoke-harness-proposal.md). Review its assumptions before adopting them.
- For a selected Milestone 1 story, read the [historical backlog](specifications/ide-copilot-milestone1-user-stories.md) and applicable [implementation plan](docs/implementation-plans/). Historical acceptance does not establish current implementation.
- For VS Code testing approaches, read the [testing overview](docs/vscode-testing-overview.md) and [smoke testing research](docs/research/vscode-tester-approach.md). Distinguish extension-host/API tests from evidence that real IDE and Copilot UI interactions work.

## Working rules

Documentation work stays within its requested scope; it does not initiate setup or implementation.

Apply YAGNI. Add dependencies, tooling, abstractions, or platform support only for approved current acceptance criteria. The historical macOS-first, Windows, IntelliJ, scheduling, and adapter designs remain proposals until selected for replacement work.

### Preserved local resources

Preserve all existing dedicated profiles and their markers, plus `reports/m1-03/preserved-workspaces/`. Keep `.vscode/` settings unchanged unless separately requested. Inspect retained environment references before proposing changes. Preserve local environments and private data during branch changes; ignored files are shared across branches in this checkout.

### Preserved Python environment

Preserve the existing `.venv/`, `.vscode/`, `pyproject.toml`, `uv.lock`, and `.python-version`. Metadata and installed entry points may reference deleted source; installation and CLI commands are unavailable until a replacement package is approved and implemented.

Use uv for the repository-local environment. Reuse existing Homebrew uv and `/opt/homebrew/bin/python3.12`; do not install another uv or download Python. Python 3.12.15 arm64 was historically qualified. Recheck architecture in the actual execution context before authorized environment work, and use `.venv/bin/python` explicitly. Keep system Python unchanged.

Use `pyproject.toml` and `uv.lock` as the sources of truth for declared dependencies and exact versions. For separately authorized dependency work, preserve extra distributions with `--inexact`, install compatible wheels with source builds and Python downloads disabled, and install local pure-Python source offline only after its backend is available. Plain `uv sync` can prune preserved packages. Report-local uv caches and qualification environments were intentionally removed; do not assume offline artifacts are still available. Compiler/toolchain installation is outside this workflow.

## Validation

Keep these instructions and the README consistent with verified implementation and environment changes. Preserve the distinction between design targets, historical observations, and current verified behavior. Check relative links after documentation changes.

Use TDD for software features and bug fixes: derive observable tests from acceptance criteria, confirm the intended failure, implement the minimum passing change, and run relevant regression checks. Documentation-only changes do not require runtime tests. Historical Python test results do not establish current behavior.

Define observable manual checks before implementation when automation is unsuitable. Missing prerequisites do not establish a pass. Report blocked prerequisites separately from functional failures and harness errors.

**Stop after four unsuccessful fix rounds for the same error and ask the developer for guidance.** A round is a proposed fix followed by rerunning the exposing check. Report the error, all four attempts and results, and diagnostic paths. Do not begin a fifth round or work around the requirement without guidance.

Report checks actually performed and their limitations.

## Safety and authorization

Authorize replacement implementation separately from planning. Work in approved reviewable slices and obtain explicit developer validation before advancing through an unapproved phase, slice, or milestone gate. Honor approvals already given for the applicable work.

GUI automation requires separate authorization, an unlocked exclusively reserved desktop, sequential runs, dedicated persistent test profiles, and disposable workspaces. Target only test-owned processes/windows and constrain cleanup to explicitly owned paths. Preserved profiles and saved workspace data do not automatically become replacement-harness resources.

Authentication is manual. Never automate passwords or MFA, extract credentials, or copy authenticated profiles between hosts. Classify expired authentication as blocked. Keep tokens, private conversations, and unrelated desktop content out of committed evidence and diagnostics.

## Git and GitHub

Use `gh` for this repository's GitHub operations, from this checkout or with `--repo jimthompson5802/ide-tester`. Use `git` for local version control.

For issue creation, use the repository-local [create-github-issue skill](.agents/skills/create-github-issue/SKILL.md). For pull requests, use [create-pull-request](.agents/skills/create-pull-request/SKILL.md) and the repository PR template. Publish only when requested.

Use Conventional Commits: `<type>(<optional scope>): <description>`. Select `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, or `chore` based on the change. Use a concise imperative description. Mark breaking changes with `!` and explain them in a `BREAKING CHANGE:` footer.

## Current status

The standalone TypeScript tester is developer accepted. For tester verification history and pending real-backend validation gates, read [smoke/AGENTS.md](smoke/AGENTS.md). Further scope requires developer direction.

The previous Python harness was removed; historical specifications and the root uv environment remain. Historical decisions, completion records, commands, and approvals are reference material pending review, not current functionality or authorization. M1-05 remains on hold; M1-06 and replacement design/implementation require explicit developer direction. No outstanding milestone or slice gate is accepted by the reset.
