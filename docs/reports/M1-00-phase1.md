# M1-00 Phase 1 execution — 2026-10-20

Status: partial discovery; isolated lifecycle and unsent keyboard input demonstrated.
Authentication and response-state discovery remain pending. This is neither Phase 1
acceptance nor a feasibility recommendation. The developer authorized
[plan execution](../implementation-plans/M1-00.md); Phase 2 still requires explicit
Phase 1 validation. The initial non-GUI results below are followed by the attended
continuation and input diagnosis. No sign-in or Chat prompt submission occurred.

## Observations

Execution started from clean commit `421074f27f548f3013c63b9fd887475044feb97d`
on `feature/m1-00-validate-automation-feasibility`. Host checks matched M0:
macOS 15.7.9 (24G830), shell and Python arm64, Python 3.12.15, Homebrew uv
0.13.1, checkout-local `.venv`, disabled user site, and the selected Homebrew
Python base. Nonempty `PYTHONPATH`/`PYTHONHOME` were absent.

VS Code CLI `/usr/local/bin/code` reported 1.135.0, commit
`08d4889f9ec4a1685d257b9b95de036c8e1ce1e5`, arm64. Its app `product.json`
reported Visual Studio Code, application `code`, quality `stable`; the app is
`/Applications/Visual Studio Code.app`. CLI version/help succeeded with the
previously observed `task_name_for_pid` diagnostic. CLI help exposes
`--user-data-dir`, `--extensions-dir`, and `--new-window`; actual instance
isolation is still untested.

T1 verified ignored/untracked artifact roots before local writes. T3 prepared
`profiles/m1-00/user-data` and `profiles/m1-00/extensions`, checking for symlink
ancestors and tracked paths first. No disposable workspace has been created.
The targeted extension-install command reported `github.copilot-chat` 0.63.0
already installed. Independent manifest inspection established that this build
bundles `GitHub.copilot-chat` 0.63.0 at
`/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/copilot`.
The test extensions registry contains zero entries. No extension download or
upgrade was observed. Availability in the GUI and authentication remain untested.
Interface language, Chat mode/model, and relevant effective settings are unknown.

## Dependencies and checks

T2 installed ApplicationServices and Cocoa plus their three transitive packages;
all five are 12.2.2. Exact pins and the successful binary-only reproduction
command are in the [spike README](../../scripts/spikes/m1_00/README.md) and
[requirements](../../scripts/spikes/m1_00/requirements.txt). All five installed
`WHEEL` records identify `cp312-cp312-macosx_10_13_universal2`. Imports of
ApplicationServices, AppKit and objc succeeded on the checkout interpreter.
The configured index was `https://pypi.org/simple`; the install was constrained
to wheels across the entire dependency graph. No source builds or compiler
installation occurred. Individual wheel hashes were not captured.

The initial command incorrectly combined `--no-build` and `--only-binary :all:`;
uv rejected the mutually exclusive options before installation. Removing
`--no-build` corrected that command. Sandbox cache-lock denial then required
execution approval; the same binary-only command succeeded outside the sandbox.
The saved requirements-file installation command subsequently checked all five
packages successfully. No system Python or project metadata changes occurred.

The [read-only preflight](../../scripts/spikes/m1_00/preflight.py) was executed
in both contexts. Sandbox execution returned 2 with unavailable Accessibility
trust and no visible VS Code applications. Approved host execution returned 0:
Accessibility trusted, graphical session visible, one VS Code application.
These are prerequisite observations, not window ownership or coexistence proof.
An earlier inline host probe had a Python syntax error before performing checks;
the saved script corrected it. Neither error reached four unsuccessful fix rounds.

No general test framework or harness runtime tests exist. Checks performed here
were actual dependency/import, interpreter isolation, metadata, ignore-path and
preflight executions. Response-state logic and its tests belong to Phase 2.

## Permissions

| Capability | Executing context and observation | Limit |
| --- | --- | --- |
| Accessibility | Checkout Python via approved host execution: `AXIsProcessTrusted()` true, no prompt requested. Sandbox: false. | Actual UI reads/actions and macOS consent attribution unverified. |
| Automation | No Apple Events sent; no prompt requested. | Untested. |
| Screen Recording | No capture performed; no prompt requested. | Untested. |
| Keychain | No secret access or manual sign-in performed. | Consent behavior and authentication reuse untested. |

## Initial pending work and checkpoint (before desktop confirmation)

