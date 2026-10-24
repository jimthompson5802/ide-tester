# Optional real Copilot backend

Source: developer-supplied plan, 2026-10-22. Implement in two reviewable slices with explicit developer validation between them. GUI validation requires separate authorization.

## Slice 1 — configuration and profile setup

Status: developer validated on 2026-10-22; slice 2 authorized. GUI qualification remains separately gated.

- [x] Parse `--chat-backend mock|real`, default mock; reject real editing-only and foundation qualification.
- [x] Separate common settings from mock-only endpoint overrides and credentials. Provide real launch configuration using persistent secret storage, dedicated state, and no injected credentials/proxies or mock launch flags.
- [x] Own and preserve ignored `profiles/smoke-real-chat` with dedicated user data, extensions and state directories. Reject pre-existing unowned and symlinked directories. Keep disposable workspace cleanup separate.
- [x] Add `setup:real-chat -- --build …` for manual sign-in, sharing the test reservation, waiting for the setup window to close, and confirming owned process shutdown before release. Capture no authentication diagnostics.
- [x] Non-GUI verification and usage/status documentation.
- [x] Developer validation of slice 1 — “slice 1 validated; proceed with slice 2”, 2026-10-22.

Verification on 2026-10-22:

- Red: compilation failed for missing backend/profile interfaces used by new tests.
- Green: `npm --prefix smoke run compile` passed.
- `npm --prefix smoke run test:unit` passed all 31 tests with authorized loopback access. The sandbox initially denied loopback binding (`EPERM`); the same suite passed outside the sandbox.
- Tests cover defaults, backend combinations, owned profile creation/reuse, unowned/symlink rejection, persistent-profile preservation through successful/failed run cleanup, sanitized launch environment, persistent storage flags, setup argument rejection and prelaunch integration gates.
- Existing mock profile, HTTP, runner, reporting, transcript and resource regression tests pass.
- Relative documentation links checked locally; official Copilot setup link retained from supplied plan.
- No GUI launch, sign-in, authenticated profile creation or real service check performed. Setup lifecycle after launch remains GUI-unverified.

At the slice 1 checkpoint, real smoke runs explicitly returned blocked before launch. Slice 2 replaces that temporary guard with the real Chat path.

## Slice 2 — Chat integration and reporting

Status: developer validated on 2026-10-23 local / 2026-10-24 UTC. All listed GUI qualification checks are verified, including signed-out blocking and authenticated recovery.

Tests use the approved plan’s public boundaries: turn/transcript validation (exactness and freshness), backend/profile configuration and cleanup, runner outcomes, and JSON/text reporting. UI and sign-in behavior remain subject to the separate GUI checks below.

- [x] Share session creation, Ask selection, submission and transcript checks across backends, retaining explicit mock request verification only in mock mode.
- [x] Real runs start no mock; reuse the dedicated profile after setup closes. Authentication, entitlement and quota prerequisites produce blocked with setup instructions.
- [x] Generate `SMOKE_<UUID>` and submit “Reply with exactly this token and nothing else: `<token>`. Do not use tools.” Require one fresh completed assistant reply exactly equal to the token after outer trimming.
- [x] Follow up with a distinct prompt marker and “Repeat the token from your previous answer exactly, and nothing else. Do not use tools.” Require one additional completed exact reply in the same session with the first exchange preserved.
- [x] Check completion and explicit error UI. Reject stale, partial, empty, cancelled and error replies. Allow 120 seconds per turn, 300 seconds total Chat, no retries.
- [x] Report backend, prompts, expected/observed replies, session identity and timings in JSON and backend in text. Mock request evidence is inapplicable in real mode.
- [x] Classify response mismatches, service errors and response timeouts as failed; harness/cleanup errors as harness_error. Capture only authenticated test-owned Chat diagnostics; exclude credentials and authentication screens.
- [x] TDD for reply matching, freshness, classification and reporting; compilation and full non-GUI suite; update docs and links.
- [x] Developer validation of slice 2 — “I validate the two items”, explicitly accepting real-backend slice 2 and the PR #39 P2 cleanup after the GUI runs recorded below.

## Separately authorized GUI qualification

- [x] Default mocked Chat on VS Code 1.135.0 / Copilot Chat 0.63.0, macOS arm64 — editing and both Chat turns passed through `basic --chat-backend mock` after the P2 cleanup; evidence below.
- [x] Real two-turn Chat — authorized reproduction and fixes, 2026-10-22; evidence below.
- [x] Combined editing and real Chat — developer-authorized run passed on 2026-10-23; evidence below.
- [x] Signed-out real Chat blocks with setup instructions — authorized manual sign-out verification and authenticated recovery passed; evidence below.

