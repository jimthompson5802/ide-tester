# Smoke tester instructions

These instructions apply to `smoke/` in addition to the [repository-wide instructions](../AGENTS.md). Keep tester-specific guidance here and shared policies in the root file.

## Start here

- Before tester execution or maintenance, read [README.md](README.md) for setup, compatibility limits, suite behavior, reporting, and recovery.
- Before writing or reviewing TypeScript implementation or tests, read the [coding standards](CODING_STANDARDS.md).
- For changes to the optional real Copilot backend, read the [backend plan and execution record](../docs/implementation-plans/real-chat-backend.md), including pending validation gates.
- For original implementation decisions or qualification evidence, read the [completed replacement plan](../docs/vscode-smoke-tester-plan.md). Recorded GUI authorization applies to its recorded runs.

## Commands

Run these from the repository root:

```sh
npm --prefix smoke run build
npm --prefix smoke run test:unit
```

Compile before testing: the test command executes compiled files. HTTP checks require permission to bind an ephemeral loopback port.

For dependency installation and Node/host requirements, follow [non-GUI setup](README.md#non-gui-commands) and [qualified compatibility](README.md#qualified-compatibility). Scripts and the engine requirement are defined in [package.json](package.json). The neighboring VS Code checkout is not an install, compile, or runtime dependency.

For authorized GUI runs, follow the README's [selected suites](README.md#selected-suites), [real backend](README.md#optional-real-copilot-backend), or [foundation qualification](README.md#foundation-gui-qualification) instructions. For abnormal shutdowns, inspect the owned run and follow [results and recovery](README.md#results-and-recovery).

## Secret storage

Use in-memory secret storage for probes, qualification, Git-only, editing-only and mocked Chat runs. Launch those tester-owned VS Code instances with `--use-inmemory-secretstorage`; verify helpers also use only in-memory storage. The sole saved-authentication exception is real Chat testing, including a combined suite selecting real Chat: VS Code may reuse authentication already saved in the authorized dedicated `profiles/smoke-real-chat` profile. Omit the in-memory flag only for that exception; never extract, copy or migrate saved credentials, and never use personal profiles. New sign-in remains manual and requires applicable setup authorization.

The developer permits VS Code to read an existing Keychain encryption key solely to reuse that dedicated real Chat profile's saved authentication. This exception does not permit agent tools to inspect Keychain, access unrelated entries, extract keys, or create, update, unlock, reset or delete Keychain entries. Disable credential helpers and other integrations outside this exception. If the existing key is unavailable or a Keychain dialog appears, stop and report the prerequisite as blocked; retain sanitized owned evidence without interacting with the dialog or falling back to creating a key.

Before running an existing launch path, verify it meets this policy. Missing enforcement is a harness error; unavailable or expired permitted authentication is blocked. Preserve existing profiles. Historical real-backend passing runs do not establish current authentication readiness; check it only during an authorized run under this exception. This permission does not itself authorize a GUI run or advance an implementation gate.

## Project structure

Paths below are relative to `smoke/`:

| Path | Responsibility |
| --- | --- |
| `src/cli.ts`, `src/arguments.ts`, `src/qualify.ts` | CLI execution, option validation, and foundation qualification entry point. |
| `src/runner.ts`, `src/app.ts`, `src/workbench.ts` | Suite orchestration, installed VS Code discovery, and Playwright workbench interactions. |
| `src/git.ts`, `src/git-repository.ts`, `src/git-profile.ts` | Git UI scenario, independent bounded Git verification and owned persistent standalone Git profile lifecycle. |
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

## Git suite maintenance

`basic` dispatches editing → Chat and stops on the first failure. Git runs only through `--suite git`, selects no Chat or mock server, and preserves `profiles/smoke-git` on every outcome. Before changing its settings, state, Graph reset or Git launch isolation, read the [Git profile contract](README.md#git-suite-and-persistent-profile) and [issue #38 plan](../docs/implementation-plans/issue-38-git-smoke-test.md); maintain only the listed owned keys/state and visible Graph reset operations. Source Control Graph must show the unique message, supplemented by independent full hash/blob verification. Combined runs must not prepare Git or use its profile. Preserve persistent real Chat settings. Earlier expanded combined requirements are superseded by the standalone Git decision recorded in the plan.

## Current gates

The foundation and selected suites are developer accepted. Real-backend slice 2 is developer validated; signed-out blocking is GUI verified, and authenticated Chat passed after manual sign-in restoration. Issue #36 is developer validated. See the [backend execution record](../docs/implementation-plans/real-chat-backend.md) for evidence and remaining checks.

Issue #38 phases 1 and 2 are developer validated. Phase-3 tasks P3-T01–P3-T03 and P3-DV are complete under the reconciled standalone-Git scope; the developer explicitly validated phase 3. The developer directed separating Git from combined runs, restoring the previously passing Chat implementation from `b9a4cc4`, and renaming `all` to `basic`. At that acceptance checkpoint, compilation and all 75 non-GUI tests passed. Renamed mocked `basic` and standalone Git GUI checks passed. Real `basic` initially failed on a Copilot error/warning, then passed two consecutive developer-requested reruns without code changes. All runs confirmed owned shutdown and reservation release; failed resources were retained and persistent profiles preserved. See the Git plan for exact reports and historical failures. The earlier expanded combined-startup fix loop remains stopped after four unsuccessful rounds; the directed rollback does not authorize new speculative fixes.

PR #39 P2 cleanup removed the unused mock-combined Git profile API and Chat enablement repair. Compilation and all 74 non-GUI tests pass, including standalone reuse with byte-preserved database state and existing ownership/runner regressions. A subsequent developer-authorized Git-only GUI run passed after this cleanup (3.053 seconds Git, 4.689 seconds total), preserving the profile and confirming shutdown, disposable cleanup and reservation release; see the Git plan for the report. A subsequent authorized mocked `basic` GUI run also passed editing and both Chat turns (4.821 seconds total), with owned shutdown, disposable cleanup and reservation release. The following authorized real `basic` run passed editing and both Chat turns (6.018 seconds total), preserving the dedicated real profile and confirming shutdown, disposable cleanup and reservation release. The developer explicitly validated both the P2 cleanup and real-backend slice 2 after these runs: “I validate the two items”. A subsequent separately authorized manual sign-out/check/manual sign-in/recovery sequence verified signed-out blocking and restored authenticated Chat; see the backend execution record.
