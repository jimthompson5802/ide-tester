# M1-00 Phase 1 execution — 2026-10-20

**Current disposition — developer scope reduction, 2026-10-20:** Only submitting
one request (`Reply with exactly the word READY.`) through Copilot Chat and
requiring `response.strip() == "READY"` for its assistant response is required now. The [revised plan](../implementation-plans/M1-00.md) governs.
The retained second exchange establishes the exact response assertion on retrospective
review; see the [current result](#reduced-scope-result--saved-evidence-review).
Developer validated M1-00 on 2026-10-20; Slice 0 is complete. No finished harness is claimed.

The developer validated Phase 1 and confirmed that the regular-window title
change was developer activity. A subsequent live cancellation action was sent
before the developer stopped the broader investigation and reduced scope. No
further Copilot requests were sent during the plan revision. Original test
settings were restored exactly, owned shutdown passed, the authenticated profile
was preserved, and the regular-window fingerprint matched its launch baseline.
There is no active owned test instance.

**Historical record:** The sections below describe the earlier, broader work.
References to required cancellation, stale-history, completion,
restart/repeated-launch checks, and earlier pending Phase 1 validation are
superseded for the current task. They remain observations and decision history,
not instructions to resume those tests. The later clarification retains exact
`READY` matching for the single request/response; response receipt alone does not
establish that assertion.

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

## Resumed attended setup — 2026-10-20 local date

The developer requested continuation and confirmed desktop readiness. Read-only
host preflight again passed: checkout Python 3.12.15 arm64, user site disabled,
all five pinned PyObjC 12.2.2 distributions with the previously recorded wheel
tags, Accessibility trusted, graphical session visible, and one regular VS Code
application. No packages or applications were installed or upgraded.

At 2026-10-21 00:15:12 UTC, a new owned instance launched for workspace
`m1-00-54f29fddaa` using the existing dedicated profile. Process/window/workspace
correlation passed, enabling `AXManualAccessibility` returned zero, and the
Command Palette route visibly selected Ask. The regular window fingerprint
remained unchanged. No Chat prompt was submitted.

The owned model picker initially exposed the exact Accessibility description
`Models, sign in to use Copilot`. This is now observed authentication-required UI
evidence, rather than an assumed selector. Manual sign-in was requested from the
developer; passwords, MFA, account controls and credential storage were not read
or automated. A later read-only snapshot exposed `Models, Auto` and
`Set Agent (⌘.) - Ask`, with the sign-in-required message absent. This establishes
the displayed model selection and UI transition only. Developer confirmation of
completed sign-in, a successful authenticated request, and restart reuse remain
pending. Auto does not identify the backend model selected for any future request.

The probe now provides `configuration`, which records only the owned mode/model
control labels, observed sign-in requirement and coexistence result. Its host
execution passed and saved a timestamped configuration snapshot. `inspect --quiet`
also passed on the host: 341 nodes saved in the existing bounded redacted format,
with ownership and regular-window checks true. Python AST parsing and
`git diff --check` passed. No harness runtime suite exists; no response-state logic
or completion checks have been implemented or tested.

Installed workbench code was inspected for candidate response-state behavior.
It distinguishes cancellation, errors and completion internally, but these
internal fields have not been established as Accessibility observations. Source
inspection alone supplies no verified UI completion method. T5 response-state
inspection and the T6 Phase 1 checkpoint remain outstanding; Phase 2 is not
authorized by this continuation.

The dedicated instance is intentionally left open for manual setup, with active
ownership state at `.ide-smoke/m1-00/session.json`. Resume by checking that state
and the owned instance, rather than launching a second instance. The local
configuration snapshot and tree use the `m1-00-54f29fddaa-` prefix in that directory.
No settings were changed during this continuation. Cleanup has not been run for
this still-open setup session; the earlier successful cleanup evidence remains
separate.

Budget accounting conservatively charges three minutes for the preceding
read-only resumption and seven minutes for this attended continuation through
2026-10-21 00:22:12 UTC, including short approval/manual waits. Cumulative charge:
at most 37.9 minutes; at least 442.1 minutes remain. Subsequent developer waiting
is excluded until active work resumes.

## Phase 1 checkpoint after manual sign-in

The developer confirmed on 2026-10-20 that manual sign-in worked. Host inspection
again observed Ask mode and Auto model selection, with the sign-in-required label
absent. Installed manifest checks reconfirmed VS Code Stable 1.135.0, commit
`08d4889f9ec4a1685d257b9b95de036c8e1ce1e5`, and bundled
`GitHub.copilot-chat` 0.63.0. UI labels observed during the probes were English;
other languages are unqualified. Auto is a selection policy; the backend model
used for a particular request was not established.

The dedicated profile now contained an empty settings object, unlike the earlier
absence of the file. Its exact bytes were backed up locally before temporarily
adding `editor.accessibilitySupport=on`. The existing `input-keys` host check
passed: optimized-mode indicator, exact four-character value and selected-text
readback, verified clear, no submission and regular-window fingerprint unchanged.
No personal settings were changed. Original test settings bytes were restored
after response inspection.

### Observed response structure and transition

The macOS-only [observation script](../../scripts/spikes/m1_00/observe_response.py)
was executed twice against the same owned launch, for bounded T5 discovery. Each
execution typed one fixed harmless synthetic request, verified its exact input
readback before Enter, and sampled candidate Accessibility signals for 25 seconds.
The sampling duration bounds inspection; it is not a completion heuristic. The
script makes no completion/freshness decision and implements no Phase 2 test.

The first request exposed a Cancel button during generation, followed by synthetic
marker text in the transcript, feedback/retry controls and restored Send UI. The
regular-window comparison passed for this execution. More detailed inspection
found the following public structural attributes within the owned Chat subtree:

| Observation | Established use and remaining limit |
| --- | --- |
| Unique Chat `AXList`; transcript rows with `AXDOMIdentifier` | Candidate conversation boundary and row identity. Identifiers are hashed in evidence; persistence across restarts is untested. |
| `interactive-request` and `interactive-response` in `AXDOMClassList` | Distinct prompt/assistant containers within transcript rows. This is more specific than searching all window text. |
| `chat-response-loading` on the new response | Directly observed response-associated in-progress signal. `AXElementBusy` stayed false in captured samples, so it is not an established replacement. |
| `chat-response-completed-at` inside the response footer | Directly observed terminal timestamp element. It is not proof of successful generation. |
| Cancel control during generation | A candidate action for the required later live cancellation challenge; no cancellation was performed here. |

The second request retained the first synthetic response in history. At 0.108
seconds the new response container had `chat-response-loading`, while the prior
response did not. At 0.363 seconds the new response was still loading and a Cancel
control was present. At 1.653 seconds the new response no longer had the loading
class, a second response timestamp appeared, and marker text existed in both
response subtrees. Subsequent observation also found a duplicate marker outside
the transcript, reinforcing why a global text match is unsuitable. Captured
`AXARIAPosInSet` values were all 1 for the transcript rows, so those values alone
do not establish turn order; row identities and subtree order remain candidates.

These are real GUI observations after confirmed sign-in, but they do not satisfy
the Phase 2 exact-response test or stale-history rejection. The observer recorded
marker comparisons without implementing an independent success classifier. Two
requests in one launch do not establish restart authentication reuse.

Installed workbench source inspection confirms `chat-response-loading` tracks
the response's internal completion status. Crucially, its cancellation path also
sets a completion timestamp, and its completion state includes error/cancel
outcomes. Therefore loading disappearance, a timestamp, feedback controls or
restored input cannot by themselves justify success. No live cancelled response
or safely reproduced error was inspected. Cancellation/error discrimination is
the central unresolved capability for the next phase; no go recommendation is
made.

### Regular-window drift and cleanup

The second execution's final regular-window comparison returned false. A minimal
read-only comparison established that only its title fingerprint differed:
regular process/launch identity, window count, position, size and minimized state
matched the launch baseline. No private title text was logged. The cause of this
title change is unresolved; developer activity or autonomous UI changes are
possibilities, not findings. The captured state does not prove the regular window
was unchanged during this execution. Earlier successful coexistence evidence is
retained separately, and this run cannot be used as fresh unchanged-window proof.

No more Chat requests were made. The temporary test setting was restored to its
exact original bytes, owned termination and kernel process-exit checks passed,
and the authenticated profile was preserved. The regular-window comparison still
reported false against its original title fingerprint. There is no active session
record; the run's state was archived by scoped cleanup. The observer now refuses
a new request if the regular-window baseline is already changed. That new guard
was syntax-checked; its rejection path has not been exercised on the host.

### Checkpoint disposition

| Task | Assessable Phase 1 result |
| --- | --- |
| T1–T2 | Prior baseline/dependency evidence retained; refreshed interpreter/import inventory passed, and installed IDE/extension manifests reconfirmed. No new packages or source builds. |
| T3 | Dedicated manual sign-in developer-confirmed; observed English Ask/Auto configuration. Settings restriction documented. Restart reuse remains for Phase 2. |
| T4 | Prior scoped lifecycle/coexistence evidence retained; current owned launch/cleanup passed. Latest title drift limits this run's coexistence evidence and requires review. |
| T5 | Chat/input selectors, request/response structure, loading transition and terminal timestamp observed. Distinguishing successful, cancelled and erroneous termination remains unverified. |
| T6 | Findings and Phase 2 refinements presented here and in the plan. Developer validation pending. |

Accessibility reads, semantic actions and CoreGraphics keyboard events worked in
approved host execution. Automation/Apple Events and Screen Recording remain
untested and were not requested. The developer completed manual sign-in, but
Keychain consent behavior was not observed by the agent; no credential-store
contents were inspected. Screenshots were unnecessary and omitted.

The proposed Phase 2 investigation should first challenge the candidate terminal
signals with actual cancellation and observable errors, then implement a bounded
classifier only if those outcomes can be distinguished. It must reject stale
history, echoed input and ambiguous states, and still demonstrate two separate
launches with exact response assertions and authentication reuse. Qualifying
conditions proposed for review are English UI, Ask/Auto, explicit screen-reader
support in the test profile, sequential execution and exclusive desktop use.
Review the regular-title drift before the next run. The selected Auto backend
and different language/model configurations have no repeatability qualification.

If Accessibility cannot distinguish terminal outcomes, return for a design
decision. A possible fallback is a supported IDE command exposing a richer
accessible response view; freshness, terminal-state discrimination and isolation
would still need evidence. No such fallback has been validated. A driver extension
or different architecture requires a revised plan and developer validation.

Local diagnostics under `.ide-smoke/m1-00/` include
`m1-00-54f29fddaa-response-observation-1792542242085840000.json`,
`m1-00-54f29fddaa-response-observation-1792542366463964000.json`,
`m1-00-54f29fddaa-response-structure.json`,
`m1-00-54f29fddaa-regular-drift.json`, and the run's configuration, tree, archived
session and cleanup records. Raw prompts/responses, account identifiers, tokens
and credentials are absent from these diagnostic records. The persistent profile
remains ignored and untracked.

Actual checks: two host observation executions, the host input check, configuration
snapshots, manifest reads, restored-settings comparison and scoped cleanup.
Python AST parsing, relative-link validation and whitespace checks are used for
the changed artifacts. There is no harness runtime suite or tested response
classifier. No new four-round failure sequence occurred.

Budget: active work resumed at 2026-10-21 00:22:33 UTC. Conservatively charge
through 00:30:03 UTC (7.5 minutes, including brief approval and service waits),
bringing the cumulative charge to at most 45.4 minutes; at least 434.6 minutes of
the eight-hour budget remain. Developer waiting after this checkpoint is excluded.
This checkpoint requests validation of Phase 1 findings and the bounded next-phase
investigation, not acceptance of feasibility or authorization of the main harness.


## Scope reduction and interruption cleanup — 2026-10-20

The developer stated that only sending a Copilot request and receiving a response
are needed and requested a plan revision. The revised plan removes broader
qualification tasks and reuses the existing two exchanges as basic send/receive
evidence. Nonempty assistant text is sufficient; exact wording and generation
completion are not current acceptance requirements. No more usability, negative
path or restart qualification work is scheduled.

Before that instruction, the approved Phase 2 investigation launched owned
workspace `m1-00-8230a517c0` with the existing profile, selected Ask/Auto and sent
one harmless long synthetic request. The observed Cancel control was pressed
while loading, and redacted sampling finished. This superseded probe is retained
at `.ide-smoke/m1-00/m1-00-8230a517c0-response-observation-1792542671072604000.json`.
No completion classifier or cancellation-discrimination conclusion was produced.

After the interruption, cleanup restored the exact original settings bytes from
`.ide-smoke/m1-00/phase2-original-settings.json` and terminated only the verified
owned instance. Kernel process-exit, profile preservation and the regular-window
fingerprint comparison passed. No new submission or response test was run as
part of this documentation revision. The historical spike scripts, including
broader operations, are retained; the revised plan defines which work is current.

Documentation validation covers local file links, explicit plan/report section
targets, whitespace and current-scope consistency. A harness runtime suite remains
unavailable; this task did not implement one. Broader implementation is not
started by revising the plan.

Revision checks passed for 50 relative file links and their explicit section
targets, `git diff --check`, archived ownership state and exact restoration of
the original test settings. No additional runtime suite was run. Conservatively
charge seven further active minutes after the prior 00:30:03 UTC cutoff through
2026-10-21 00:37:03 UTC for the interrupted investigation, cleanup and revision.
Cumulative budget charge: at most 52.4 minutes; at least 427.6 minutes remain.
This retained ceiling does not schedule additional tests outside the reduced scope.


## Exact response assertion retained — 2026-10-20

The developer clarified that exact `READY` matching remains in scope for the
single request/response. This supersedes the preceding scope-reduction paragraph's
statement that exact wording is unnecessary. Submit `Reply with exactly the word
READY.` and compare the associated assistant response with
`response.strip() == "READY"`. Trim whitespace only; punctuation, different case,
Markdown wrapping and extra words fail. Existing response observations may be
reused only if they establish the exact assertion for that exchange; a receipt
flag alone is insufficient. No new GUI actions or runtime checks were performed
for this documentation correction. All other reduced-scope exclusions remain.


## Reduced-scope result — saved evidence review

**Result:** AC1–AC3 are satisfied by the retained host evidence and this result
record. R1 and R3 are complete; R2 is unnecessary. Developer accepted
M1-00 on 2026-10-20. This continuation performed offline checks only,
without launching VS Code, changing settings or sending another request.

The selected exchange is the second request in owned launch `m1-00-54f29fddaa`.
The observer typed `Reply with exactly the word READY.`, checked exact input
readback before Enter, and recorded `submitted=true`. The baseline already
contained the first assistant container. A separate new `interactive-response`
container appeared after submission. At 1.653 seconds its body exposed one
five-character `AXStaticText` value whose recorded `value.strip() == "READY"`
comparison was true. The final recorded change sample at 1.908 seconds retains
that same exact comparison. The observer sampled for a fixed 25 seconds; it did
not extend the wait or resubmit to obtain a preferred answer.

The saved full tree confirms that this response's body group contains exactly
one text leaf, at the path carrying the comparison. Toolbar, footer, submitted
prompt, previous assistant text and a duplicate outside the transcript are
excluded. This establishes the whole observed response body assertion rather
than a global or substring match. Raw response text was intentionally not saved;
the assertion is verified from the comparison recorded on the host and the
corresponding tree structure. This retrospective check is specific to the saved
exchange and does not implement a general response or completion classifier.

| Criterion | Evidence/result |
| --- | --- |
| AC1 — Submit the specified request | Exact keyboard input readback before Enter; recorded submission true. |
| AC2 — Exact assistant response | New assistant container; single body text leaf; recorded whitespace-only exact comparison true, within 60 seconds. |
| AC3 — Record configuration and reproduction | This result and the offline reproduction below. |

Tested configuration: macOS 15.7.9, Python 3.12.15 arm64, VS Code Stable 1.135.0,
bundled GitHub.copilot-chat 0.63.0, English UI, Ask/Auto and temporarily enabled
`editor.accessibilitySupport=on`. Accessibility access, a visible graphical
session and developer-confirmed manual sign-in were prerequisites. Auto's backend
model was not identified. The second exchange's regular-window comparison was
false because of title drift; the developer subsequently confirmed that title
change was their activity. It is retained as a caveat, not relabeled as a passed
unchanged-window check.

Reproduce this evidence review from the checkout root:

```bash
.venv/bin/python scripts/spikes/m1_00/verify_saved_ready.py
```

The [offline verifier](../../scripts/spikes/m1_00/verify_saved_ready.py) requires
these existing ignored local artifacts under `.ide-smoke/m1-00/`:

- `m1-00-54f29fddaa-response-observation-1792542366463964000.json`
- `m1-00-54f29fddaa-tree.json`

It checks the final recorded change sample, the new assistant container, the
single-leaf body structure and the recorded exact comparison. A fresh checkout
without these artifacts cannot reproduce the offline result. For the original
host interaction path, see the [spike README](../../scripts/spikes/m1_00/README.md#minimal-host-reproduction).

Cleanup evidence from the interrupted later launch remains applicable: the owned
app exited, its authenticated profile was preserved, and the regular-window
fingerprint comparison passed. This continuation independently verified that
`session.json` is absent and the current test settings bytes equal the preserved
`phase2-original-settings.json`. No new GUI cleanup was needed.

Completion detection, cancellation/error discrimination, restart reuse and broader
repeatability remain unqualified and outside this acceptance. Main-harness work
and M1-01 require separate authorization after developer validation.

Continuation validation passed: the offline verifier reported submission, assistant
receipt and the exact comparison true (final change sample: 1.908 seconds). All
spike Python files parsed successfully; 55 relative file links and explicit
section targets resolved; `git diff --check` passed. Settings-byte equality and
absence of active session state passed. No new host GUI check was performed; a
main-harness runtime suite remains unavailable.


## Final developer validation — 2026-10-20

The developer stated “i validate m1-00”, accepting the reduced request/response
result, the exact whitespace-trimmed `READY` assertion, the tested prerequisites
and documented limitations. M1-00 and the Slice 0 developer gate are complete.
M1-01 implementation and main-harness work require separate authorization. No new
GUI interaction or runtime check was performed to record this acceptance.