## Slice 2 verification — 2026-10-22

- `npm --prefix smoke run compile` passed.
- `npm --prefix smoke run test:unit` passed all 41 non-GUI tests. Loopback HTTP regression tests ran with sandbox escalation; a targeted runner run inside the sandbox hit the known bind restriction before escalation.
- [Saved command output](../../reports/smoke/real-chat-slice2-non-gui-2026-10-22/final-verification.txt) is ignored local evidence.
- TDD red/green cycles covered real exact-reply/freshness semantics, prompt construction, prerequisite versus service-error classification, cancelled/error/Markdown export rejection, persistent launch-log isolation, backend reporting (including early invalid arguments), anonymous-access settings, and older owned-profile refresh. Tests first failed for missing interfaces or the intended missing behavior, then passed after implementation.
- Existing mock request assertions and non-GUI resource/reporting regressions pass. Runner integration tests use a fake installed app and an injected Electron launcher that throws before executing any application. They verify real launch arguments/environment, no mock evidence, missing-setup blocking, malformed-settings harness errors and profile preservation under uncertain shutdown. They do not verify real UI selectors or authenticated service behavior.
- The neighboring VS Code source was used to investigate UI signals. It reports version 1.144.0, so the installed 1.135.0 `workbench.desktop.main.js` was also inspected directly: its Export Chat command serializes `modelState`, maps pending state to cancelled on export, and exposes the same response-loading/quota UI classes. Raw export checks require successful state `1` and exact raw Markdown, supplementing visible completion checks. This source inspection is not GUI qualification.
- Partial test-owned Chat evidence survives assertion failures and deadlines. Raw exports are deleted after reading; only selected prompt/reply/completion/session/timing evidence is retained. Persistent profiles and state remain outside disposable cleanup.
- Real launch configuration permits only normal host environment variables and dedicated state paths. Real profiles disable anonymous Chat, reject mock endpoint/auth overrides, and check existing singleton locks. Setup refreshes older owned settings while preserving sign-in state.
- Diagnostic choice: real runs, including combined runs, capture no screenshots or Playwright traces. Authentication can expire after initial readiness; suppressing captures throughout keeps authentication screens/credentials out of diagnostics. Mock diagnostic behavior is retained.
- Documentation and repository status updated. Relative links and `git diff --check` passed.
- No GUI launch, sign-in, credential access, real service request, account modification, dependency change or VS Code rebuild was performed. Setup and both backends' current GUI paths remain subject to the separately authorized checks below.

## GUI checks to perform after separate authorization

Reserve an unlocked, exclusive macOS arm64 desktop with Node 26.3.1, VS Code 1.135.0 and bundled Copilot Chat 0.63.0. Run sequentially, inspect JSON/text results, and confirm each owned process exits and the reservation releases. Preserve the real profile on every outcome.

1. Default mock regression: run `smoke -- --build <app> --suite chat`; observe a fresh local Ask session, two distinct exact synthetic replies, preserved first exchange, `chatBackend: mock`, applicable completed mock requests and passing cleanup.
2. Manual real setup: run `setup:real-chat -- --build <app>`, sign in manually using the dedicated window, then close it. Confirm setup exits and releases the shared reservation. While setup is open, test execution must refuse the reservation. No authentication screenshots/traces should exist.
3. Real Chat: run `smoke -- --build <app> --suite chat --chat-backend real`; observe two exact identical tokens in the same new local Ask session and preserved first exchange. Confirm raw completion checks pass, mock request fields are inapplicable/null, each turn stays within 120 seconds and Chat within 300 seconds, cleanup removes only disposable resources, and the profile remains.
4. Combined real: run the same command with `--suite all`; confirm independent on-disk edit evidence and the real Chat assertions both pass in the owned instance.
5. Signed-out blocking: use setup to sign out manually in the dedicated profile, close it, then run real Chat. Confirm `blocked`, setup instructions, no pass or fabricated reply, preserved profile, and no authentication screenshots/traces. Restore sign-in manually through setup if desired.

Model-added prose or Markdown is a functional failure even if the service is reachable. Service errors/timeouts fail; auth/entitlement/quota block; missing export/schema/UI contracts and cleanup errors are harness errors. Record actual versions, results, durations and evidence paths without credentials or unrelated desktop content. The original implementation performed no GUI checks; the subsequent authorized real Chat check is recorded below.

## Real Chat failure diagnosis and verification — 2026-10-22

