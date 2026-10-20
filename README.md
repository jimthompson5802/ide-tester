# IDE Smoke Test Harness Proof-of-Concept

A planned smoke-test harness for Visual Studio Code or IntelliJ IDEA and selected extensions/plugins after IDE or extension updates. GitHub Copilot Chat is the initial extension target. Prove feasibility on macOS first, then add Windows support after developer approval.

**Status:** Design and planning. This repository currently contains a draft proposal and Milestone 1 user stories. There is no implemented harness, installable package, or runnable test suite yet.

## Start here

- [Milestone 0 environment setup](specifications/ide-milestone0-environment-setup.md) — macOS setup with uv, a Python virtual environment, and supporting software tooling.
- [Harness proposal](specifications/ide-copilot-smoke-harness-proposal.md) — architecture, test scope, isolation strategy, reporting, risks, and delivery milestones.
- [Milestone 1 user stories](specifications/ide-copilot-milestone1-user-stories.md) — VS Code proof-of-concept backlog, acceptance criteria, implementation slices, and developer validation gates.
- [VS Code testing overview](docs/vscode-testing-overview.md) — background notes on VS Code's testing layers, extension host/API tests, and integration test runner.

## Planned behavior

The harness will launch a dedicated IDE test instance, create a disposable workspace, and verify observable outcomes:

| Test | Expected outcome |
| --- | --- |
| T01: Launch IDE | The intended test instance becomes usable within a timeout. |
| T02: Open project and file | The disposable workspace and expected file are open. |
| T03: Edit and save | An edit made through the IDE is independently verified on disk. |
| T04: Open Copilot Chat | Chat is available, with authentication problems classified separately. |
| T05: Submit a prompt | A fresh assistant response completes and satisfies a defined assertion. |

Runs are intended to record the host OS and version, installed IDE and extension versions, timings, results, and sanitized diagnostics. Proposed outcomes distinguish passing tests, functional failures, blocked prerequisites, and harness errors.

Milestones define delivery outcomes. Implementation phases within each milestone will be defined during implementation.

## Planned architecture

Separate adapter contracts cover IDE lifecycle (`IDE`), editor file operations (`EditorFiles`), and extension behavior, initially `Copilot`. File and extension adapters receive the IDE instance at construction time and target that session. Additional selected extensions introduce their own contracts, adapters, and tests without adding extension-specific methods to the IDE contract.

Contracts, logical tests, orchestration, and verification remain platform-neutral. UI automation, process handling, and scheduling have platform-specific implementations, selected for the configured IDE and local host OS. Windows dependencies and implementation are deferred until Milestone 2.

## Delivery milestones

| Milestone | Outcome |
| --- | --- |
| 0 | Prepare the macOS environment. |
| 1 | Prove VS Code and Copilot Chat on macOS with T01–T05. |
| 2 | Set up the Windows environment, validate feasibility, and support the same VS Code/Copilot tests on Windows. |
| 3 | Add IntelliJ IDEA support on macOS and Windows. |
| 4 | Strengthen reliability and diagnostics on both platforms. |
| 5 | Add release monitoring and platform-specific scheduling. |

Each milestone requires developer validation before proceeding. Windows support must establish its own UI automation, response-completion detection, isolation, and authentication-reuse evidence; macOS success does not establish Windows compatibility.

## Development workflow

Use these skills to move from a milestone description to reviewed implementation. Skill invocations are agent prompts, not shell commands.

