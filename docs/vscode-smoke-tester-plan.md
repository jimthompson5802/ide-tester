# Standalone VS Code editor and mocked Copilot smoke tester

## Summary and plan artifact

First save this plan to **`docs/vscode-smoke-tester-plan.md`**. Saving the plan is a documentation-only step and does not authorize implementation or GUI execution.

Build an independent TypeScript tester in `ide-tester`, using Playwright to drive the pre-installed VS Code application. Compile only the tester, its helper extension, and selected tests.

| Suite | Initial checks |
|---|---|
| Editing | Open an existing file, edit/save it, and independently verify disk contents. Create/save a new file and verify its contents. |
| Copilot Chat | Open a fresh local sidebar Chat session, submit a prompt and follow-up, and verify two distinct completed responses from a local mock server. |

Target macOS first. Use VS Code’s smoke suite as a reference without copying or importing its automation package. The neighboring `vscode` checkout must not be required to install, compile, or run this tester.

## Implementation

**Project and commands**

- Create an isolated Node project under `smoke/`, including its package manifest, lockfile, TypeScript configuration, source, helper extension, and tests. Preserve existing root uv files and environments.
- Initially qualify Node **26.3.1 arm64**, TypeScript **6.0.2**, and Playwright Test **1.61.1**. Lock dependencies and avoid native compilation.
- Compile TypeScript to JavaScript before running tests. Do not download VS Code, Electron, or browser binaries, or invoke VS Code build scripts.
- Provide:

```bash
npm --prefix smoke ci
npm --prefix smoke run compile
npm --prefix smoke run test:unit

npm --prefix smoke run smoke -- \
  --build "/Applications/Visual Studio Code.app" \
  --suite all
```

- Accept suites `editing`, `chat`, and `all`, defaulting to `all`. Require an explicit installed `.app` path and reject unsupported platforms or invalid arguments before launch.
- Run sequentially with one worker and no automatic retries.

**Application lifecycle and isolation**

