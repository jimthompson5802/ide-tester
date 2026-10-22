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

Status: implementation verified; developer validation pending.

Tests use the approved plan’s public boundaries: turn/transcript validation (exactness and freshness), backend/profile configuration and cleanup, runner outcomes, and JSON/text reporting. UI and sign-in behavior remain subject to the separate GUI checks below.

- [x] Share session creation, Ask selection, submission and transcript checks across backends, retaining explicit mock request verification only in mock mode.
- [x] Real runs start no mock; reuse the dedicated profile after setup closes. Authentication, entitlement and quota prerequisites produce blocked with setup instructions.
- [x] Generate `SMOKE_<UUID>` and submit “Reply with exactly this token and nothing else: `<token>`. Do not use tools.” Require one fresh completed assistant reply exactly equal to the token after outer trimming.
- [x] Follow up with a distinct prompt marker and “Repeat the token from your previous answer exactly, and nothing else. Do not use tools.” Require one additional completed exact reply in the same session with the first exchange preserved.
- [x] Check completion and explicit error UI. Reject stale, partial, empty, cancelled and error replies. Allow 120 seconds per turn, 300 seconds total Chat, no retries.
- [x] Report backend, prompts, expected/observed replies, session identity and timings in JSON and backend in text. Mock request evidence is inapplicable in real mode.
- [x] Classify response mismatches, service errors and response timeouts as failed; harness/cleanup errors as harness_error. Capture only authenticated test-owned Chat diagnostics; exclude credentials and authentication screens.
- [x] TDD for reply matching, freshness, classification and reporting; compilation and full non-GUI suite; update docs and links.
- [ ] Developer validation of slice 2.

## Separately authorized GUI qualification

- [ ] Default mocked Chat on VS Code 1.135.0 / Copilot Chat 0.63.0, macOS arm64.
- [ ] Real two-turn Chat.
- [ ] Combined editing and real Chat.
- [ ] Signed-out real Chat blocks with setup instructions.

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

Model-added prose or Markdown is a functional failure even if the service is reachable. Service errors/timeouts fail; auth/entitlement/quota block; missing export/schema/UI contracts and cleanup errors are harness errors. Record actual versions, results, durations and evidence paths without credentials or unrelated desktop content. None of these GUI checks have been executed during implementation.