1. **Generate the backlog — [generate-milestone-user-stories](.agents/skills/generate-milestone-user-stories/SKILL.md).** Invoke, for example, `$generate-milestone-user-stories milestone=2`. The skill uses the proposal for scope and the Milestone 1 backlog as its structural model, asks about consequential decisions, and writes or refines `specifications/ide-copilot-milestone<N>-user-stories.md`. Review the stories, acceptance criteria, dependencies, evidence requirements, and developer gates.
2. **Publish the stories — [create-github-issue](.agents/skills/create-github-issue/SKILL.md).** Input: the reviewed `specifications/ide-copilot-milestone<N>-user-stories.md` file produced in step 1. For example: “Use `$create-github-issue` to create one GitHub issue per story in `specifications/ide-copilot-milestone2-user-stories.md`.” The skill uses the repository issue template and preserves story IDs, acceptance criteria, dependencies, evidence requirements, and developer gates.
3. **Plan the next eligible story — [plan-user-story](.agents/skills/plan-user-story/SKILL.md).** Supply its issue or specification reference. The skill saves a technical plan under `docs/implementation-plans/`, with phases, tasks, verification, and developer checkpoints. Review the plan before execution.
4. **Authorize and implement the plan.** Separately instruct the agent to execute the approved plan. There is no dedicated implementation skill in this workflow. Follow dependency order, perform the required checks, and present actual results and evidence at each developer checkpoint. Use `mattpocock-skills:diagnosing-bugs` for debugging or `mattpocock-skills:tdd` when test-first development is requested and those plugin skills are available.
5. **Review the changes — `mattpocock-skills:code-review`.** When available, use this plugin skill to review repository standards and conformance to the originating story. Resolve findings and present validation evidence for developer review; code review does not replace the required developer validation.
6. **Open a pull request — [create-pull-request](.agents/skills/create-pull-request/SKILL.md).** Request a PR using the repository template, describing the resulting behavior and validation evidence.

Repeat planning, implementation, review, and PR creation in dependency order. Stop at each required developer checkpoint before advancing to the next phase, slice, or milestone. Future milestone backlogs may be drafted early, with prerequisite approvals recorded explicitly.

Generating a backlog, creating issues, and approving a plan do not authorize implementation. Implementation requires a separate developer instruction. Plugin skills named above are optional tooling and must be available in the agent session; the linked repository-local skills live in this checkout.

## Milestone 1 scope

Milestone 1 targets **Visual Studio Code and GitHub Copilot Chat on macOS**. The proposed stack is Python 3.12+, pytest, YAML configuration, and macOS Accessibility automation, subject to feasibility testing.

The project follows YAGNI: install tools and dependencies only for demonstrated needs in the current milestone. Setup and execution use prebuilt software and pure-Python packages or compatible prebuilt wheels, with dependency source builds disabled. Local native compilation and compiler toolchain installation are out of scope; any dependency requiring them must be reconsidered.

The first step is **M1-00: Validate Copilot Chat automation feasibility**. It must establish reliable UI interaction, response-completion detection, test-instance isolation, and authentication reuse before the main harness is implemented.

Implementation proceeds in reviewable slices: feasibility, foundation, IDE file operations, Copilot Chat, and repeatability/reporting. Each slice requires developer validation. Milestone 1 acceptance includes five consecutive unattended passing runs on unchanged IDE and Copilot versions.

Windows environment setup and support, IntelliJ IDEA support, release monitoring, and scheduling are later milestones. Inline completion, agent workflows, and code-edit verification are outside the initial Milestone 1 scope.

## Planned operating environment

- A usable, logged-in graphical session on each host and the platform-specific automation permissions established by its feasibility spike; initially macOS, with Windows validated in Milestone 2.
- A dedicated persistent IDE test profile on each host, with selected extensions installed and authenticated manually where required; initially Copilot.
- Fresh disposable workspaces for each run, separate from personal projects and the persistent profile.
- Sequential GUI execution to avoid keyboard-focus conflicts.
- Valid authentication and network/service availability for Copilot Chat tests.

The design preserves authenticated test profiles between runs and classifies expired authentication as blocked. It does not automate passwords or MFA, transfer authenticated profiles or credentials between hosts, or modify personal projects or everyday IDE profiles.

## Setup and usage

Installation and execution instructions will be added when the harness exists. The specifications propose commands such as:

```bash
ide-smoke run --ide vscode
```

**This command is a design target and is not currently available.** Configuration examples and source layouts in the specifications are also proposals.

Runs execute on the local host using configuration for its platform (`macos` or `windows`), including platform-specific executable and profile paths. The proposal's current configuration example targets macOS; Windows setup and configuration will be established in Milestone 2.

For now, read the proposal and Milestone 1 backlog, resolve the feasibility questions in M1-00, and review the resulting evidence before implementing the foundation.

## Repository contents

```text
.
├── README.md
├── docs/
│   └── vscode-testing-overview.md
└── specifications/
    ├── ide-milestone0-environment-setup.md
    ├── ide-copilot-smoke-harness-proposal.md
    └── ide-copilot-milestone1-user-stories.md
```
