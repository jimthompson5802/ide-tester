# M1-02 Phase 1 — partial qualification, 2026-10-21

Execution was authorized by the developer's instruction to implement the
[M1-02 plan](../implementation-plans/M1-02.md). Phase 2 has not started. The initial
unlocked-state qualification gap caused a stop for review. The developer has
since accepted a limited prerequisite snapshot with screen-lock state unassessed;
see the [accepted limitation and risks](../implementation-plans/M1-02.md#accepted-limitation-and-risks--2026-10-21).
Remaining Phase 1 qualification and validation are pending. No
production code, dependencies, configuration, profile, or OS permissions changed.
The pending M1-01 PATH-fix developer validation remains pending.

## Work and actual observations

| Task | Result |
| --- | --- |
| P1-01 | Baseline recorded: macOS 15.7.9, Python 3.12.15 arm64, checkout `.venv`; four directly inspected existing PyObjC distributions are 12.2.2 with `cp312-cp312-macosx_10_13_universal2` wheel tags. No installation. |
| P1-02 | Partial: existing official app metadata matched, app and CLI executable bits observed, `/usr/local/bin/code` resolves to that app's CLI, and bounded non-GUI `--version` returned recognized version/commit/architecture output. Local metadata version is 1.135.0. Nine inert tests include PATH rejection/selection, explicit nonexecutable, indeterminate access, subprocess timeout, and failed-output privacy. Configurable app/CLI identity, unsupported forms, all failure classifications, and descendant timeout cleanup remain unqualified. |
| P1-03 | **Partial; screen-lock detection now deferred by developer decision:** host session dictionary present, console true, login done true, same UID true, Accessibility trust true, event-posting access true. These signals support the accepted limited snapshot, not unlocked state. Required controlled denied/unavailable observations and final qualification remain pending. No denied permission experiment, lock-screen action, UI interaction, or unrelated-window inspection occurred. |
| P1-04 | Partial: existing M1-00 root has no symlink components; separate `user-data` and `extensions` directories exist; proposed marker absent. Strict-JSON inspection did not establish a recognized explicit screen-reader value; effective value remains unknown. Exactly one bundled `github.copilot-chat` 0.63.0 manifest was found while the dedicated registry was empty. Full safe-path/marker validation, JSONC/effective-setting precedence, user/bundled selection, disabled state, and synthetic inventory cases remain unqualified. Draft setup guide saved. |
| P1-05 | Findings and accepted screen-lock limitation recorded here. Dependency and production-schema decisions remain pending; Phase 1 is not fully completed or developer validated. |

The bundled extension lives in `extensions/copilot`, rather than a directory
named after its manifest identifier. The initial probe's directory assumption
failed once; selecting by manifest publisher/name corrected that observation.
The initial artifact is retained. No assertion about current authentication,
IDE interactability, or T01–T05 follows from these findings.

## Capability matrix and primary references

| Capability | Candidate check / interpretation | Limit |
| --- | --- | --- |
| Caller GUI session | [`CGSessionCopyCurrentDictionary`](https://developer.apple.com/documentation/coregraphics/cgsessioncopycurrentdictionary%28%29) returns caller-session information; null indicates no Quartz GUI session/window server disabled. | Does not establish unlocked state. |
| Foreground console, completed login, intended user | Documented keys in [Window Server Session Properties](https://developer.apple.com/documentation/coregraphics/window-server-session-properties); compare UID without emitting it. Apple's [Fast User Switching guide](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPMultipleUsers/Concepts/FastUserSwitching.html) uses console/login observations. | Login completion is not an unlocked-state guarantee. No dictionary dump is retained. |
| Accessibility client trust | [`AXIsProcessTrusted`](https://developer.apple.com/documentation/applicationservices/1460720-axisprocesstrusted) reports trust for the calling process without requesting a grant. | Permission snapshot only; does not establish target interaction or consent attribution. |
| Keyboard event posting | [`CGPreflightPostEventAccess`](https://developer.apple.com/documentation/coregraphics/cgpreflightposteventaccess%28%29) was available and returned true. The subsequent investigation verified its event-synthesis permission-check semantics in Apple's existing `CGEvent.h`. | Permission snapshot only; no events were created/posted. See the [follow-up](M1-02-passive-lock-investigation.md#additional-documented-permission-finding). |
| Unlocked intended session | **Unassessed; automated detection deferred by developer decision.** No positive unlocked claim made. | The documented session keys examined do not provide this guarantee. The accepted omission will not itself fail preflight; unlocked/exclusive desktop use remains an operating requirement. |
| Apple Events, Screen Recording, input monitoring | Unused by the selected Accessibility/event-posting path. | Not requested, tested, or required. |
| Exclusive desktop use | Human operating condition; no interaction occurred in this investigation. | Not established by the advisory lock or these observations; current developer confirmation remains outstanding. |

This is a qualification gap, not proof that no suitable platform API exists.
No Keychain-based technique was investigated. The subsequent developer decision
explicitly narrows the prerequisite snapshot; it does not qualify unlocked-state
detection. Native calls ran in separately bounded workers; their completion
does not establish a general native-call latency guarantee.

The [official CLI documentation](https://code.visualstudio.com/docs/configure/command-line)
supports `--version` and separate user-data/extensions arguments. The locally
inspected bundled shell script invokes its own app executable in Electron Node
mode with `out/cli.js`; inherited remote/Node hooks were removed for this check.
The app executable itself was not launched as an editor or invoked with GUI
arguments. CLI metadata association is not cryptographic authenticity verification.

[VS Code settings documentation](https://code.visualstudio.com/docs/configure/settings)
describes JSONC settings and precedence, including named profiles and policy.
Strict JSON user-file inspection cannot resolve all of those. The
[accessibility documentation](https://code.visualstudio.com/docs/configure/accessibility/accessibility)
defines the screen-reader values. Neither a missing/unrecognized local value nor
historical restored settings establishes a current effective value. Extension
override/disabled-state qualification still needs primary source inspection.

## Checks and local evidence

The sandbox attempt to run the qualification script failed acquiring the real
per-user lock (`PermissionError`); no worker ran. The identical purpose was then
executed with approved host escalation. Each host run held the real foundation
lock through observation and evidence writing and released it in `finally`.
The second host run reacquired it successfully, demonstrating release after the
first. The probe uses existing spike packages; no new wheel installation or clean
environment qualification was performed.

```bash
.venv/bin/python scripts/spikes/m1_02/qualify.py --context host
.venv/bin/python -m pytest tests/unit/test_m1_02_qualification.py tests/unit/test_config.py -q
.venv/bin/python -m pytest
```

The corrected host script completed in 0.392 seconds and intentionally exited 4
with `incomplete_no_readiness_claim`. This is a spike result, not an installed
console preflight acceptance run. Targeted tests: **82 passed**. Full regression:
**147 passed in 1.26 seconds**, including existing process/lock tests. No GUI test ran.
Documentation checks validated 78 relative links/anchors across six affected
documents. Tracked diff and new-file whitespace checks passed.

Ignored evidence:

- `reports/m1-02/host-initial-qualification.json` — initial metadata failure.
- `reports/m1-02/host-qualification.json` — corrected allowlisted observations.

No raw subprocess output, settings contents, account identifiers, session
dictionaries, exception text, screenshots, or conversations are saved by the
probe. Narrow observations are reproducible using the
[spike instructions](../../scripts/spikes/m1_02/README.md). The draft
[setup guide](../vscode-test-profile-setup.md) explicitly separates proposed
manual setup from implemented behavior.

## Accepted decision and remaining work

The developer subsequently authorized continued investigation of an automated
passive check. The [completed follow-up investigation](M1-02-passive-lock-investigation.md)
examined documented session APIs, AppKit protected-data state, notifications,
Endpoint Security, and undocumented-property alternatives. None was qualified
as a documented unprivileged unlocked-state snapshot within the current design.
The investigation left unlocked-state detection unqualified; production
integration has not started.

The developer subsequently accepted the narrower snapshot as good enough for now
and authorized documentation revisions. Automated screen-lock detection is
deferred; reports must explicitly record it as unassessed. That observation may
coexist with eventual successful preflight and is not itself a block/error.
Operators remain responsible for an unlocked, exclusively reserved desktop;
no new automated detector, heuristic, or CLI confirmation mechanism was approved.
The [plan](../implementation-plans/M1-02.md#accepted-limitation-and-risks--2026-10-21)
records the accepted risks: preflight may pass on a locked desktop, unattended
GUI reliability is reduced, environmental causes of later timeouts may be unknown,
and focus/interference and overstatement risks require later targeting checks
and clear reporting. This is a scope decision, not fresh host evidence or story
acceptance.

Finish P1-02/P1-04 qualification (especially
effective settings and extension selection), review the marker/setup convention,
finish P1-03's remaining controlled cases, and obtain the Phase 1 checkpoint
before Phase 2. A minimal prospective dependency
set is PyObjC core plus Quartz and ApplicationServices and their required
transitives, subject to actual import/dependency qualification; do not promote all
spike packages or change the lockfile now. Production config/schema stays unchanged.
No successful host preflight, controlled blocked production run, M1-02 acceptance,
or Slice 1 validation is claimed.
