# Standalone VS Code smoke tester

The approach used here is based on the [VS Code IDE smoke testing framework](https://github.com/microsoft/vscode/tree/main/test/smoke): launch an installed VS Code build, drive the workbench UI, and verify observable results. This repository implements a standalone tester with its own editing, Git, Python and Copilot Chat suites, isolation, and reporting.

Status: original mocked foundation, selected suites and final handoff developer accepted. `basic` now runs editing → Chat; Git runs only as `--suite git`. After the PR #39 P2 cleanup, compilation and all 74 non-GUI tests pass; a subsequent authorized standalone Git GUI run also passed. The [issue #38 plan](../docs/implementation-plans/issue-38-git-smoke-test.md) records developer-validated phases 1 and 2 and passing fresh/reused production Git-only runs. The previous expanded combined attempts failed during Chat startup; the developer removed that integration from scope. After Ask-selection failures, Chat startup was restored from previously passing `b9a4cc4`; the restored mocked editing/Chat `basic` GUI run passed. Real combined passed before the rename; the latest real `basic` initially failed on a Copilot error/warning, then passed a developer-requested rerun without code changes. Standalone Git passed its latest GUI run. Earlier editing-only, two-turn mocked Chat-only and combined GUI checks used VS Code 1.135.0 / Copilot Chat 0.63.0 on macOS arm64. Real Chat-only and editing/real Chat combined runs passed on 2026-10-23. Real-backend slices 1 and 2 and the PR #39 P2 cleanup are developer validated. The issue #36 sign-in fix is developer validated; signed-out blocking is GUI verified, and authenticated Chat passed after manual sign-in restoration. See the [original qualification record](../docs/vscode-smoke-tester-plan.md) and [real backend execution record](../docs/implementation-plans/real-chat-backend.md).

## Non-GUI commands

Use Node 26.3.1 arm64 on macOS. Run these commands from the repository root (the directory containing `smoke/`):

```sh
npm --prefix smoke ci
npm --prefix smoke run build
npm --prefix smoke run test:unit
```

If your terminal is already in `smoke/`, omit `--prefix smoke`: use `npm ci`, `npm run build`, and `npm run test:unit`.

The project `.npmrc` disables install scripts, omits optional dependencies (including native `fsevents`), and enforces the Node engine. No VS Code, Electron, or browser download is needed. TypeScript compiles the tester and tests into `smoke/dist/`, and the helper into `smoke/helper/dist/`. Unit tests use Node's test runner with concurrency one; their HTTP checks need permission to bind an ephemeral loopback port.

`build` runs lint, formatting checks, and compilation in order, stopping at the first failure.

See [coding standards](CODING_STANDARDS.md) for lint rules and enforcement limits. Run `npm --prefix smoke run format` to apply Prettier formatting before checking changes. Lint and formatting checks do not launch VS Code.

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

The combined suite was renamed from `all` to `basic`. Use `--suite basic`; `--suite all` is no longer accepted. Historical reports retain `all`. The rename passes compilation and 75 non-GUI checks. Renamed mocked `basic` passed GUI verification; real `basic` initially failed on a Copilot error/warning, then passed a developer-requested rerun without code changes. Standalone Git passed afterward. Earlier real combined GUI passes predate the rename.

With an authorized, unlocked, exclusively reserved desktop:

```sh
npm --prefix smoke run smoke -- \
  --build "/Applications/Visual Studio Code.app" \
  --suite basic
```

Select `editing`, `git`, `python`, `chat`, or `basic`; omission defaults to `basic`, editing → Chat. Git is standalone and is never selected by `basic`. Chat startup has been restored from `b9a4cc4`; the restored mocked combined GUI run passed; real combined passed before the rename, but renamed real `basic` passed a developer-requested rerun after an earlier Copilot error/warning failure. The runner uses one sequential process and no automatic retries, a 60-second launch deadline, and a 120-second deadline for each of editing, Git and mocked Chat, with Git subprocesses bounded to 10 seconds and UI operations to 15 seconds. Real Chat allows 120 seconds per turn and 300 seconds total. Results use `scope: "selected-suites"` and a separate outcome/evidence entry for each check. A failed check stops dependent checks, which remain `not_run`.

- Editing opens `existing.txt` through Quick Open, replaces its contents using the shipped driver, saves through VS Code, and independently compares exact UTF-8 bytes. It creates an untitled editor and saves through the simple Save As dialog to the initially absent `created.txt`. Both files are closed/reopened and their displayed lines and disk bytes checked. After the final verification, all editors are closed before the editing suite completes. Result evidence includes paths, byte counts, SHA-256 digests and reopened display contents. Only initial fixture setup writes directly to disk; the helper never edits files.
- Chat opens one fresh local sidebar session, selects Ask, and submits a prompt and follow-up through the UI. Each uses a unique marker and a distinct synthetic reply. Every turn requires the same local identity, the matching visible prompt, a fresh completed mock request and exactly one additional completed assistant bubble with the exact reply. The follow-up also verifies the original prompt/reply remain intact. Result evidence records session identity and both completed turns.
- Git initializes the fresh disposable workspace through VS Code, creates `git-smoke.txt` through the editor, stages only that file and commits with the synthetic author `Smoke Test <smoke-test@example.invalid>`. A pass requires the exact unique message in Source Control Graph plus independent verification of one root commit, full hash, message, author, exact committed bytes, target-only tracked paths, empty index and no remotes. Existing editing fixtures remain untracked. The Graph UI need not reveal the hash.
- Combined runs editing and then Chat in the same isolated app/workspace. The default mock backend exercises no Copilot CLI, Agents Window, tools, code-edit proposals or real-model responses. The optional real backend below exercises authenticated Chat.

Before Git was added to `basic`, editing-only, Chat-only and the former editing/Chat combined commands passed on 2026-10-22; see the tracked [verification record](../docs/vscode-smoke-tester-plan.md). Local evidence (ignored by Git and not available on GitHub): `reports/smoke/selected-suites-verification-2026-10-22/checks.json` and `reports/smoke/2026-10-22T15-05-40-631Z-8f01daf4-57b6-4749-8dd8-2745e7df7422/result.json`, relative to the repository root. Editing-only took 2.899 seconds, Chat-only 3.948 seconds and combined 4.924 seconds including launch/shutdown. Every run confirmed shutdown, removed disposable resources and released the reservation.

## Git suite and persistent profile

After compilation and separate GUI authorization:

```sh
npm --prefix smoke run smoke -- --build "/Applications/Visual Studio Code.app" --suite git
```

Git-only starts no mock server, injects no synthetic Chat credentials/endpoints/proxy, initializes no Chat storage and disables the Copilot extension for its owned instance. It uses in-memory secret storage. Reports explicitly show Chat not selected, with `mockRequestEvidence: "inapplicable"`, `mockRequestCount: null` and `requests: null`, including recoverable early errors. `basic` neither prepares Git nor uses the Git profile; an editing failure leaves Chat `not_run`.

Git-only creates/reuses ignored `profiles/smoke-git/{user-data,extensions,state}` with marker `ide-tester:smoke-git:v1`. They refuse unowned, redirected or open profile state and preserve the profile on every outcome. Cleanup removes only owned disposable workspace/home/tmp/Git-isolation resources after success and verified shutdown. Inspect abnormal shutdowns before deliberate recovery; never delete profile storage or locks automatically. Existing personal profiles, the real profile, root `.vscode/` and preserved workspace data remain unchanged by this preparation.

The tester merges only these owned settings: `files.autoSave=off`, `editor.formatOnSave=false`, `files.simpleDialog.enable=true`, `workbench.startupEditor=none`, `workbench.tips.enabled=false`, `window.restoreWindows=none`, `security.workspace.trust.enabled=false`, `update.mode=none`, `extensions.autoUpdate=false`, `extensions.autoCheckUpdates=false`, `telemetry.telemetryLevel=off`, `chat.disableAIFeatures` and `git.path=/usr/bin/git`. Git-only sets `chat.disableAIFeatures=true` and removes the owned `chat.allowAnonymousAccess` and `github.copilot.advanced.debug.overrideProxyUrl`, `overrideCapiUrl`, `overrideAuthType` keys. Other settings/state are preserved. Git profile preparation supports only standalone Git: it preserves existing Chat storage and extension enablement state without opening or repairing the database. `basic` uses a fresh disposable mock profile or the dedicated real Chat profile, without touching `profiles/smoke-git`.

Graph reset occurs through visible UI: each fresh workspace has only its owned root repository, so the installed single-provider view selects it automatically; a repository picker unexpectedly appearing is a harness contract error. The driver selects All in the Graph reference picker before matching the unique message. It never deletes view-state databases. Existing persisted workspace Graph state is isolated by fresh workspace paths.

Git verification uses `/usr/bin/git` (phase-1 Apple Git 2.39.5), probes command-line-tools availability before launch, clears inherited Git routing/author/config overrides, disables system configuration and supplies an owned empty global config to both app and verifier. Repository-local identity, disabled signing/hooks and an empty credential helper keep the journey local. No production Git subprocess initializes, stages or commits. Fresh owned extension logs must confirm the same executable/version as the verifier; a mismatch blocks. Git isolation applies only to the standalone Git suite.

Fresh, reused and normal-checkout production Git-only GUI runs passed during phase 3. Phase-3 tasks P3-T01–P3-T03 and P3-DV are complete; the developer accepted the revised standalone-Git story. Expanded editing/Git/Chat qualification and its mandatory real combined gate were superseded by the developer's standalone Git decision; the subsequent Chat restoration from `b9a4cc4` passed mocked combined GUI verification; real combined passed before the rename, but renamed real `basic` passed a developer-requested rerun after an earlier Copilot error/warning failure. See the [plan and evidence](../docs/implementation-plans/issue-38-git-smoke-test.md).

## Python suite and persistent profile

Python production implementation is developer accepted through phase 2 of the [issue #40 plan](../docs/implementation-plans/issue-40-python-smoke-test.md). Production fresh-install, reused-profile and safe negative qualification checks passed on 2026-10-24. **Phase 3 is complete and developer accepted (2026-10-24).** The [accepted feasibility findings](../docs/research/issue-40-python-feasibility.md) retain the earlier mechanism and safety evidence.

Both production runs used macOS arm64, Node 26.3.1, VS Code 1.135.0, Python 3.12.15 arm64, Python extension 2026.10.0, Python Debugger 2026.6.0, Pylance 2026.4.1 and Python Environments 1.40.0. Fresh installation took 15.619 seconds total and reuse took 10.195 seconds. Each verified the UI installation/enabled state, exact editor-created source, explicit interpreter selection and combined fresh terminal/program JSON evidence, preserved all 2,643 protected entries and both persistent profiles, confirmed owned main-process exit code 0, removed disposable resources and released the reservation. The retained `.venv/bin/python` symlink path was exercised; paths containing spaces remain unverified.

Ignored local evidence, relative to the repository root: fresh `reports/smoke/2026-10-24T16-00-26-245Z-346f9ad4-bcd2-411f-bf4a-4e2f0d9251bf/{result.json,result.txt,preservation-before.json}`; reuse `reports/smoke/2026-10-24T16-00-58-465Z-f5aba6ba-b0ea-491c-8110-17eabc6297fd/{result.json,result.txt,preservation-before.json}`. These reports are private local artifacts and are not distributed with a clone. The plan records the qualification checks and remaining gates.

Negative qualification confirmed an absent interpreter blocks before launch (`reports/smoke/2026-10-24T16-01-21-902Z-ab87bba4-fbaf-4f26-95b2-3be4d6ca32fc/result.json`). When a disposable non-executable non-Python file was selected through the UI, the extension fell back to an existing Python 3.14.5 x86_64 interpreter; the suite correctly failed at `python-run` for canonical identity mismatch despite complete greeting/output. That is observed fallback rejection; unusable-interpreter blocking in the UI remains unverified. The failed run confirmed main exit 0 and 2,643 unchanged protected entries, retained disposable diagnostics and released the reservation (`reports/smoke/2026-10-24T16-01-35-262Z-71ed84c6-0e52-455d-8bc0-d67870d3a494/result.json`). The fallback interpreter is not a qualified passing combination.

After compilation and separate GUI authorization, with an unlocked exclusively reserved desktop:

```sh
npm --prefix smoke run smoke -- \
  --build "/Applications/Visual Studio Code.app" \
  --suite python \
  --python-interpreter "/Users/jim/Desktop/genai/ide-tester/.venv/bin/python"
```

`--python-interpreter` is required only for Python and accepts one file path, including relative paths and spaces. Quote paths containing spaces. Relative paths resolve against the invocation working directory. Preflight checks file presence and resolves symlinks without running the interpreter, checking executable permissions, inspecting its contents or imposing a version/venv requirement. The exact absolute invocation path goes through the Python interpreter picker, preserving venv symlink semantics. Runtime verification compares canonical `sys.executable` paths; environments sharing one canonical executable are not distinguished. An unusable interpreter is detected during the observed UI journey. Python rejects real Chat and foundation qualification; the default mock option starts no mock server and selects no Chat, Git profile or Chat helper. Reports show Chat not selected and null, inapplicable mock request evidence.

The standalone journey installs/enables Microsoft `ms-python.python` through the Extensions UI, creates/saves/reopens `hello.py` through the editor, selects the supplied interpreter through its UI and invokes **Run Python File in Terminal**. It records fresh versus reused installation and actual installed extension/dependency versions; compatibility claims apply only to observed combinations. Fresh production qualification needs Marketplace connectivity and an initially absent extension. Do not reset a persistent profile to manufacture that condition. Extension update suppression is best effort; effective prevention of update drift is an accepted unverified risk.

A pass requires exact independently checked saved bytes, a token-free terminal baseline, fresh greeting/current-run identity/completion markers read through the installed terminal driver, and matching bounded program-written JSON together. The JSON must identify this run, script and canonical interpreter; saved source is rechecked before acceptance. Greeting alone, command echo, stale/partial output or a lone evidence file cannot pass. The harness never runs the program itself or injects a terminal run command. Observed program errors fail. Independent Python exit status is not required or claimed, and deliberate interruption/cancellation qualification remains waived.

Production owns ignored `profiles/smoke-python/{user-data,extensions,state}` with `.owner` marker `ide-tester:smoke-python:v1`; the separate `profiles/smoke-python-feasibility` remains preserved. Preparation refuses unowned, redirected, malformed or open state, atomically merges owned settings and preserves unrelated settings/database bytes. Both profiles survive success and failure. There is no profile override or automatic lock deletion. Normal isolation disables Chat, uses in-memory secret storage, suppresses updates/telemetry/startup prompts, and removes owned mock endpoint/auth settings. Python settings suppress environment creation, experiments, module installation, terminal environment activation and env-file loading. Editor settings suppress formatting, indentation and automatic insertions that would change source. The dedicated terminal uses `/bin/bash --noprofile --norc`, disabled shell integration/persistent sessions, controlled disposable HOME/TMPDIR, `PYTHONDONTWRITEBYTECODE=1`, `PYTHONNOUSERSITE=1`, `PIP_NO_INDEX=1` and `PIP_DISABLE_PIP_VERSION_CHECK=1`.

The launch retains the phase-1-approved outer macOS write-denial guard and Chromium `--no-sandbox` exception. It protects retained Python/environment metadata, editor settings, preserved workspaces and resolved interpreter installation, with protected-content inventories checked after confirmed shutdown. Suppression settings and matching inventories alone do not establish write prevention. No Python/package/environment installation or synchronization is permitted. Sentinel denial checks use disposable fixtures. Never test mutation against retained resources or repair unexpected changes.

The scenario has an eight-minute limit, with launch 60 seconds, extension readiness 180, editor work 120, interpreter selection 60 and execution 60, all bounded by the shared deadline. Every awaited UI action and acceptance check is fenced; expiry stops new actions. Cleanup has a separate 120-second budget including a 60-second close limit. It requires the actual owned main-process exit, settled pending work and unchanged preservation evidence before releasing the reservation or removing successful disposable resources. Uncertain/expired cleanup retains resources and reservation as a harness error, while preserving the original suite outcome. Main-process exit is the accepted termination contract: surviving detached/reparented descendants remain unverified, and preservation comparison is a point-in-time observation.

Reports include stage/timings, interpreter paths, installed versions, partial execution evidence and cleanup disposition. Missing interpreter/prerequisites are blocked; observed installation/execution/evidence mismatches fail; broken observation, ownership or shutdown contracts are harness errors. An installation timeout is not automatically a connectivity block. Use [results and recovery](#results-and-recovery) for owned-resource inspection; GUI qualification and manual authentication, if needed, require separate authorization.

## Optional real Copilot backend

Use `--chat-backend mock|real`; omission defaults to `mock`. Real mode supports `chat` and `basic`. Editing-only, Git-only, Python-only and foundation qualification reject real mode. Real two-turn Chat passed on the pinned host versions on 2026-10-22; combined real mode also passed on 2026-10-23. The issue #36 sign-in fix is developer validated; signed-out blocking is GUI verified, and authenticated Chat passed after manual sign-in restoration.

After compilation, with GUI authorization and an unlocked, exclusively reserved desktop, initialize the dedicated profile:

```sh
npm --prefix smoke run setup:real-chat -- --build "/Applications/Visual Studio Code.app"
```

Setup accepts only `--build`. It reserves `reports/smoke/.reservation`, creates the ignored `profiles/smoke-real-chat` profile, and opens a disposable workspace. Follow the [official Copilot sign-in workflow](https://code.visualstudio.com/docs/setup/copilot) manually, then close the setup window. Setup confirms owned application shutdown before releasing the reservation. It records no screenshots or traces and does not verify sign-in success. Authentication is checked by the Chat run; expired/missing authentication, entitlement and quota prerequisites return `blocked` with setup instructions.

Setup sets `github-authentication.preferDeviceCodeFlow` to `true` so the initial sign-in uses device-code authentication. Click **Copy & Continue to Browser**, enter the device code manually on GitHub, and finish authorization before closing the dedicated window. This avoids starting with the HTTP loopback flow that Safari blocked with HTTPS-Only enabled in [issue #36](https://github.com/jimthompson5802/ide-tester/issues/36). The preference is covered by non-GUI tests; the developer validated the sign-in fix on 2026-10-23 after manual setup and passing real Chat-only and combined smoke runs. See the [fix plan and verification record](../docs/implementation-plans/issue-36-device-code-sign-in.md).

After setup closes:

```sh
npm --prefix smoke run smoke -- \
  --build "/Applications/Visual Studio Code.app" \
  --suite chat --chat-backend real
```

Use `--suite basic --chat-backend real` for editing → real Chat (latest renamed real rerun passed) in the same dedicated instance and disposable workspace. Real mode starts no mock server, injects no endpoint overrides or synthetic credentials, and uses normal persistent secret storage. Launch environment variables are limited to normal host variables and dedicated state paths. Anonymous Chat is disabled. Setup refreshes anonymous-access and device-code settings in older closed, owned profiles while preserving unrelated settings and authentication state; an explicit device-code preference of `false` becomes `true` during setup. Normal test runs leave these settings unchanged and do not require the device-code preference. Existing mock endpoint/auth overrides are rejected.

The profile has dedicated user data, extensions and state directories and is preserved after successful and failed runs. Setup rejects unowned directories and symlinked profile paths. The shared reservation and profile singleton checks require setup to be closed before testing. Inspect abnormal shutdowns deliberately; the runner does not remove profile locks or adopt existing profiles.

The real journey opens a fresh local Chat session and selects Ask through the visible command palette because the authenticated mode menu can omit legacy Ask. Debug logging is enabled for the owned instance so session-binding events are available. It submits a unique `SMOKE_<UUID>` token with an exact-reply instruction, then asks for the same token from the previous answer using a different prompt marker. Both replies must contain exactly that token after trimming outer whitespace. Added prose or Markdown fails, even when connectivity works. Each turn requires exactly one fresh completed assistant bubble, the matching prompt and unchanged session; the follow-up must preserve the first exchange. The runner checks explicit error UI and exports only the active test Chat through VS Code's Export Chat command to verify raw Markdown and a successful terminal model state. Known thinking parts and empty MCP startup status are excluded from final-answer Markdown; unknown parts still fail closed. Informational toasts do not count as service errors. This prevents formatted or cancelled token text from passing. Temporary exports are deleted after reading. Missing export/UI contracts produce `harness_error`.

Real turns allow 120 seconds each and a 300-second total Chat deadline, with no automatic retries. Response mismatches, service errors and response timeouts return `failed`; prerequisite failures return `blocked`; harness/cleanup errors return `harness_error`. JSON records backend, submitted prompts, expected replies (`reply`), observed replies, session identity, completion, counts and timings, including available partial evidence on failure. Real reports use `mockRequestEvidence: "inapplicable"`, `mockRequestCount: null` and `requests: null`. Text output displays the backend.

Secret storage follows the [tester policy](AGENTS.md#secret-storage). In-memory storage applies outside real Chat. Real Chat alone may reuse saved authentication in the dedicated real profile and VS Code may read its existing Keychain encryption key for that purpose. No Keychain creation, updates, unlocking, reset, deletion or unrelated access is authorized; unavailable keys or any Keychain dialog block execution without dialog interaction. New manual setup needs applicable authorization and does not authorize creating a replacement Keychain key.

Real runs record no screenshots or Playwright traces, including combined runs, to keep authentication screens and credentials out of diagnostics even if sign-in expires during execution. Reports retain only the test conversation's selected evidence and sanitized error reasons. Dedicated profile data stays private and ignored. See the [execution record and remaining GUI checks](../docs/implementation-plans/real-chat-backend.md).

## Foundation GUI qualification

Before executing, obtain explicit GUI authorization and confirm an unlocked, exclusively reserved desktop. Use the installed VS Code 1.135.0 application with bundled Copilot Chat 0.63.0. Other versions are blocked at this compatibility checkpoint.

```sh
npm --prefix smoke run qualify -- \
  --build "/Applications/Visual Studio Code.app" \
  --suite chat
```

This retained command runs one sequential qualification in the tester process, with no retries. It uses Playwright's Electron launcher and Playwright Test assertions; it does not start a browser or a pool of workers. `--suite basic` also qualifies only this foundation exchange, and the JSON result explicitly records `scope: "foundation"`. `--suite editing`, `--suite git` and `--suite python` are blocked for `qualify`; use `smoke` for the complete selected suites.

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
npm --prefix smoke run smoke -- --build "/Applications/Visual Studio Code.app" --suite basic --output json
```

The summary distinguishes PASSED, FAILED, BLOCKED, HARNESS ERROR and NOT RUN. Suite outcomes come from individual checks; a cleanup failure can leave suites PASSED while the final harness disposition is HARNESS ERROR. Available suite and total durations, failure reasons and cleanup errors are included, along with the resource path when resources are retained. Missing suite or cleanup information is shown as Unavailable. Early errors such as an existing reservation may have no report directory or saved artifacts. A text-report write failure returns nonzero and identifies the reporting error while preserving the saved JSON (JSON terminal mode adds a `reportingError` field for this error only).

Each run reserves `reports/smoke/.reservation` exclusively and writes `reports/smoke/<run-id>/result.json`. Disposable resources use a short owned `/private/tmp/ide-smoke-*` directory to fit macOS's Unix-socket path limit; `resources.json` and the result record its exact location. Results record scope, selected suites, versions, timings, request counts, outcome and cleanup disposition. Failures retain disposable resources. Mock runs also capture an app-only screenshot and trace when a page is available; real runs suppress those captures. Missing prerequisites and failures return nonzero. A missing or timed-out application handle leaves shutdown uncertain and retains the reservation.

Exit code 0 means the requested checks passed and cleanup succeeded. Nonzero results distinguish `blocked` prerequisites, `failed` functional assertions and `harness_error` (including uncertain cleanup); inspect `error`, each check's outcome, and `cleanup.errors`. Selected checks that never ran remain `not_run`. Mock request counts may exceed submitted turn counts. Successful file evidence records paths and digests even though disposable files have been removed. Raw reports are ignored local evidence and are not distributed with a clone. Local evidence paths below are relative to the repository root; tracked execution records provide the verification history on GitHub.

After abnormal termination, inspect the reservation's run ID and PID, its report/resources, and any test-owned app before deliberately recovering the reservation. The tester never automatically steals a reservation or closes unrelated processes. A normal failed test with confirmed shutdown releases the reservation while preserving evidence.

The successful qualification result, summarized in the tracked [qualification record](../docs/vscode-smoke-tester-plan.md), records a 1.870-second launch and 1.398-second Chat check (3.629 seconds total). Two matching mock requests completed for the one submitted turn; the UI assertion required one new complete assistant bubble. App/mock shutdown succeeded, disposable resources were removed and the reservation was released. Local evidence (ignored by Git and not available on GitHub): `reports/smoke/2026-10-22T14-50-41-326Z-f2830f31-7388-4990-88b7-1c7bd787b5d1/result.json`. Earlier failed attempts and their evidence remain described in the plan. The developer authorized the compatibility adaptation on 2026-10-22; no VS Code rebuild or application modification was used.

The developer accepted this foundation result before authorizing selected-suite implementation, then accepted the selected suites and final handoff. The later selected-suite results above extend coverage to editing and a follow-up. Qualification remains limited to the pinned host combination and mocked local Chat; real Copilot service behavior remains unverified, and excluded agent workflows remain outside scope.
