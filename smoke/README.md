# Standalone VS Code smoke tester

The approach used here is based on the [VS Code IDE smoke testing framework](https://github.com/microsoft/vscode/tree/main/test/smoke): launch an installed VS Code build, drive the workbench UI, and verify observable results. This repository implements a standalone tester with its own editing and Copilot Chat suites, isolation, and reporting.

Status: original mocked foundation, selected suites and final handoff developer accepted. Compilation and 44 non-GUI tests pass after optional real-backend implementation. Slice 1 is developer validated; slice 2 awaits developer validation. The recorded editing-only, two-turn mocked Chat-only and combined GUI checks used VS Code 1.135.0 / Copilot Chat 0.63.0 on macOS arm64 before these changes. An authorized real two-turn Chat run passed on 2026-10-22 after readiness and transcript fixes. Setup, combined real mode and signed-out blocking remain GUI-unverified. The [original qualification record](../docs/vscode-smoke-tester-plan.md) and [real backend execution record](../docs/implementation-plans/real-chat-backend.md) distinguish those results.

## Non-GUI commands

Use Node 26.3.1 arm64 on macOS:

```sh
npm --prefix smoke ci
npm --prefix smoke run compile
npm --prefix smoke run test:unit
```

The project `.npmrc` disables install scripts, omits optional dependencies (including native `fsevents`), and enforces the Node engine. No VS Code, Electron, or browser download is needed. TypeScript compiles the tester and tests into `smoke/dist/`, and the helper into `smoke/helper/dist/`. Unit tests use Node's test runner with concurrency one; their HTTP checks need permission to bind an ephemeral loopback port.

The neighboring VS Code checkout is not an install, compile, or runtime dependency. Root uv metadata, Python environments, `.vscode/`, existing profiles, and preserved workspaces are untouched.

## Qualified compatibility

| Component | Qualified version |
|---|---|
| Host | macOS arm64 |
| Node | 26.3.1 |
| TypeScript | 6.0.2 |
| Playwright Test | 1.61.1 |
| Installed VS Code | 1.135.0 |
| Bundled Copilot Chat | 0.63.0 |

The runner checks the host/Node/application combination before launch. Other platforms or versions require separately authorized qualification; the app is never rebuilt or modified. The helper uses stable command APIs with the published `@types/vscode` 1.140.0 type package because 1.135.0 was unavailable.

## Selected suites

With an authorized, unlocked, exclusively reserved desktop:

```sh
npm --prefix smoke run smoke -- \
  --build "/Applications/Visual Studio Code.app" \
  --suite all
```

Select `editing`, `chat`, or `all`; omission defaults to `all`. The runner uses one sequential process and no automatic retries, a 60-second launch deadline, and a 120-second deadline for editing and mocked Chat. Real Chat allows 120 seconds per turn and 300 seconds total. Results use `scope: "selected-suites"` and a separate outcome/evidence entry for each check. A failed check stops dependent checks, which remain `not_run`.

- Editing opens `existing.txt` through Quick Open, replaces its contents using the shipped driver, saves through VS Code, and independently compares exact UTF-8 bytes. It creates an untitled editor and saves through the simple Save As dialog to the initially absent `created.txt`. Both files are closed/reopened and their displayed lines and disk bytes checked. After the final verification, all editors are closed before the editing suite completes. Result evidence includes paths, byte counts, SHA-256 digests and reopened display contents. Only initial fixture setup writes directly to disk; the helper never edits files.
- Chat opens one fresh local sidebar session, selects Ask, and submits a prompt and follow-up through the UI. Each uses a unique marker and a distinct synthetic reply. Every turn requires the same local identity, the matching visible prompt, a fresh completed mock request and exactly one additional completed assistant bubble with the exact reply. The follow-up also verifies the original prompt/reply remain intact. Result evidence records session identity and both completed turns.
- Combined runs editing and then Chat in the same isolated app/workspace. The default mock backend exercises no Copilot CLI, Agents Window, tools, code-edit proposals or real-model responses. The optional real backend below exercises authenticated Chat.

All three commands passed on 2026-10-22; see the tracked [verification record](../docs/vscode-smoke-tester-plan.md). Local evidence (ignored by Git and not available on GitHub): `reports/smoke/selected-suites-verification-2026-10-22/checks.json` and `reports/smoke/2026-10-22T15-05-40-631Z-8f01daf4-57b6-4749-8dd8-2745e7df7422/result.json`, relative to the repository root. Editing-only took 2.899 seconds, Chat-only 3.948 seconds and combined 4.924 seconds including launch/shutdown. Every run confirmed shutdown, removed disposable resources and released the reservation.

## Optional real Copilot backend

Use `--chat-backend mock|real`; omission defaults to `mock`. Real mode supports `chat` and `all`. Editing-only runs and foundation qualification reject real mode. Real two-turn Chat passed on the pinned host versions on 2026-10-22; setup, combined real mode and signed-out blocking await separately authorized qualification.

After compilation, with GUI authorization and an unlocked, exclusively reserved desktop, initialize the dedicated profile:

```sh
npm --prefix smoke run setup:real-chat -- --build "/Applications/Visual Studio Code.app"
```

Setup accepts only `--build`. It reserves `reports/smoke/.reservation`, creates the ignored `profiles/smoke-real-chat` profile, and opens a disposable workspace. Follow the [official Copilot sign-in workflow](https://code.visualstudio.com/docs/setup/copilot) manually, then close the setup window. Setup confirms owned application shutdown before releasing the reservation. It records no screenshots or traces and does not verify sign-in success. Authentication is checked by the Chat run; expired/missing authentication, entitlement and quota prerequisites return `blocked` with setup instructions.

After setup closes:

```sh
npm --prefix smoke run smoke -- \
  --build "/Applications/Visual Studio Code.app" \
  --suite chat --chat-backend real
```

Use `--suite all --chat-backend real` for editing followed by real Chat in the same dedicated instance and disposable workspace. Real mode starts no mock server, injects no endpoint overrides or synthetic credentials, and uses normal persistent secret storage. Launch environment variables are limited to normal host variables and dedicated state paths. Anonymous Chat is disabled. Setup can refresh this setting in older owned profiles while preserving their state. Existing mock endpoint/auth overrides are rejected.

The profile has dedicated user data, extensions and state directories and is preserved after successful and failed runs. Setup rejects unowned directories and symlinked profile paths. The shared reservation and profile singleton checks require setup to be closed before testing. Inspect abnormal shutdowns deliberately; the runner does not remove profile locks or adopt existing profiles.

The real journey opens a fresh local Chat session and selects Ask through the visible command palette because the authenticated mode menu can omit legacy Ask. Debug logging is enabled for the owned instance so session-binding events are available. It submits a unique `SMOKE_<UUID>` token with an exact-reply instruction, then asks for the same token from the previous answer using a different prompt marker. Both replies must contain exactly that token after trimming outer whitespace. Added prose or Markdown fails, even when connectivity works. Each turn requires exactly one fresh completed assistant bubble, the matching prompt and unchanged session; the follow-up must preserve the first exchange. The runner checks explicit error UI and exports only the active test Chat through VS Code's Export Chat command to verify raw Markdown and a successful terminal model state. Known thinking parts and empty MCP startup status are excluded from final-answer Markdown; unknown parts still fail closed. Informational toasts do not count as service errors. This prevents formatted or cancelled token text from passing. Temporary exports are deleted after reading. Missing export/UI contracts produce `harness_error`.

Real turns allow 120 seconds each and a 300-second total Chat deadline, with no automatic retries. Response mismatches, service errors and response timeouts return `failed`; prerequisite failures return `blocked`; harness/cleanup errors return `harness_error`. JSON records backend, submitted prompts, expected replies (`reply`), observed replies, session identity, completion, counts and timings, including available partial evidence on failure. Real reports use `mockRequestEvidence: "inapplicable"`, `mockRequestCount: null` and `requests: null`. Text output displays the backend.

Real runs record no screenshots or Playwright traces, including combined runs, to keep authentication screens and credentials out of diagnostics even if sign-in expires during execution. Reports retain only the test conversation's selected evidence and sanitized error reasons. Dedicated profile data stays private and ignored. See the [execution record and remaining GUI checks](../docs/implementation-plans/real-chat-backend.md).

## Foundation GUI qualification

Before executing, obtain explicit GUI authorization and confirm an unlocked, exclusively reserved desktop. Use the installed VS Code 1.135.0 application with bundled Copilot Chat 0.63.0. Other versions are blocked at this compatibility checkpoint.

```sh
npm --prefix smoke run qualify -- \
  --build "/Applications/Visual Studio Code.app" \
  --suite chat
```

This retained command runs one sequential qualification in the tester process, with no retries. It uses Playwright's Electron launcher and Playwright Test assertions; it does not start a browser or a pool of workers. `--suite all` also qualifies only this foundation exchange, and the JSON result explicitly records `scope: "foundation"`. `--suite editing` is blocked for `qualify`; use `smoke` for the complete selected suites.

The qualification checks to observe are:

1. A new test-owned VS Code instance opens the disposable workspace; the installed application and existing windows remain intact.
2. Within the 60-second launch deadline, the shipped driver exposes readiness and editor input, and the workbench restores. Missing hooks block qualification.
3. The helper opens a fresh local sidebar Chat. The tester selects Ask through the visible picker, verifies its displayed label, then types and submits one unique marker through the UI. The helper never submits a prompt or generates a reply.
4. Within the 120-second Chat deadline, a new matching mock request finishes streaming and exactly one new assistant bubble completes with the exact synthetic reply in the same session. Partial or stale responses cannot pass.
5. Only the launched app and owned mock close. Resources are removed only after a passing check and confirmed shutdown. Results remain on disk.

The mock advertises one Chat Completions model under `data` and an empty proxy inline-edit `models` array, as required by the two consumers of `/models`. Endpoint overrides, a synthetic token, isolated environment variables, fresh profile storage, and in-memory secret storage avoid real authentication. Unknown mock routes and unknown/missing turn markers fail; there is no real-model response fallback. Node's bundled SQLite initializes the fresh profile's built-in Chat enablement state. The helper uses only stable command APIs despite the newer published VS Code type package.

The installed build has no DOM session-binding attribute. Session tracking instead reads the local conversation URI from `ChatModelSelection` workbench-view events in the owned renderer log. The latest event must identify a local session; missing/unbound/non-local events fail closed. Before submission, the tester requires a new URI and an empty response transcript. After submission, it requires the same URI, the current unique prompt marker visible in the UI, exactly one new completed assistant bubble, exact reply text, and a newer completed matching mock request. The driver targets Monaco's native edit-context element for text entry. These log, UI and driver contracts remain version-dependent.

## Results and recovery

Both `smoke` and `qualify` print a plain-text summary by default and save the same text as `result.txt` beside the unchanged `result.json`. For example (durations and run ID are illustrative):

```text
Smoke test: PASSED
Run ID: <run-id>
Scope: Selected suites
Chat backend: mock

Suite       Result        Duration
Editing     PASSED        1.200 seconds
Chat        PASSED        1.500 seconds

Harness disposition: PASSED
Resources: Removed
Reservation: Released
Duration: 4.924 seconds
JSON report: /path/to/reports/smoke/<run-id>/result.json
```

Use `--output json` for the previous single-line terminal JSON format, or `--output text` explicitly. Both modes save both report files when a result report path is available. For example:

```sh
npm --prefix smoke run smoke -- --build "/Applications/Visual Studio Code.app" --suite all --output json
```

The summary distinguishes PASSED, FAILED, BLOCKED, HARNESS ERROR and NOT RUN. Suite outcomes come from individual checks; a cleanup failure can leave suites PASSED while the final harness disposition is HARNESS ERROR. Available suite and total durations, failure reasons and cleanup errors are included, along with the resource path when resources are retained. Missing suite or cleanup information is shown as Unavailable. Early errors such as an existing reservation may have no report directory or saved artifacts. A text-report write failure returns nonzero and identifies the reporting error while preserving the saved JSON (JSON terminal mode adds a `reportingError` field for this error only).

Each run reserves `reports/smoke/.reservation` exclusively and writes `reports/smoke/<run-id>/result.json`. Disposable resources use a short owned `/private/tmp/ide-smoke-*` directory to fit macOS's Unix-socket path limit; `resources.json` and the result record its exact location. Results record scope, selected suites, versions, timings, request counts, outcome and cleanup disposition. Failures retain disposable resources. Mock runs also capture an app-only screenshot and trace when a page is available; real runs suppress those captures. Missing prerequisites and failures return nonzero. A missing or timed-out application handle leaves shutdown uncertain and retains the reservation.

Exit code 0 means the requested checks passed and cleanup succeeded. Nonzero results distinguish `blocked` prerequisites, `failed` functional assertions and `harness_error` (including uncertain cleanup); inspect `error`, each check's outcome, and `cleanup.errors`. Selected checks that never ran remain `not_run`. Mock request counts may exceed submitted turn counts. Successful file evidence records paths and digests even though disposable files have been removed. Raw reports are ignored local evidence and are not distributed with a clone. Local evidence paths below are relative to the repository root; tracked execution records provide the verification history on GitHub.

After abnormal termination, inspect the reservation's run ID and PID, its report/resources, and any test-owned app before deliberately recovering the reservation. The tester never automatically steals a reservation or closes unrelated processes. A normal failed test with confirmed shutdown releases the reservation while preserving evidence.

The successful qualification result, summarized in the tracked [qualification record](../docs/vscode-smoke-tester-plan.md), records a 1.870-second launch and 1.398-second Chat check (3.629 seconds total). Two matching mock requests completed for the one submitted turn; the UI assertion required one new complete assistant bubble. App/mock shutdown succeeded, disposable resources were removed and the reservation was released. Local evidence (ignored by Git and not available on GitHub): `reports/smoke/2026-10-22T14-50-41-326Z-f2830f31-7388-4990-88b7-1c7bd787b5d1/result.json`. Earlier failed attempts and their evidence remain described in the plan. The developer authorized the compatibility adaptation on 2026-10-22; no VS Code rebuild or application modification was used.

The developer accepted this foundation result before authorizing selected-suite implementation, then accepted the selected suites and final handoff. The later selected-suite results above extend coverage to editing and a follow-up. Qualification remains limited to the pinned host combination and mocked local Chat; real Copilot service behavior remains unverified, and excluded agent workflows remain outside scope.