- Resolve the supplied app’s executable and record VS Code and bundled Copilot versions.
- Launch it through Playwright’s Electron API; this API accepts an executable path and remains experimental. [Playwright reference](https://playwright.dev/docs/api/class-electron)
- Create fresh user-data, extension, workspace, and Copilot state directories for each run. Preserve existing profiles, regular windows, `.vscode/`, `.venv/`, and saved workspace data.
- Enable the shipped smoke driver and implement only the typed wrapper needed for workbench readiness and editor input. Use Playwright for commands, controls, and assertions.
- Use a 60-second launch deadline and 120-second test deadlines. Wait for observable state rather than fixed sleeps.
- Close only the launched application and owned mock server. Remove temporary resources after successful shutdown; retain them on test failure or uncertain shutdown.
- Prevent concurrent runs in this checkout with an exclusively created reservation. Leave abnormal-termination reservations for deliberate recovery.

**Editing suite**

- Disable autosave and formatting-on-save in the disposable profile.
- Open `existing.txt` through Quick Open, replace its text, save through the IDE, and independently compare exact UTF-8 bytes on disk.
- Create an untitled editor, enter fixed text, and Save As `created.txt` within the disposable workspace.
- Enable VS Code’s simple file dialog in the disposable profile so Playwright can drive Save As.
- Require the new destination to be initially absent. Verify its exact location and contents, then close/reopen both files and check displayed contents.
- Fixture setup may write initial files; the tests and helper extension must not write the expected edited results.

**Mocked Copilot Chat suite**

- Compile a minimal development extension exposing a tester command that opens the intended local Chat session. It must not submit prompts, generate responses, or edit files.
- Implement a local HTTP mock on an ephemeral loopback port, covering model discovery, synthetic token/session responses, and streaming Chat Completions required by the selected flow.
- Advertise one deterministic model. Configure endpoint overrides and synthetic automation credentials before launch. Never use real credentials or fall back to real model responses.
- Initialize the fresh profile’s built-in Chat enablement state with Node’s bundled SQLite API where required.
- Submit a prompt and follow-up through the Chat UI in one session. Give each turn a unique marker selecting a distinct synthetic response.
- For each turn, require a matching new mock request, completed streaming, and a newly completed assistant bubble with exactly the expected reply. Reject stale or partial responses.
- Exclude Copilot CLI, Agents Window, tool execution, code-edit proposals, and real-service authentication.

## Delivery and verification

1. **Save the plan:** Write this complete plan to `docs/vscode-smoke-tester-plan.md` and verify its contents. Stop without starting implementation.
2. **Foundation and compatibility checkpoint, once authorized:** Use TDD to implement the build, runner, mock server, helper extension, and focused non-GUI tests. With separately authorized GUI access, qualify launch, driver availability, and one mocked Chat exchange against installed VS Code 1.135.0 / Copilot Chat 0.63.0. Stop for developer validation.
3. **Selected suites, after foundation acceptance:** Implement editing and the complete prompt/follow-up flow. Verify editing-only, Chat-only, and combined commands on the host. Stop for developer validation.
4. **Handoff:** Document verified setup, compilation, execution, artifacts, and compatibility limits. Update README and repository instructions.

Non-GUI tests cover argument validation, app resolution, fixture ownership, teardown failures, model discovery, streaming completion, malformed requests, and latest-turn matching. Include regressions proving stale and incomplete responses cannot pass.

Save JSON results and failure screenshots/traces under ignored `reports/smoke/<run-id>/`. Record versions, selected suites, timings, mock request counts, outcomes, and cleanup disposition. Failures and missing prerequisites return nonzero with a clear explanation.

## Assumptions and limits

- Saving the plan, implementation, and GUI execution are separate authorization steps.
- A small helper extension is permitted; initial Chat responses are mocked.
- The installed VS Code application remains unchanged.
- Smoke-driver access and Copilot mock hooks are version-dependent. Static inspection found relevant hooks, but host qualification is still required. If incompatible, stop and report the limitation rather than rebuilding or modifying VS Code.
- GUI checks require an available reserved desktop and explicit authorization.
- Historical milestone plans remain reference material; this replacement follows the checkpoints above.

## Execution record — 2026-10-22

**Current status: complete; developer accepted.** The foundation, selected suites and final handoff are accepted. Editing-only, Chat-only and combined commands pass. Earlier blocked/failed attempts below are retained as history, not the current result. No outstanding checkpoint or implementation task remains in this plan.

- [x] Save and reread the complete plan. Developer subsequently authorized execution of the next phase.
- [x] Establish the isolated `smoke/` package manifest, lockfile and TypeScript configuration. Verified Node v26.3.1, npm 11.16.0 and arm64. `npm --prefix smoke ci --ignore-scripts --fetch-retries=0 --fetch-timeout=15000` passed (8 packages; zero reported vulnerabilities). No browser, Electron or VS Code binaries were downloaded. Root Python metadata and environments remain unchanged.
- [x] Inspect installed application metadata without launching: VS Code 1.135.0 and bundled Copilot Chat 0.63.0.
- [x] Confirm public test boundaries: developer confirmed CLI/app resolution; owned run-resource lifecycle; loopback HTTP protocol; latest-turn verification on 2026-10-22.
- [x] Implement and verify the non-GUI foundation using TDD: argument/app validation, owned run resources and reservation, synthetic HTTP mock, profile/SQLite initialization, current-turn matching, JSON reporting, and command exit codes. All 15 tests pass after a clean `npm --prefix smoke ci` and `npm --prefix smoke run compile`.
- [x] Compile the helper extension and foundation Electron/driver/Chat qualification code. The helper only opens a local session; the tester selects and verifies Ask through the visible UI. Single-exchange GUI behavior is now verified.
- [x] Keep README and repository current-state instructions consistent with the partial replacement. Full handoff remains a later checkpoint.
- [x] Complete foundation verification, including the GUI compatibility checkpoint below. Status: implementation verified; developer validation pending. Final compilation and all 16 non-GUI tests pass; the authorized single-exchange GUI qualification passes.
- [x] Obtain separate GUI authorization and confirmation of an unlocked reserved desktop: developer replied “yes” to that request on 2026-10-22.
- [x] Qualify launch and smoke-driver readiness against installed VS Code 1.135.0 / Copilot Chat 0.63.0 after correcting the tester's overlong macOS socket path.
- [x] Qualify one mocked sidebar Chat exchange using the developer-authorized alternate session tracking. See the successful result and compatibility adaptation record below.
- [x] Foundation developer validation: developer explicitly accepted the foundation on 2026-10-22.
- [x] Selected suites and their developer validation: developer replied “i accept” after the selected-suite validation instructions on 2026-10-22.
- [x] Handoff and final developer validation: developer explicitly said “I accept the handoff” on 2026-10-22. Documentation and link checks completed below; no additional approval is required.

Dependency note: npm does not publish `@types/vscode` 1.135.0. The helper's type dependency is pinned to published 1.140.0; it uses only stable command-registration/execution APIs. Compilation and the helper's session-opening behavior against the installed application pass. TypeScript remains 6.0.2 and Playwright Test remains 1.61.1. Project `.npmrc` disables install scripts, omits optional native `fsevents`, and enforces Node 26.3.1. The exact planned `npm --prefix smoke ci` command passed with seven installed packages. Playwright's [Electron API documentation](https://playwright.dev/docs/api/class-electron) confirms executable-path launch support and its experimental status.

Static reference inspection covered the neighboring checkout's driver interface and mock environment/profile initialization. That checkout is a research reference only, not a build or runtime dependency. Static inspection does not establish GUI compatibility.

### Checks and evidence

- [Compilation log](../reports/smoke/foundation-nongui-2026-10-22/compile.log): `npm --prefix smoke run compile`, exit 0; compiles only the tester, non-GUI tests and helper.
- [Non-GUI regression log](../reports/smoke/foundation-nongui-2026-10-22/unit-tests.log): `npm --prefix smoke run test:unit`, exit 0; 15 passed, zero failed/skipped. Loopback tests required execution outside the filesystem/network sandbox because its socket bind returned `EPERM`.
- The tests cover valid/invalid arguments, installed executable and metadata resolution, concurrent reservations, fixtures, redirected paths, failure/uncertain teardown, mock model discovery and policy, token/session routes, SSE completion, malformed/stale markers, fresh-profile settings/SQLite state, blocked reporting, a rejecting fake Electron launcher, and stale/incomplete assistant snapshots. The fake launcher never starts VS Code.
- TDD observations: new public modules initially failed compilation as missing imports; adding their minimal implementation made their tests run. Runtime regressions exposed symlinked-report deletion and per-model discovery returning 404; each then passed after its fix. An app-fixture assertion needed canonical macOS temporary paths. No error reached four unsuccessful fix rounds.
- Static installed-app resolution through the implemented resolver returned `/Applications/Visual Studio Code.app/Contents/MacOS/Code`, VS Code 1.135.0, Copilot Chat 0.63.0. This did not launch the executable.
- Root Python metadata, `.venv/`, `.vscode/`, preserved profiles and saved workspace data were not changed. No browser/VS Code/Electron binaries were downloaded, no native compilation ran, and no neighboring checkout code is imported by the tester.

### Foundation qualification and remaining gate

The additional `npm --prefix smoke run qualify -- --build "/Applications/Visual Studio Code.app" --suite chat` command isolates the single-exchange compatibility checkpoint from the complete suites. It uses one sequential tester process with Playwright Electron and Playwright Test assertions, without a worker pool or automatic retries. It writes `scope: "foundation"`; even `--suite all` cannot claim a complete-suite pass. The normal `smoke` command now executes the selected suites under `scope: "selected-suites"`.

See the [usage and observable GUI checks](../smoke/README.md). GUI access and the compatibility adaptation were authorized, and qualification passed as recorded below. The developer subsequently accepted the foundation and authorized delivery step 3. Selected-suite validation is now pending before delivery step 4.

### Authorized GUI qualification — 2026-10-22

Command: `npm --prefix smoke run qualify -- --build "/Applications/Visual Studio Code.app" --suite chat`.

1. [Initial result](../reports/smoke/2026-10-22T14-33-32-964Z-1ff05fdd-dbcc-478b-8f3b-f73dbd0107b5/result.json): immediate exit before a window; zero mock completion requests. Cleanup also errored, so resources and reservation were retained.
2. [Diagnostic launch log](../reports/smoke/foundation-nongui-2026-10-22/launch-diagnostic.log): same command with `DEBUG=pw:browser`, reproducing the failure in under a second. VS Code reported that its IPC socket path exceeded 103 characters and exited with `listen EINVAL`. Playwright connected successfully before that app-startup exit. No app or matching test-owned child remained; reservations for these two attempts were deliberately moved into their respective reports as `reservation-recovered.json` after scoped process inspection.
3. Fix round 1 for the socket-path error: add a resource-lifecycle regression requiring the user-data socket path to fit 103 bytes (observed failure); allocate fresh resources under short owned `/private/tmp/ide-smoke-*` paths, record their location in `resources.json` and results, and retain ownership checks for both report and resources paths. Compilation and all 15 non-GUI tests then passed. The GUI rerun no longer reproduced the socket error.
4. [Rerun result](../reports/smoke/2026-10-22T14-35-52-757Z-69eafade-3014-4720-a497-8fb7811b8417/result.json): launch and driver readiness passed in 1,885 ms. Chat session-binding assertion failed because `.chat-viewpane[data-bound-chat-resource]` was absent. Total run 7,528 ms; zero completion requests; normal app/mock shutdown; reservation released. Resources retained at `/private/tmp/ide-smoke-WlJshR`.
5. [Failure screenshot](../reports/smoke/2026-10-22T14-35-52-757Z-69eafade-3014-4720-a497-8fb7811b8417/failure.png) and [trace](../reports/smoke/2026-10-22T14-35-52-757Z-69eafade-3014-4720-a497-8fb7811b8417/trace.zip) preserve the test-owned UI. Sidebar Chat is visible but still displays Agent mode; intended Ask selection is not verified. Disposable extension logs also report model/remote-agent contract errors and a `nesModels` filter exception; these remain unresolved, not a passing mock integration.
6. Static inspection of the installed `Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js` confirms `data-bound-chat-resource` is absent, although the Chat view and mode-picker selectors exist. The neighboring checkout's session-binding hook is therefore unavailable in this installed build. The recorded run outcome remains `failed`; this subsequent diagnosis classifies the missing prerequisite as a compatibility blocker. [Compatibility evidence](../reports/smoke/2026-10-22T14-35-52-757Z-69eafade-3014-4720-a497-8fb7811b8417/compatibility.json).

At this point work stopped under the plan's explicit incompatibility rule. No app rebuild/modification, alternate session-tracking method, model fallback, or selected-suite implementation had been attempted. No four-round limit was reached: the socket error was fixed in one round; no fix round had been attempted for the missing Chat hook. The developer subsequently authorized session-tracking revision as recorded below.

### Authorized compatibility adaptation and successful checkpoint — 2026-10-22

The developer replied “yes” to revising session tracking for the installed build. Existing GUI authorization and desktop reservation remained applicable. Implementation stayed within the foundation; no selected suite was started.

- [x] Replace the absent DOM attribute with the installed build's local conversation URI from owned renderer-log `ChatModelSelection` events for `surface="workbench"`, `widgetViewKind="view"`. Require a new local identity after opening Chat and the same identity after the response. Ignore unrelated editor events and fail closed on absent/unbound/non-local identities. Added a non-GUI session regression, observed its initial missing-module failure, then verified it passes.
- [x] Strengthen turn matching with the current prompt's unique visible marker, alongside the same-session, exact new bubble, completed stream and fresh request checks. The new stale/missing-prompt regression initially failed (`true` instead of `false`) and then passed after implementation.
- [x] Make `/models` satisfy both Chat discovery (`data: [one model]`) and proxy inline-edit discovery (`models: []`). The added response-contract assertion initially failed on the missing array and then passed. No additional Chat model or real-service fallback was introduced.
- [x] Select Ask through the visible mode picker and assert its displayed text. The helper command only opens the local session. Click selection encountered the installed context-view pointer blocker; menu keyboard navigation using the observed Ask row position succeeded. This does not force DOM clicks or change the app.
- [x] Target Monaco's actual `.native-edit-context` element in the shipped driver instead of the parent editor. The host exposed `Edit context not found` with the parent selector; the corrected input target passed.
- [x] Final `npm --prefix smoke run compile`: exit 0 ([log](../reports/smoke/foundation-qualification-2026-10-22/compile.log)). Final `npm --prefix smoke run test:unit`: exit 0, 16 passed, zero failed/skipped ([log](../reports/smoke/foundation-qualification-2026-10-22/unit-tests.log)).
- [x] Single-exchange GUI qualification: exit 0 ([result](../reports/smoke/2026-10-22T14-50-41-326Z-f2830f31-7388-4990-88b7-1c7bd787b5d1/result.json)). VS Code 1.135.0 / Copilot Chat 0.63.0, Node 26.3.1 arm64, TypeScript 6.0.2, Playwright 1.61.1. Launch/readiness 1,870 ms; Chat 1,398 ms; total 3,629 ms. The UI check required the exact new completed synthetic reply in the same local session. The mock recorded two completed matching requests for the single submitted turn; request count is not assumed to equal turn count. Normal application/mock shutdown, resources removed, reservation released.
- [x] Developer validation of the foundation checkpoint: accepted on 2026-10-22. Developer separately authorized delivery step 3 after that acceptance.

Preserved adaptation failures: [Ask selector](../reports/smoke/2026-10-22T14-47-18-218Z-6985a2c8-d4cd-4808-9d9a-97cef4cfef91/result.json), [picker pointer blocker](../reports/smoke/2026-10-22T14-48-37-853Z-8a47a261-5241-4b32-a7ba-0bc7777e4349/result.json), [driver input target](../reports/smoke/2026-10-22T14-49-49-665Z-2842590d-1025-4f6a-a2de-5d1640becaf8/result.json). Each report retains its failed-run resources, screenshot and trace. No error reached four unsuccessful fix rounds; Ask selection succeeded after the selector/argument and pointer-navigation corrections, and editor input succeeded after one target correction.

Limitations: only the pinned macOS host combination and one mocked sidebar exchange are qualified. Session identity depends on installed renderer-log events and is additionally checked against the visible prompt. Arbitrary future builds require renewed qualification. Real authentication/model behavior, unrelated extension startup paths, full editing, and prompt/follow-up behavior are not certified by this checkpoint. Root uv files/environments, regular profiles, saved workspaces and the installed app remain unchanged.

### Selected suites — authorized 2026-10-22

- [x] Implement and verify editing: Quick Open existing file, IDE edit/save, exact independent disk comparison; untitled editor, simple Save As to initially absent `created.txt`, exact destination/content; close/reopen both and verify displayed contents.
- [x] Implement and verify prompt and follow-up in one local sidebar Chat session, with distinct markers/replies, fresh completed mock requests and new completed bubbles; preserve and check prior prompt/response history.
- [x] Enable selected-suite CLI commands and record per-suite results without representing a foundation check as a complete-suite pass.
- [x] Run compilation and relevant non-GUI regressions: compile exit 0, 17 tests passed, zero failed/skipped.
- [x] Qualify editing-only, Chat-only and combined commands sequentially on the authorized host. All three exited 0.
- [x] Developer validation of selected suites: accepted on 2026-10-22; proceeded to documentation handoff under the execution request.

Observable GUI checks are defined above in the plan; editing additionally requires exact on-disk UTF-8 bytes and close/reopen UI contents for both files. Existing GUI authorization and the reserved desktop apply to these sequential suite qualifications. No fixture or helper may write the expected edited result.

### Selected-suite verification — 2026-10-22

Status: **implementation verified; developer accepted**. [Verification summary](../reports/smoke/selected-suites-verification-2026-10-22/checks.json).

| Command suite | Total | Suite checks | Mock completion requests | Result |
|---|---:|---|---:|---|
| `--suite editing` | 2,899 ms | Editing 665 ms | 0 | [passed](../reports/smoke/2026-10-22T15-04-41-222Z-818beac2-5151-4a5b-b5f8-a46515028054/result.json) |
| `--suite chat` | 3,948 ms | Chat 1,730 ms | 3 | [passed](../reports/smoke/2026-10-22T15-05-23-680Z-cc5078fe-1372-4e6b-a9a2-9b0b043a5a8a/result.json) |
| `--suite all` | 4,924 ms | Editing 845 ms; Chat 1,878 ms | 3 | [passed](../reports/smoke/2026-10-22T15-05-40-631Z-8f01daf4-57b6-4749-8dd8-2745e7df7422/result.json) |

Each command was `npm --prefix smoke run smoke -- --build "/Applications/Visual Studio Code.app" --suite <suite>`. All used VS Code 1.135.0 / Copilot Chat 0.63.0, Node 26.3.1 arm64, TypeScript 6.0.2 and Playwright 1.61.1. One sequential process, no automatic retries. Every run confirmed app/mock shutdown, removed disposable resources and released the reservation. Results/evidence remain under ignored reports. Independent inspection of all three JSON results confirmed their per-suite outcomes and cleanup, distinct completed Chat markers/replies, both reopened files, and absence of each temporary resources path.

Editing evidence: `existing.txt` exactly 42 UTF-8 bytes (`Edited in VS Code.\nSmoke check: café ✓\n`); `created.txt` exactly 43 bytes (`Created in VS Code.\nSaved through Save As.\n`). Independent disk comparisons checked exact locations and bytes after IDE saves and again after close/reopen. The new destination was checked absent before creation and immediately before Save As. UI line comparisons normalize Monaco's nonbreaking-space rendering and blank-line placeholders; independent disk comparison remains byte-exact. No expected edited content was written by fixture setup or the helper.

Chat evidence: the first and follow-up replies are distinct; the response count advances from one to two in the same local URI. Every turn requires a newer completed mock request and a new complete exact bubble. The follow-up additionally verifies the original prompt marker and completed reply remain present and unchanged. Three mock completion requests served the two submitted turns; request count is not equated with turn count.

TDD: the selected-suite CLI regression initially exposed the old foundation gate; after enabling suite dispatch, the missing-app case returned its actual blocked prerequisite. The new prior-history regression initially accepted replaced first-turn content, then passed after history checks were added. A new saved-file regression verifies exact UTF-8 bytes/EOLs, initially absent destinations, traversal rejection and symlink rejection. New editing operations initially failed compilation as missing methods, then compiled after implementation. A TypeScript union-inference issue in the shared deadline wrapper was corrected before the final fresh compile and 17-test run. A test run against older compiled output during that compile error was disregarded; only the successful compile followed by the fresh 17-test run establishes the recorded regression result. All three new GUI qualifications passed on their first execution; no unsuccessful GUI fix rounds occurred in this phase.

Current limits: the qualified versions/platform remain pinned; session identity still depends on owned renderer-log events plus visible prompt/history checks. Real Copilot service authentication/model responses and excluded agent/tool workflows remain untested. The repository README/current instructions have been updated only to match verified current state; final handoff remains delivery step 4 after developer validation. Root uv metadata/environments, `.vscode/`, regular profiles, saved workspace data and the installed app were preserved.

### Final handoff — accepted 2026-10-22

- [x] Document verified installation, compilation, unit checks and execution in the [root README](../README.md) and [tester usage](../smoke/README.md).
- [x] Document suite selection, exact checks/evidence, result outcomes, temporary-resource ownership, cleanup/recovery and ignored local artifacts.
- [x] Document the qualified component versions, newer helper type-package exception, installed log/DOM/driver dependencies and limits of mocked Chat coverage.
- [x] Update [repository instructions](../AGENTS.md) to the delivered, accepted implementation without reviving historical scope.
- [x] Verify relative documentation links, whitespace, continued existence of passing evidence and absence of an active reservation; confirm root Python metadata remains unchanged. Documentation-only handoff did not rerun runtime or GUI checks; the recorded 17-test and three-suite results remain the implementation evidence.
- [x] Final developer validation: “I accept the handoff.” Acceptance recorded; plan complete. No further milestone, feature, publication, commit or PR was initiated.
