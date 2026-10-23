# Repository instructions

## Project overview

This repository contains a standalone TypeScript VS Code smoke tester under `smoke/`. Retained Python environment files and historical planning documents have separate preservation and authorization rules below.

For the high-level project structure, see [Repository contents](README.md#repository-contents). For tester module responsibilities, see [Project structure](smoke/AGENTS.md#project-structure).

## Start here

- For current scope, retained artifacts, and environment limitations, read [README.md](README.md).
- For work under `smoke/`, read [tester instructions](smoke/AGENTS.md); they add tester-specific guidance to these repository-wide rules.
- Before proposing or performing authorized work on the preserved Python environment, read the [preservation guide](docs/preserved-python-environment.md).
- For architecture or milestone planning, read the historical [harness proposal](specifications/ide-copilot-smoke-harness-proposal.md). Review its assumptions before adopting them.
- For a selected Milestone 1 story, read the [historical backlog](specifications/ide-copilot-milestone1-user-stories.md) and applicable [implementation plan](docs/implementation-plans/). Historical acceptance does not establish current implementation.
- For VS Code testing approaches, read the [testing overview](docs/vscode-testing-overview.md) and [smoke testing research](docs/research/vscode-tester-approach.md). Distinguish extension-host/API tests from evidence that real IDE and Copilot UI interactions work.

## Working rules

Documentation work stays within its requested scope; it does not initiate setup or implementation.

Apply YAGNI: add dependencies, tooling, abstractions, or platform support only when needed to satisfy approved current acceptance criteria.

## Preserved resources

Preserve all existing dedicated profiles and their markers, plus `reports/m1-03/preserved-workspaces/`. Keep `.vscode/` settings unchanged unless separately requested. Inspect retained environment references before proposing changes. Preserve local environments and private data during branch changes; ignored files are shared across branches in this checkout.

Preserve the existing `.venv/`, `pyproject.toml`, `uv.lock`, and `.python-version`. Changes to the retained Python environment require separate authorization and the preservation guide's procedures.

## Validation

Keep these instructions and the README consistent with verified implementation and environment changes. Preserve the distinction between design targets, historical observations, and current verified behavior. Check relative links after documentation changes.

Use TDD for software features and bug fixes: derive observable tests from acceptance criteria, confirm the intended failure, implement the minimum passing change, and run relevant regression checks. Documentation-only changes do not require runtime tests. Historical Python test results do not establish current behavior.

Define observable manual checks before implementation when automation is unsuitable. Missing prerequisites do not establish a pass. Report blocked prerequisites separately from functional failures and harness errors.

**Stop after four unsuccessful fix rounds for the same error and ask the developer for guidance.** A round is a proposed fix followed by rerunning the exposing check. Report the error, all four attempts and results, and diagnostic paths. Do not begin a fifth round or work around the requirement without guidance.

Report checks actually performed and their limitations.

## Safety and authorization

Planning does not authorize implementation. Work in approved reviewable slices and obtain explicit developer validation before advancing through an unapproved phase, slice, or milestone gate. Honor approvals already given for the applicable work.

GUI automation requires separate authorization, an unlocked exclusively reserved desktop, sequential runs, dedicated persistent test profiles, and disposable workspaces. Target only test-owned processes/windows and constrain cleanup to explicitly owned paths. Preserved profiles and saved workspace data require explicit authorization before use by the current tester; honor authorization already given for the applicable resources.

Authentication is manual. Never automate passwords or MFA, extract credentials, or copy authenticated profiles between hosts. Classify expired authentication as blocked. Keep tokens, private conversations, and unrelated desktop content out of committed evidence and diagnostics.

## Git and GitHub

Use `gh` for this repository's GitHub operations, from this checkout or with `--repo jimthompson5802/ide-tester`. Use `git` for local version control.

For issue creation, use the repository-local [create-github-issue skill](.agents/skills/create-github-issue/SKILL.md). For pull requests, use [create-pull-request](.agents/skills/create-pull-request/SKILL.md) and the repository PR template. Publish only when requested.

Use Conventional Commits: `<type>(<optional scope>): <description>`. Select `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, or `chore` based on the change. Use a concise imperative description. Mark breaking changes with `!` and explain them in a `BREAKING CHANGE:` footer.

## Current status

The standalone TypeScript tester under `smoke/` is the active implementation and is developer accepted. For tester verification history and pending real-backend validation gates, read [smoke/AGENTS.md](smoke/AGENTS.md). Further scope requires developer direction.

Historical Python harness designs, decisions, completion records, commands, and approvals are reference material, not evidence of current functionality or authorization. Adopting historical designs requires explicit developer direction. M1-05 remains on hold; M1-06 requires explicit developer direction. Historical acceptance does not satisfy current phase, slice, or milestone gates.
