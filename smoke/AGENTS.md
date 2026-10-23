# Smoke tester instructions

These instructions apply to `smoke/` in addition to the [repository-wide instructions](../AGENTS.md). The root file owns scope approval, phase gates, TDD, the four unsuccessful fix rounds limit, GUI authorization and isolation, authentication, preserved resources, and Git/GitHub policy.

## Start here

- Before tester execution or maintenance, read [README.md](README.md) for setup, compatibility limits, suite behavior, reporting, and recovery.
- For changes to the optional real Copilot backend, read the [backend plan and execution record](../docs/implementation-plans/real-chat-backend.md), including pending validation gates.
- For original implementation decisions or qualification evidence, read the [completed replacement plan](../docs/vscode-smoke-tester-plan.md). Recorded GUI authorization applies to its recorded runs.

## Project structure

Paths below are relative to `smoke/`:

| Path | Responsibility |
| --- | --- |
| `src/cli.ts`, `src/arguments.ts`, `src/qualify.ts` | CLI execution, option validation, and foundation qualification entry point. |
| `src/runner.ts`, `src/app.ts`, `src/workbench.ts` | Suite orchestration, installed VS Code discovery, and Playwright workbench interactions. |
| `src/editing.ts`, `src/files.ts` | Editing scenarios and independent saved-file verification. |
| `src/chat.ts`, `src/turn.ts`, `src/session.ts` | Chat prompts and evidence validation, turn completion, and session discovery from renderer logs. |
| `src/mock.ts`, `src/profile.ts` | Mock Chat service and mock profile preparation. |
| `src/real-profile.ts`, `src/setup-real-chat.ts` | Persistent real-backend profile checks and setup for manual authentication. |
| `src/resources.ts`, `src/report.ts` | Owned run resources, cleanup, and result reporting. |
| `helper/extension.ts`, `helper/package.json` | VS Code helper extension implementation and manifest. |
| `tests/` | Non-GUI tests for tester behavior. |
| `package.json`, `package-lock.json`, `.npmrc` | Commands, dependency declarations and lock, and installation policy. |
| `tsconfig.json`, `helper/tsconfig.json` | Tester/test and helper compilation settings. |
| `dist/`, `helper/dist/` | Generated JavaScript and source maps; make implementation changes in the TypeScript sources. |

For generated run artifacts and private local profile locations, follow [results and recovery](README.md#results-and-recovery) and [real backend setup](README.md#optional-real-copilot-backend).

## Commands

Run these from the repository root. Use the Node version and host requirements in [README.md](README.md#non-gui-commands); scripts and the engine requirement are defined in [package.json](package.json).

```sh
npm --prefix smoke run compile
npm --prefix smoke run test:unit
```

Compile before testing: the test command executes compiled files. Compilation builds the tester and tests into `dist/` and the helper into `helper/dist/`. Non-GUI tests live under `tests/` and use Node's test runner with concurrency one; HTTP checks require permission to bind an ephemeral loopback port.

For dependency installation, follow [non-GUI setup](README.md#non-gui-commands). The project `.npmrc` disables install scripts, omits optional dependencies, and enforces the Node engine. The neighboring VS Code checkout is not an install, compile, or runtime dependency.

For authorized GUI runs, follow the README's [selected suites](README.md#selected-suites), [real backend](README.md#optional-real-copilot-backend), or [foundation qualification](README.md#foundation-gui-qualification) instructions. For abnormal shutdowns, inspect the owned run and follow [results and recovery](README.md#results-and-recovery).

## Validation

Apply the root TDD workflow to software changes and test non-GUI logic independently. Passing non-GUI tests do not establish GUI behavior. Validate GUI outcomes on the authorized target host.

Independently verify IDE edits on disk and require fresh complete Copilot responses. Distinguish extension-host/API checks from evidence of real IDE and Copilot UI interactions. Report the selected suite, backend, compatibility combination, and checks actually performed, including cleanup failures and unverified outcomes.

Keep [README.md](README.md) consistent with verified tester behavior. Preserve the distinction between mocked Chat, real service results, and pending qualification.

## Current status and gates

The original mocked foundation, selected suites, and final handoff are developer accepted; the [replacement plan](../docs/vscode-smoke-tester-plan.md) is complete. The README and execution records hold detailed versions and verification history.

The optional [real Copilot backend](../docs/implementation-plans/real-chat-backend.md) has developer-validated slice 1. Slice 2 is implemented and non-GUI-verified, pending developer validation. An authorized real two-turn Chat run passed. Real setup, combined mode, and signed-out blocking remain GUI-unverified and require separate GUI authorization. Obtain explicit developer validation before advancing through the pending slice gate.