The developer was asked to confirm exclusive desktop use, keep the regular VS
Code window open, and handle consent/sign-in during attended setup. A response
is pending; host visibility alone does not reserve the desktop. T3 GUI setup,
T4 mandatory coexistence/ownership/cleanup, and T5 Chat Accessibility inspection
remain pending. There are no verified selectors or candidate terminal signals
yet. Functional failure has not been demonstrated; desktop readiness is the
pending prerequisite. No cleanup was needed because no test instance launched;
dedicated local data is preserved.

After desktop confirmation, continue T3–T5 with the installed binary bridge.
Correlate owned launch paths and a new disposable workspace with its app/window
before actions, demonstrate scoped shutdown with the regular window unaffected,
then inspect only the owned synthetic Chat UI. Observe effective language,
mode/model, permissions and sign-in. Present T6 for validation before implementing
response-state logic or the two-launch demonstration. If semantic observation
fails, assess a supported-command fallback for the demonstrated gap; keyboard
input alone cannot establish ownership, freshness or response completion. No
fallback dependency or architecture has been selected.

AC1 is partial; AC2's installation and reusable requirements checks passed;
AC8 has the limited observations above. AC3–AC7 and AC9 are pending. AC10's
eight-hour budget remains in force. No go/no-go decision or Slice 0 approval is
claimed. The live cancellation, stale-history rejection, exact `READY` matches,
and restart authentication evidence all remain required.

Local diagnostics are `.ide-smoke/m1-00/baseline.json`,
`.ide-smoke/m1-00/preflight-sandbox.json`, and
`.ide-smoke/m1-00/preflight-host.json`. They contain sanitized metadata, counts
and dependency records, excluding UI content and credentials.

## Time ledger

The first explicit UTC baseline timestamp was 23:39:56. Initial reads preceded
that timestamp; conservatively account from 23:39:00 UTC. Active work includes
reference reading, investigation, scripting, correction, validation and reporting.
The final entry below records a conservative wall-time upper bound, counting
brief approval/download waits as active rather than understating budget usage.
Desktop/developer waiting after this report is excluded until work resumes.

Execution segment: 2026-10-20 23:39:00–23:43:10 UTC; conservatively charged 4.2 active minutes, including short tool waits. Explicitly deducted waits: 0 minutes. Remaining eight-hour budget: at least 475.8 minutes. Attended setup remains pending.

## Attended continuation and input diagnosis

The developer confirmed desktop readiness and later requested cause analysis
after the input probe reached four unsuccessful fix rounds. That explicit
guidance authorized the subsequent diagnostic experiment; no fifth fix round
was started before the request. The continuation began at 23:45:37 UTC on
2026-10-20 (local date remains October 20 across the UTC date boundary).

The lifecycle probe correlates the app PID, executable read from `Info.plist`,
launch date, dedicated `--user-data-dir` and `--extensions-dir` arguments,
disposable workspace marker and unique matching workspace window. The actual
executable is `Contents/MacOS/Code`; an initial hard-coded `Electron` path failed
before launching. Distinct app launches used fresh `workspaces/m1-00/<run-id>`
directories. The regular VS Code process/window remained present, with unchanged
title fingerprint, position, size and minimized state. These minimal observations
do not prove every internal state of the regular app was unchanged.

Owned termination and kernel PID-exit checks passed, with regular-window
fingerprints unchanged and the test profile preserved. An early short-lived app
disappeared before inspection; executor teardown was suspected but not established.
The reproducible launch keeps its executor session alive. Initial comparison
errors came from volatile pointer addresses in AX geometry representations and a
cached `NSRunningApplication.isTerminated()` result. Numeric geometry and kernel
existence checks corrected those measurement errors. No unrelated app was closed.

