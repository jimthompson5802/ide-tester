# Issue #36: Prefer device-code sign-in

Source: [issue #36](https://github.com/jimthompson5802/ide-tester/issues/36) and the developer-approved conversation plan. Implementation authorized on 2026-10-23. Status: complete and developer accepted on 2026-10-23 on `fix-issue-36`.

## Findings and approach

The issue screenshots show Safari blocking the HTTP loopback sign-in page with HTTPS-Only enabled, followed by an unsuccessful URL-handler attempt and a reported successful device-code attempt. The second failure's cause remains unconfirmed. Installed VS Code 1.135.0 supports `github-authentication.preferDeviceCodeFlow`; prefer that flow in the dedicated real profile. The developer validated the fix after manual setup and passing real smoke runs on 2026-10-23.

During setup, set the preference to true even when explicitly false (developer-selected policy). Preserve unrelated settings and authentication state; migrate only a closed, owned profile. Normal test reads must not migrate or reject profiles solely because the preference is missing or false. No new flags, types, dependencies, browser changes, or authentication automation.

## Phase 1 — implementation and verification

Tests exercise the approved `realProfile()` filesystem boundary; they verify profile configuration and preservation, not browser sign-in.

- [x] P1-T01: Extend `smoke/tests/real-profile.test.ts` with new-profile and missing/false migration regressions. Observe intended assertion failures before their corresponding fixes.
- [x] P1-T02: Update `realProfile()` in `smoke/src/real-profile.ts`: default new profiles to device-code preference true and combine existing-profile migration with anonymous-access refresh during setup.
- [x] P1-T03: Preserve safeguards: require closed profile before settings migration; preserve unrelated settings/state; retain ownership and override rejection; avoid rewriting correct settings; normal reads remain non-mutating. Verify through the profile tests.
- [x] P1-T04: Update `smoke/src/setup-real-chat.ts` console guidance and `smoke/README.md` with manual Copy & Continue to Browser, device-code entry, authorization and window closure. Distinguish closure from verified authentication.
- [x] P1-T05: Compile, run targeted profile tests, then the full non-GUI suite. Cover missing/false migration, locked profile with unchanged settings, state preservation, idempotence, non-mutating normal reads, and existing ownership/override regressions.
- [x] P1-T06: After separate GUI authorization and desktop reservation, verify the initial sign-in uses device code without cancellation/fallback, succeeds, persists across setup restart, and supports a real Chat run. If already signed in, obtain explicit approval before manual sign-out. Preserve profile; record only sanitized outcomes and no authentication screenshots, traces, codes, or tokens.
- [x] P1-T07: Update `docs/implementation-plans/real-chat-backend.md` with actual evidence and limitations; check relative links and `git diff --check`.
- [x] P1-VALIDATE: Explicit developer acceptance of this fix — “i validate that fix for issue 36 works”, 2026-10-23.

Commands: `npm --prefix smoke run compile`; `node --test --test-concurrency=1 smoke/dist/tests/real-profile.test.js`; `npm --prefix smoke run test:unit`.

Acceptance mapping: first-attempt device-code selection → T01–T04, T06; existing-profile migration and preservation → T01–T03, T05; clear manual workflow → T04, T06; persistent authenticated access → T06. Automated checks alone cannot establish GUI acceptance.

Stop at the phase checkpoint and present checks, evidence, deviations, and limitations for explicit developer validation. This fix does not accept the outstanding real-backend slice gate. Follow the [repository four-unsuccessful-fix-round rule](../../AGENTS.md); stop if evidence invalidates the approach or expands scope. Implementation authorization does not authorize GUI execution or signing out.

## Execution evidence

Verification on 2026-10-23:

- T01: Red/green observed at the approved profile seam: new-profile assertion failed with `undefined` instead of true, then passed after the default was added. Missing-preference migration failed its expected-settings assertion, then passed after setup migration was extended; the passing test also exercises explicit false.
- T02–T03: New defaults and setup-only migration pass the profile tests. Locked migration leaves settings unchanged for all three singleton markers and missing/false preferences. Unrelated settings and representative state survive migration. Correct settings retain bytes and modification time across repeated setup. Normal reads tolerate missing/false preferences without changing bytes or modification time.
- T04: Console guidance and README reviewed against the manual flow. Root and smoke README test counts refreshed to 48.
- T05: `npm --prefix smoke run compile` passed; `node --test --test-concurrency=1 smoke/dist/tests/real-profile.test.js` passed all 10 tests. `npm --prefix smoke run test:unit` passed all 48 tests with authorized loopback binding. Initial sandbox run passed 43 and failed five because loopback binding was denied (`EPERM`), including a dependent runner outcome assertion; these were environment restrictions, not functional failures.
- T06: The developer authorized setup and real Chat runs on 2026-10-23. Setup closed successfully and preserved its profile. Chat-only passed both turns and cleanup in 7.704 seconds; combined editing and real Chat passed in 16.123 seconds. These verify authenticated profile reuse across launches. The developer subsequently confirmed “i validate that fix for issue 36 works”; manual sign-in acceptance is developer-confirmed, with authenticated persistence independently exercised by the passing real runs. No sign-out or authentication screenshots/traces were performed. See the linked backend execution record for result paths.
- T07: Backend execution record updated. Verified all seven local links on added/changed Markdown lines and in this plan. `git diff --check` passed.
- P1-VALIDATE: Developer accepted issue #36 on 2026-10-23. Existing real-backend slice 2 gate unchanged.
