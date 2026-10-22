# VS Code Smoke Tester — Planning Baseline

This branch is a fresh starting point for a VS Code smoke tester. It retains specifications, implementation plans, research, development workflows, and the existing uv/Python environment. The previous harness, tests, experiments, and execution reports have been removed.

## Start here

- [Harness proposal](specifications/ide-copilot-smoke-harness-proposal.md) — historical architecture and milestone design, pending review for the replacement.
- [Milestone 1 user stories](specifications/ide-copilot-milestone1-user-stories.md) — historical acceptance criteria and delivery slices.
- [Milestone 0 environment setup](specifications/ide-milestone0-environment-setup.md) and [implementation plan](specifications/ide-milestone0-implementation-plan.md) — retained environment planning.
- [Implementation plans](docs/implementation-plans/) — historical plans, decisions, and recorded progress.
- [VS Code smoke testing research](docs/research/vscode-tester-approach.md) and [macOS accessibility research](docs/research/macos-ax-accessibility.md) — background for choosing the next approach; claims require verification before implementation.
- [VS Code testing overview](docs/vscode-testing-overview.md) — testing layers and extension-host/API testing context.

Historical documents retain their original decisions and completion records. Those records describe the previous implementation, not runnable functionality in this branch. References to removed files are labelled as historical paths. Replacement design and implementation require separate developer direction; old approvals do not authorize resumption.

## Setup and usage

The existing `.venv/`, `pyproject.toml`, `uv.lock`, and `.python-version` are preserved unchanged. Reuse the existing Homebrew uv and `/opt/homebrew/bin/python3.12`; Python 3.12.15 arm64 was historically qualified. Recheck the execution context before separately authorized environment work.

There is currently no runnable harness or runtime test suite. Package metadata, the editable installation, and `.venv/bin/ide-smoke` may still reference the removed `src/ide_smoke/` package. Installation, build, synchronization, and old CLI examples are not working usage instructions for this baseline. Preserve the environment without reinstalling or regenerating the lock as part of this reset.

Future authorized dependency work must retain the wheel-only dependency/offline local-package approach: preserve extra installed distributions with `--inexact`, disable third-party source builds and Python downloads, and install a local package only after its source and build backend are available. Exact dependency declarations and pins remain in `pyproject.toml` and `uv.lock`.

## Development workflow

Repository-local skills remain available for [backlog generation](.agents/skills/generate-milestone-user-stories/SKILL.md), [story planning](.agents/skills/plan-user-story/SKILL.md), [plan execution](.agents/skills/execute-plan/SKILL.md), [issue creation](.agents/skills/create-github-issue/SKILL.md), and [pull request creation](.agents/skills/create-pull-request/SKILL.md).

Review the replacement approach and authorize implementation separately. Follow [repository instructions](AGENTS.md), use TDD for future software changes, and obtain developer validation at agreed phase and milestone gates. Retained historical stories are reference material until explicitly selected or revised.

## Repository contents

- `specifications/` — retained planning and specification artifacts.
- `docs/implementation-plans/` — historical implementation plans and decisions.
- `docs/research/` and `docs/vscode-testing-overview.md` — retained research and background.
- `.agents/skills/` and `.github/` — workflow skills and issue/PR templates.
- Root uv metadata and `LICENSE` — preserved project environment definitions and licensing.

Ignored local `.vscode/`, `.venv/`, and `profiles/` remain unchanged. Previously preserved workspace data remains in `reports/m1-03/preserved-workspaces/`. Other raw reports, report-local uv caches/environments, disposable workspaces, local harness configuration, and experiment state were removed. Ignored files are shared across branch switches in this checkout; they are not distributed with the branch. Profiles and saved workspace data remain private local resources, not automatic inputs to a replacement harness.

The pre-reset tracked implementation is recoverable from commit `71dbe3188d1056d91bb248b43174c3545e120bf9`. Deleted ignored artifacts are not recoverable from Git.