The initial tree contained 12 chrome/group nodes. Setting `AXManualAccessibility`
on the owned app returned zero and exposed its web UI. This follows the
[Electron Accessibility documentation](https://www.electronjs.org/docs/latest/tutorial/accessibility).
Bounded inspection (1,400 nodes, 45 levels maximum) found a unique `AXButton`
with `AXTitle=Toggle Chat`, plus a unique Chat `AXTextArea`. Semantic toggle
actions visibly hid/restored Chat; a hidden-panel observation had 218 nodes and
zero text areas. Unknown labels are hashed; raw values are excluded.

The default mode was Agent; its visible picker exposed Agent and Configure
Custom Agents, with no Ask entry. The installed workbench nevertheless registers
`workbench.action.chat.openAsk`. Opening the Command Palette and invoking the
observed `Chat: Open Chat (Ask)` result visibly selected Ask, without a prompt.
Separate approval dialogs could steal focus between a UI action and its later
inspection. Combining activation, shortcut, result selection and observation in
one invocation established the actual palette outcome. This does not establish
the native menu or PID-targeted shortcut routes as working. The observed UI labels
are English; language settings and other locales remain unqualified. The model
control includes Copilot/Model labels; its exact selected model remains unrecorded.

### Failure and four-round stop

The initial direct `AXValue` setter returned success but the expected synthetic
input was absent from readback. The same input-observation requirement then had
four unsuccessful fix rounds:

| Round | Proposed fix | Result |
| --- | --- | --- |
| 1 | Poll `AXValue` for three seconds after setting it. | Expected value absent. |
| 2 | Activate and verify the owned app before setting the value. | Expected value absent. |
| 3 | Verify input focus, then deliver Unicode keyboard events. | Focus verified; expected value absent. |
| 4 | Deliver physical keys for `m100`; inspect both value and selected text. | Both lengths zero; expected value absent. |

The probe stopped, saved `.ide-smoke/m1-00/input-failure-rounds.json`, and closed
the owned app. The developer then requested analysis. Earlier empty readbacks
were insufficient evidence of actual buffer emptiness or successful clearing;
they are preserved as observations, not proof of those outcomes.

### Confirmed cause and regression evidence

**The keyboard failure was a false negative caused by using the Monaco editor's
Accessibility input proxy as though it always exposed the editor buffer.**
The installed workbench code contains separate screen-reader content handling;
outside optimized mode its native input can expose empty content. VS Code
documents the `editor.accessibilitySupport` mode switch in its
[Accessibility guide](https://code.visualstudio.com/docs/configure/accessibility/accessibility).
Enabling Electron's tree and macOS trust alone did not make editor-text readback
reliable in the tested default configuration.

The controlled [diagnostic](../../scripts/spikes/m1_00/diagnose_proxy.py) confirmed
this on the actual owned Chat input:

1. With `editor.accessibilitySupport=off`, type the physical keys for `m100`.
   The exposed value remained empty.
2. Change only that setting to `on`, without typing or deleting anything.
   The same input exposed exactly `m100` (four characters).
3. Select the text, independently observe the exact selection, delete it, and
   verify the cleared input in optimized mode.
4. Restore the profile's original absence of a settings file.

The mode's visible Screen Reader Optimized indicator was observed. A preliminary
experiment stopped on an exposed newline, which was subsequently identified as
the empty editor representation (U+000A), not residual synthetic text. No private
text was logged or erased.

The original `discover.py input-keys` probe was rerun with verified optimized mode
after adding that explicit prerequisite and accepting its observed empty/newline
representation. It passed: value and selected text both exactly `m100`, verified
clear, no submission, regular window unchanged. This target-host regression check
is the appropriate seam; a mocked unit test would not establish Monaco behavior.
The direct `AXValue` setter remains unsupported by evidence: the keyboard result
does not establish that a native value assignment edits Monaco's model.

Local evidence includes `input-proxy-diagnosis.json`,
`input-diagnosis-first-comparison.json`, the preserved failed
`m1-00-9e89c36797-input-physical-keys.json`, the passing
`m1-00-5db16dc058-input-physical-keys-*.json`, and per-run session/tree/cleanup
records under `.ide-smoke/m1-00/`. The hypothesis comparison did not require
credentials, a model request, Screen Recording, a driver extension or new packages.
Accessibility reads/actions and CoreGraphics event posting were exercised in
approved host execution; event-post permission preflight returned true. Automation
and Screen Recording remain untested; Keychain consent/authentication are untested.

### Remaining Phase 1 work

T4 now has scoped lifecycle/coexistence evidence, and T5 has verified Chat
opening/Ask selection/keyboard input observations. Proposed qualification requires
explicit screen-reader support in the dedicated profile, which must be presented
as a material configuration condition at the checkpoint. The diagnostic restored
settings instead of silently making this persistent. T3 authentication, exact
model/effective-settings inventory, assistant-turn and candidate terminal-state
inspection still need work. No response completion, cancellation, freshness,
two-launch authentication reuse, or exact `READY` assertion is established.
Phase 1 readiness, Phase 2 authorization and Slice 0 approval remain pending.

Artifact deviation: the sanitized report uses `docs/reports/M1-00-phase1.md`
instead of the plan's proposed `docs/feasibility/M1-00.md`; persistent profile paths
use `profiles/m1-00/`. Both choices preserve the intended ignored-data boundaries.

Continuation charged conservatively through 2026-10-21 00:09:22 UTC: 23.8 minutes; cumulative active-budget charge 27.9 minutes; at least 452.1 minutes remain. Brief approval waits are included rather than deducted. Final owned cleanup passed and temporary test settings were restored.