The developer reported a 15-second `Chat UI/session contract failed` error and authorized GUI reproduction. The same failure reproduced before prompt submission. Info-level logs omitted the debug-level session-binding events; the real launch now requests debug logging. The authenticated mode menu also omitted legacy Ask, so real mode selects Ask through its visible built-in command and verifies the displayed label. Sanitized fixed stage labels now identify UI/session failures.

Further checks exposed export/transcript assumptions: empty MCP startup status and model thinking parts are separate from final-answer Markdown, and Markdown backticks in the first prompt disappear from rendered text. The verifier now excludes those known non-answer parts (and excludes thinking from report evidence), while unknown parts, nonexact Markdown, cancellation, errors and incomplete states still fail. The first prompt uses plain text so follow-up preservation compares the same text. Toast checks now consider warning/error severity rather than treating informational notifications as errors.

Red/green tests cover launch logging, plain-text prompt construction, empty startup status, and thinking exclusion. Compilation and all 43 non-GUI tests passed; the full suite required loopback access outside the sandbox. Temporary schema-only debug probes were removed. No screenshots or traces were captured.

The original real Chat command passed both turns, raw completion checks and cleanup in 6.508 seconds on VS Code 1.135.0 / Copilot Chat 0.63.0, macOS arm64, Node 26.3.1. [Passing result](../../reports/smoke/2026-10-22T17-10-12-175Z-563268cf-ea30-4927-9d7e-c4cc44a9881f/result.json). Disposable resources were removed, the reservation released, and the dedicated profile preserved. The first sandbox launch failed before reproduction and left a reservation; after confirming its PID and owned processes were absent, that reservation was archived under its run report before recovery.

This evidence verifies real two-turn Chat only. Setup, combined real mode, signed-out blocking and a new mock GUI regression were not verified in this diagnosis. Slice 2 developer validation remains pending.

## Issue #36 device-code preference — 2026-10-23

