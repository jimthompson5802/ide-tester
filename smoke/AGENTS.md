# Smoke tester instructions

These instructions apply to `smoke/` in addition to the [repository-wide instructions](../AGENTS.md). Keep tester-specific guidance here and shared policies in the root file.

## Start here

- Before tester execution or maintenance, read [README.md](README.md) for setup, compatibility limits, suite behavior, reporting, and recovery.
- For changes to the optional real Copilot backend, read the [backend plan and execution record](../docs/implementation-plans/real-chat-backend.md), including pending validation gates.
- For original implementation decisions or qualification evidence, read the [completed replacement plan](../docs/vscode-smoke-tester-plan.md). Recorded GUI authorization applies to its recorded runs.

## Commands

Run these from the repository root:

```sh
npm --prefix smoke run compile
npm --prefix smoke run test:unit
```

Compile before testing: the test command executes compiled files. HTTP checks require permission to bind an ephemeral loopback port.

For dependency installation and Node/host requirements, follow [non-GUI setup](README.md#non-gui-commands) and [qualified compatibility](README.md#qualified-compatibility). Scripts and the engine requirement are defined in [package.json](package.json). The neighboring VS Code checkout is not an install, compile, or runtime dependency.

For authorized GUI runs, follow the README's [selected suites](README.md#selected-suites), [real backend](README.md#optional-real-copilot-backend), or [foundation qualification](README.md#foundation-gui-qualification) instructions. For abnormal shutdowns, inspect the owned run and follow [results and recovery](README.md#results-and-recovery).

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

## Validation

Test non-GUI logic independently. For authorized GUI checks, verify saved edits on disk and require fresh, complete Copilot responses. Report the selected suite, backend, compatibility versions, checks actually performed, outcomes, and cleanup result, including failures and unverified behavior. Passing non-GUI tests does not establish GUI behavior; distinguish extension-host/API checks from real IDE and Copilot UI evidence.

Keep [README.md](README.md) consistent with verified tester behavior. Preserve the distinction between mocked Chat, real service results, and pending qualification.

## Current gates

The foundation and selected suites are developer accepted. Real-backend slice 2 awaits explicit developer validation; signed-out blocking remains unverified. Issue #36 is developer validated. See the [backend execution record](../docs/implementation-plans/real-chat-backend.md) for evidence and remaining checks. Obtain explicit developer validation before advancing through the pending slice gate.
