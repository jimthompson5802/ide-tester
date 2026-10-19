# IDE Tester

A planned macOS smoke-test harness for checking basic IDE functionality and GitHub Copilot Chat after IDE or extension updates.

**Status:** Design and planning. This repository currently contains a draft proposal and Milestone 1 user stories. There is no implemented harness, installable package, or runnable test suite yet.

## Start here

- [Milestone 0 environment setup](specifications/ide-milestone0-environment-setup.md) — uv, Python virtual environment, and supporting software tooling.
- [Harness proposal](specifications/ide-copilot-smoke-harness-proposal.md) — architecture, test scope, isolation strategy, reporting, risks, and delivery milestones.
- [Milestone 1 user stories](specifications/ide-copilot-milestone1-user-stories.md) — VS Code proof-of-concept backlog, acceptance criteria, implementation slices, and developer validation gates.

## Planned behavior

The harness will launch a dedicated IDE test instance, create a disposable workspace, and verify observable outcomes:

| Test | Expected outcome |
| --- | --- |
| T01: Launch IDE | The intended test instance becomes usable within a timeout. |
| T02: Open project and file | The disposable workspace and expected file are open. |
| T03: Edit and save | An edit made through the IDE is independently verified on disk. |
| T04: Open Copilot Chat | Chat is available, with authentication problems classified separately. |
| T05: Submit a prompt | A fresh assistant response completes and satisfies a defined assertion. |

Runs are intended to record installed versions, timings, results, and sanitized diagnostics. Proposed outcomes distinguish passing tests, functional failures, blocked prerequisites, and harness errors.

Milestones define delivery outcomes. Implementation phases within each milestone will be defined during implementation.

## Milestone 1 scope

Milestone 1 targets **Visual Studio Code and GitHub Copilot Chat on macOS**. The proposed stack is Python 3.12+, pytest, YAML configuration, and macOS Accessibility automation, subject to feasibility testing.

The project follows YAGNI: install tools and dependencies only for demonstrated needs in the current milestone. Setup and execution use prebuilt software and pure-Python packages or compatible prebuilt wheels, with dependency source builds disabled. Local native compilation and compiler toolchain installation are out of scope; any dependency requiring them must be reconsidered.

The first step is **M1-00: Validate Copilot Chat automation feasibility**. It must establish reliable UI interaction, response-completion detection, test-instance isolation, and authentication reuse before the main harness is implemented.

Implementation proceeds in reviewable slices: feasibility, foundation, IDE file operations, Copilot Chat, and repeatability/reporting. Each slice requires developer validation. Milestone 1 acceptance includes five consecutive unattended passing runs on unchanged IDE and Copilot versions.

IntelliJ IDEA support, release monitoring, and scheduling are later milestones. Inline completion, agent workflows, and code-edit verification are outside the initial Milestone 1 scope.

## Planned operating environment

- A usable, logged-in macOS graphical session and the automation permissions established by the feasibility spike.
- A dedicated persistent VS Code test profile with Copilot installed and signed in manually during setup.
- Fresh disposable workspaces for each run, separate from personal projects and the persistent profile.
- Sequential GUI execution to avoid keyboard-focus conflicts.
- Valid authentication and network/service availability for Copilot Chat tests.

The design preserves authenticated test profiles between runs and classifies expired authentication as blocked. It does not automate passwords or MFA, copy credentials, or modify personal projects or everyday IDE profiles.

## Setup and usage

Installation and execution instructions will be added when the harness exists. The specifications propose commands such as:

```bash
ide-smoke run --ide vscode
```

**This command is a design target and is not currently available.** Configuration examples and source layouts in the specifications are also proposals.

For now, read the proposal and Milestone 1 backlog, resolve the feasibility questions in M1-00, and review the resulting evidence before implementing the foundation.

## Repository contents

```text
.
├── README.md
└── specifications/
    ├── ide-milestone0-environment-setup.md
    ├── ide-copilot-smoke-harness-proposal.md
    └── ide-copilot-milestone1-user-stories.md
```