The [issue #36 fix plan and progress record](issue-36-device-code-sign-in.md) implements device-code authentication as the preferred initial flow in the dedicated real profile. New profiles set `github-authentication.preferDeviceCodeFlow` to true. Setup refreshes missing or false preferences only in closed, owned profiles, together with the existing anonymous-access setting, preserving unrelated settings and state. Normal real runs do not migrate settings or require the preference. Console and README guidance describe manual device-code entry.

TDD confirmed the new-profile assertion failed with an undefined preference before the default was added; the migration assertion then failed before setup refresh was extended. Compilation and all 10 targeted profile tests pass. All 48 non-GUI tests pass with authorized loopback binding; the sandbox initially blocked four mock HTTP tests and one dependent runner check with `EPERM`. Regression coverage includes missing/false migration, singleton-marker refusal without settings changes, state preservation, idempotent setup, and non-mutating normal reads. At the initial non-GUI checkpoint, no GUI launch, sign-out, credential access, or retained local profile modification had been performed. Manual sign-in and real Chat verification were pending at that checkpoint; subsequent authorization, results, and developer acceptance are recorded below. This work does not accept the outstanding slice 2 gate.

## Authorized setup and real smoke verification — 2026-10-23

After the issue #36 preference fix, the developer requested setup, then real Chat-only and combined smoke runs. The earlier unlocked, exclusively reserved desktop confirmation remained in effect. Setup exited successfully with the persistent profile preserved. The developer subsequently validated the issue #36 fix on 2026-10-23; manual sign-in acceptance is developer-confirmed rather than inferred from setup closure.

- Chat-only: `npm --prefix smoke run smoke -- --build "/Applications/Visual Studio Code.app" --suite chat --chat-backend real` passed both turns and cleanup. Chat: 6.249 seconds; total: 7.704 seconds. [Local result](../../reports/smoke/2026-10-23T15-27-03-683Z-f5c2f29b-7f0a-4dd0-b783-f90cc87b2723/result.json).
- Combined: the same command with `--suite all --chat-backend real` passed editing (0.395 seconds), real Chat (14.250 seconds), and cleanup. Total: 16.123 seconds. [Local result](../../reports/smoke/2026-10-23T15-27-28-468Z-dc8e291b-edda-4d52-b71f-c2de12267dbb/result.json).

Both runs used the pinned compatibility gate (macOS arm64, Node 26.3.1, VS Code 1.135.0 / Copilot Chat 0.63.0), removed disposable resources, released the reservation, and preserved the authenticated profile. Real runs suppress screenshots and traces. These results verify authenticated profile reuse across launches and combined real mode. The developer explicitly accepted the issue #36 fix on 2026-10-23: “i validate that fix for issue 36 works”. Signed-out blocking and the separate slice 2 developer-validation gate remain pending.

## Real Chat-only rerun — 2026-10-23 local / 2026-10-24 UTC

The developer requested the real backend after a passing mocked Chat-only run, with the desktop still reserved and unlocked. `npm --prefix smoke run smoke -- --build "/Applications/Visual Studio Code.app" --suite chat --chat-backend real` returned **harness_error**, `Chat UI/session contract failed (select-ask)`, before prompt submission. Chat took 5.142 seconds; total 6.439 seconds. The run used VS Code 1.135.0 / Copilot Chat 0.63.0, Node 26.3.1 on macOS arm64, with the authorized dedicated real profile and persistent secret storage. No completed turn was recorded, so this does not establish real-service response behavior or current authentication readiness.

Owned shutdown succeeded with no cleanup errors; the reservation was released, the dedicated profile preserved, and failed disposable resources `/private/tmp/ide-smoke-a0GWhf` retained. No screenshots or traces were captured. No fixes or retries were attempted. [Local result](../../reports/smoke/2026-10-24T02-28-59-939Z-a54b61ec-30f3-41b4-baa9-508082a975df/result.json). The earlier passing runs above remain historical evidence; slice 2 developer validation and signed-out blocking remain pending.

The developer subsequently requested restoring the previously passing Chat behavior. `Workbench.qualifyChat` now exactly matches `b9a4cc4`, including waiting for fresh session identity before Ask selection; duplicate-title first-match handling was removed, while Git-specific command-picker support remains. Compilation and all 75 non-GUI checks pass. No GUI check of this restored version has been performed; the failed real run above predates the restoration. See the [restoration record](issue-38-git-smoke-test.md#developer-directed-restoration-of-previously-passing-chat-behavior).

### Restored real all-suite GUI verification — 2026-10-23 local / 2026-10-24 UTC

The developer requested GUI `all --chat-backend real` on the still-reserved desktop. `npm --prefix smoke run smoke -- --build "/Applications/Visual Studio Code.app" --suite all --chat-backend real` **passed**: editing 0.357 seconds, real Chat 4.433 seconds, total 6.332 seconds. Only editing and Chat were selected. Independent saved-file/reopened-editor checks and both fresh exact-token Chat turns, preserved first exchange and raw export completion checks passed on VS Code 1.135.0 / Copilot Chat 0.63.0, Node 26.3.1 macOS arm64. The run reused the authorized dedicated real profile's saved authentication, started no mock, and captured no screenshots or traces. Owned shutdown succeeded, disposable resources were removed, the reservation was released and the dedicated profile preserved. No fixes or retries were needed. [Result](../../reports/smoke/2026-10-24T02-36-39-285Z-b19b9834-4aec-4b7b-b710-c423ec428a26/result.json). Both restored mocked and real editing/Chat combined flows now have passing GUI evidence. Final issue acceptance, real-backend slice 2 developer validation and signed-out blocking remain pending.

## Renamed basic real-backend GUI run — 2026-10-23 local / 2026-10-24 UTC

After the suite rename, the developer requested sequential mocked `basic`, real `basic` and standalone Git. Mocked `basic` and Git passed. Real `basic` **failed**: editing passed (0.336 seconds), Chat displayed an error/warning (4.594 seconds), total 6.483 seconds. The report does not establish the underlying error/warning cause. This differs from the earlier Ask-selection harness failure. The run used the same pinned versions and dedicated real profile; no screenshots/traces were captured. Owned shutdown succeeded with no cleanup errors, the reservation was released, the profile preserved and failed resources retained at `/private/tmp/ide-smoke-EutFpa`. No fixes or retries were attempted. [Result](../../reports/smoke/2026-10-24T02-39-39-813Z-3788d88d-77b4-4646-9bd7-5020997abe6b/result.json). Earlier real combined passes remain historical evidence; the latest renamed real run did not pass.

### Renamed real basic rerun — 2026-10-23 local / 2026-10-24 UTC

At the developer's explicit request, reran `npm --prefix smoke run smoke -- --build "/Applications/Visual Studio Code.app" --suite basic --chat-backend real` on the still-reserved desktop. **Passed**: editing 0.478 seconds, both real Chat turns 4.509 seconds, total 6.560 seconds. Independent file/reopen verification, fresh exact-token replies, preserved first exchange and raw export completion checks passed on VS Code 1.135.0 / Copilot Chat 0.63.0, Node 26.3.1 macOS arm64. The dedicated profile was preserved; owned shutdown succeeded, disposable resources were removed and the reservation released. No screenshots/traces were captured. No source changes or fixes preceded this rerun. [Result](../../reports/smoke/2026-10-24T02-41-10-830Z-d02790fd-3271-4c33-aca7-b3743a8b4432/result.json). The previous error/warning remains an observed failure with unconfirmed underlying cause; this rerun does not establish its cause or a fix. Final developer acceptance and separate real-backend validation gates remain pending.

Developer-requested repeat real `basic` GUI run: **passed**, editing 0.362 seconds, both real Chat turns 4.894 seconds, total 6.737 seconds. Run `2026-10-24T02-43-15-262Z-ee3e3f54-5d0a-469d-a8a3-3c1bec33f9ec` used the same pinned versions and dedicated profile on the still-reserved desktop, with no source changes. Owned shutdown and disposable cleanup succeeded, the reservation was released and the profile preserved. No screenshots/traces were captured. This is the second consecutive developer-requested passing renamed real `basic` run; it does not establish the cause of the earlier warning. [Result](../../reports/smoke/2026-10-24T02-43-15-262Z-ee3e3f54-5d0a-469d-a8a3-3c1bec33f9ec/result.json).

## Developer acceptance after PR #39 P2 regression runs

After being told the P2 cleanup acceptance and real-backend slice 2 acceptance were pending, the developer stated: “I validate the two items”. Both acceptance gates are now satisfied. The separately listed signed-out blocking check remains unverified; authenticated passes and developer acceptance do not establish that behavior. No sign-out or additional GUI work was performed or authorized by this acceptance.

The preceding sequential regression runs used VS Code 1.135.0 / Copilot Chat 0.63.0, Node 26.3.1 macOS arm64. Mocked `basic` passed editing and both Chat turns in 4.821 seconds total ([local result](../../reports/smoke/2026-10-24T03-08-27-610Z-ab85089b-8ecd-4cf6-bee9-da1f046a2f88/result.json)); real `basic` passed editing and both exact same-session replies plus raw-export completion checks in 6.018 seconds total ([local result](../../reports/smoke/2026-10-24T03-09-14-436Z-8833e580-adb6-47cd-9159-9577c6a3a1fa/result.json)). Both confirmed owned shutdown, disposable cleanup and reservation release; the real profile was preserved. Historical pending-gate statements above describe their earlier checkpoints.

## Signed-out blocking and authenticated recovery — 2026-10-23 local / 2026-10-24 UTC

The developer authorized the proposed manual sign-out, signed-out test, manual sign-in and authenticated recovery sequence (“let's do this”) on the reserved desktop. Compilation passed. The setup command opened only the dedicated `profiles/smoke-real-chat` profile; the developer confirmed manual sign-out and window closure. Setup confirmed owned shutdown, profile preservation and reservation release. No credentials were inspected or authentication actions automated.

The subsequent `--suite chat --chat-backend real` run returned the expected **BLOCKED** outcome and exit code 1 with `setup:real-chat` instructions: Chat 0.019 seconds, total 1.777 seconds. No session or turns were recorded; mock evidence was inapplicable and diagnostics were empty (no screenshots/traces). Owned shutdown succeeded with no cleanup errors and the reservation was released. The profile was preserved; disposable resources `/private/tmp/ide-smoke-zkBUEk` were retained under the normal blocked-run evidence policy. The closed profile and absent reservation were independently checked. [Signed-out result](../../reports/smoke/2026-10-24T03-14-28-019Z-5e96e3fe-4bf4-4176-b5b5-8f5ada914279/result.json). The blocked outcome is the successful observation for this qualification; it is not a functional failure.

Setup was reopened and the developer confirmed manual sign-in and window closure. The recovery `--suite chat --chat-backend real` run **passed both turns**: Chat 9.198 seconds, total 10.692 seconds. Fresh exact same-session responses and raw-export completion checks passed. Owned shutdown, disposable cleanup and reservation release succeeded with no errors; the dedicated authenticated profile was preserved and closed. No screenshots/traces were captured. [Recovery result](../../reports/smoke/2026-10-24T03-16-40-663Z-3d1736d3-d13e-411c-a115-cf25c0d36685/result.json). Both runs used VS Code 1.135.0 / Copilot Chat 0.63.0, Node 26.3.1 macOS arm64, with no retries or implementation changes.

The signed-out GUI qualification item is complete. Earlier statements that it was unverified describe historical checkpoints. No outstanding real-backend slice validation gate remains; slice 2 was already developer accepted.
