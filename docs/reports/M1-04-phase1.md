# M1-04 Phase 1 — Lifecycle qualification

Execution authorized on 2026-10-21 by “execute plan
docs/implementation-plans/M1-04.md using tdd and subagents”.
P1-01–P1-04 are implementation verified under the developer-revised scope.
**Phase 1 complete and developer validated on 2026-10-21.** The final
P1-04 specification and refined Phase 2 tasks are linked in the closing section.
Historical entries retain their original status. P1-VALIDATION is complete.
The developer explicitly instructed **do not start Phase 2 yet**; production
integration remains unstarted and requires separate execution authorization.

Investigation budget: one hundred ten cumulative active minutes charged through probe
implementation, resumed diagnosis, review, GUI checks and P1-04 writing, including
parallel subagent work (rounded up). Eight-hour
cumulative limit and four-unsuccessful-fix-round rule remain in force. No error has reached four unsuccessful fix rounds.

## Lessons learned

Phase 1 established a working native launch/readiness/observed-shutdown path on
the qualified macOS/VS Code installation. The final evidence is **441 passing
non-GUI tests** and **nine expected GUI outcomes**, including normal readiness in
**2.89s**. Controlled failures used real owned launches with labeled injections;
they are not evidence of naturally occurring product failures.

| Finding | Consequence for implementation |
| --- | --- |
| Sandbox and host observations differ: only the approved host context exposed the trusted graphical session. | Verify GUI prerequisites in the actual execution context. Passing logical tests does not qualify desktop behavior. |
| Window titles, PID alone and AppKit metadata are insufficient ownership evidence. Launch date was unavailable on the directly launched instance. | Require original process authority, kernel birth, exact executable/arguments and controller/session checks. Treat launch date as optional corroboration, with consistency checks when present. |
| Application registration alone is an incomplete conflict-detection mechanism. Native synthetic-process tests cover an unregistered selected executable. | Supplement registration with same-user executable inspection. Keep exclusive profile reservation mandatory; unregistered alternate installations remain a limitation. |
| A generic initial window can precede the actual workspace workbench. | Treat known loading titles as nonready under the original deadline. Require exact workspace correlation plus AXWebArea/AXOutline/AXToolbar and no obstruction; process existence alone cannot pass. |
| Repeated AXManualAccessibility requests restarted Electron's two-second delayed exposure and prevented the required tree from appearing. | Acknowledge one successful enable per owned session, then observe without resetting it. Persistent settings changes were unnecessary for the demonstrated T01 path. |
| Long synthetic profile paths exceeded the installed Code IPC warning threshold and produced unsuitable early-exiting fixtures; short paths provided a stable live owner. | Validate the complete socket path, including the product-version suffix, in bytes. Path length is a supported explanation, not a proven cause for every historical failure. |
| An isolated sleeping observer was stopped within its budget while original launch ownership remained available. | Enforce worker deadlines outside native calls. Do not extend that evidence into a hard timeout guarantee for synchronous controller process creation. |
| Current tracking covers the main process, current session and remembered birth identities, including observed reparenting; unseen detached descendants can escape it. | Complete descendant safety is deferred. The Phase 2 specification retains every workspace after GUI launch entry, independently of cleanup outcome and configured failure retention. This policy is not yet production behavior. |
| An interrupt during the injected operation left the existing summary with T01 SKIP and no duration, although the probe retained interrupted facts/timing. | Phase 2 must record T01 ERROR/interrupted and elapsed time at the operation boundary, then skip dependents while preserving cleanup and exit precedence. |

Additional decisions: automatic recovery remains deferred and its failed evidence
remains failed. Normal bounded cleanup and detected-uncertainty errors still
apply. Only two direct PyObjC frameworks are justified; their dependencies make
five qualified distributions total. Production dependency promotion, installation
qualification and CLI integration remain Phase 2 work.

The [final P1-04 specification](../implementation-plans/M1-04.md#final-p1-04-implementation-specification--2026-10-21)
captures the resulting interfaces, bounds, retention policy, result mapping and
implementation tasks. The developer validated Phase 1 on 2026-10-21 and
explicitly withheld Phase 2 execution authorization. The chronological evidence below preserves earlier states and
failures rather than rewriting them as successful results.

## Read-only observations

The existing `.venv/bin/python scripts/spikes/m1_00/preflight.py` was run as a
child of a Python subprocess with a 15-second timeout and captured output. The
sandbox returned preflight exit 2: Accessibility false, graphical visibility
false, and zero visible VS Code applications. The identical bounded command
outside the sandbox returned preflight exit 0: Accessibility true, graphical
visibility true, and one VS Code application. Neither check requests consent.
Application count does not establish window coexistence or profile reservation.

Read-only `platform`, `plistlib`, `/usr/bin/file`, and `sw_vers` checks establish:

| Item | Observed value |
| --- | --- |
| macOS | 15.7.9, build 24G830 |
| Checkout Python | 3.12.15 arm64; user site disabled |
| VS Code | 1.135.0; bundle `com.microsoft.VSCode` |
| Info.plist native executable | `/Applications/Visual Studio Code.app/Contents/MacOS/Code` |
| Native executable format | Mach-O 64-bit arm64 |
| PyObjC distributions present | core, Cocoa, ApplicationServices, CoreText, Quartz: 12.2.2 |
| Installed PyObjC wheel tags | cp312, macosx_10_13_universal2 |

These metadata observations do not qualify lifecycle identity, runnability or
readiness. The example's historical `Electron` path is not the observed native
entry. No example or production configuration was changed. The five PyObjC
packages remain spike-only; presence is not a decision to promote them. Wheel
origins and minimal production requirements remain P1-04 work.

The developer confirmed exclusive unlocked desktop and dedicated-profile reservation on 2026-10-21 with “the desktop and test profile are reseved. proceed.” The developer accepted the recommended lifecycle and run_attempt test seams with the sequence correction before test implementation.

## Check matrix defined before probe implementation

This matrix was defined before implementation; subsequent synthetic and first host observations are recorded below. Uncompleted host checks remain unqualified.

| Check | Expected observable outcome |
| --- | --- |
| Native launch | Selected native executable, vector arguments, exact admitted children/current manager-issued workspace; wrappers rejected. |
| Ownership | Birth identity, executable and exact argument association agree; mismatch/ambiguity permits neither attachment nor termination. |
| Occupied profile | Block before spawning; original owner remains responsible for existing instance. |
| Readiness | One owned live workbench for exact workspace, accepted passive structure, no modal; wrong/welcome/ambiguous observations cannot pass. |
| Coexistence | At least one unrelated window; transient birth, geometry/count and title-fingerprint comparisons agree; persist sanitized comparisons only. |
| Startup failure | Distinct controlled spawn/early-exit reason and finite duration; no raw native exception text. |
| Timeout/stall | Shared startup deadline; stalled observation cannot prevent bounded controller return or discard cleanup authority. |
| Obstruction | Fixed category only; dialog untouched; owned cleanup attempted. |
| Cleanup | Graceful app-specific shutdown; qualified descendants including reparented processes exit before workspace deletion; uncertainty causes retention/error. |
| Shutdown injection | Preserve T01 result, separate cleanup error/nonzero, retained resources; recovery by original in-memory owner, no forced IDE kill. |
| Interruption | Target: T01 HARNESS ERROR/interrupted with duration, dependent skips, cleanup and existing exit policy; current seam limitation below blocks integrated check. |
| Preservation/privacy | Marker/layout and independent synthetic sentinels preserved; no credentials, chat, raw titles/process lists or unrelated content in artifacts. |

## Source audit and material plan conflict

Two read-only subagents inspected prior lifecycle evidence and current integration.
The existing spike's command-string substring matching and title matching are
insufficient ownership proof. Its cleanup does not qualify descendant tracking.
Native-call deadlines and passive workbench/modal evidence remain unqualified.
An isolated observer with a parent deadline is a candidate, not verified behavior.
Exact native argument inspection and descendant tracking through reparenting
remain open; ordinary `ps` command-text splitting cannot establish exact argv.

The existing `run_attempt()` operation block in
[orchestrator.py](../../src/ide_smoke/orchestrator.py) catches `Exception`, while
`KeyboardInterrupt` reaches the outer handler before the result and elapsed
duration are appended. The final fill therefore produces T01 SKIP without a
duration. This is source inspection, not a newly executed interruption test.
P1-03 requires the opposite saved outcome, but Phase 1 does not authorize edits
to this production module. Rethrowing an interrupt during cleanup would falsely
report shutdown failure and change exit precedence; reporter manipulation would
manufacture evidence. Neither is an acceptable qualification result.

Accepted correction — 2026-10-21 (“I accept your recommendations”): Phase 1 qualifies the probe's
own interrupted lifecycle, cleanup and elapsed timing, records the existing
orchestrator limitation explicitly, and leaves saved production T01 interruption
qualification to the already planned P2-03/P2-04 fix. P1-03 now reflects this accepted sequence; production edits remain outside Phase 1. Dependent probe work has resumed.

The proposed integration otherwise uses a delegating `_workspace_factory` to
capture the already admitted executable, real guard/admission/workspace handling,
and only an injected T01 operation. Register close before spawn; callback errors
must propagate so the existing finalizer retains the workspace. These are design
findings only. No production API or dependency decision is frozen.


## P1-02 implementation and TDD evidence — 2026-10-21

Implemented [qualification probe](../../scripts/spikes/m1_04/qualify_lifecycle.py)
and [31 non-GUI tests](../../tests/unit/test_m1_04_qualification.py). The implementation
subagent and two reviewing subagents worked within Phase 1. No production source,
dependency, authenticated profile, editor setting or GUI behavior was changed.

The probe uses the real admission, lock and workspace manager through private
`run_attempt` injection. A delegating workspace factory captures the exact admitted
executable. Cleanup is registered before launch. The current CLI explicitly
requires `--host --config PATH`; invoking it without opt-in exits 2 without
creating reports/workspaces. Importing it loads no native frameworks.

Launch/readiness share a monotonic deadline. Native inspection and messaging run
in disposable Python workers, each bounded by the lesser of three seconds and
the remaining deadline. Cleanup currently has a ten-second independent budget.
Workers receive in-memory requests, never saved recovery tokens. Before mutation,
the worker checks exact birth/executable/argv, application launch identity, and
that the target remains a direct child of its live controller in its original
session. Only the app-specific graceful termination is used; helpers and process
groups are never termination targets. The controller retains its Popen handle
before SIGINT is delivered after spawn. Main-thread launch is required for the
temporary signal handler; child signal masks are not changed.

Each reply has a checked schema, including exact booleans for exit/readiness and
typed PID/birth/argument/ledger fields. A malformed observation cannot become a
ready workbench; a truthy string cannot become confirmed shutdown. Identity
mismatch prevents mutation. The passive candidate predicate requires one exact
workspace-name title component combined with exact process/workspace arguments,
AXWebArea/AXOutline/AXToolbar structure, exhaustive bounded traversal, and no
observed modal/dialog subrole. This predicate remains unqualified on real VS Code.

Separate `qualification.json` artifacts save fixed attempt reasons, durations,
lifecycle facts, cleanup outcome and workspace disposition under the ordinary
ignored report directory, while the existing guard is held. Existing production
summary schemas/results are unchanged. Probe-local interruption facts are saved;
production interrupted T01 still has the documented SKIP/no-duration limitation.
On cleanup failure, the CLI makes one recovery attempt using the original owner
after reacquiring the guard. Retained workspaces are never deleted by recovery.
If recovery remains uncertain, only exact owned PID/workspace and available birth
identity are printed as local manual-recovery diagnostics. Recovery never widens
ownership, adds forced termination, or changes the original failed run result.

The repeated focused command was:

```text
.venv/bin/python -m pytest -q tests/unit/test_m1_04_qualification.py
```

Observed red-green slices:

- Missing lifecycle entry -> one passing exact-vector/shared-deadline test.
- Launch errors, partial initialization and identity mismatch -> four passing tests.
- Wrong/ambiguous/welcome-like and modal readiness observations -> eleven passing tests.
- Guarded orchestration, retention and interruption facts -> fourteen passing tests.
- Launch consuming the shared budget and retryable scoped cleanup -> fifteen passing tests.
- Unsupported wrapper rejection -> sixteen passing tests.
- A genuinely stalled inert worker with a 0.15-second budget -> seventeen passing tests;
  its test asserts controller return within 1.5 seconds and no IDE spawn.
- Missing explicit host opt-in -> eighteen passing tests.
- Native exact-argument inspection -> nineteen passing tests. A test initially used
  the Python launcher, which rewrites argv[0]; it was corrected to the actual
  Python.app native executable. Spaces, empty arguments, prefix collisions, stable
  birth and actual executable identity then passed. No IDE was involved.
- Native controller start/observe/close through a synthetic worker -> twenty passing tests.
- Changed argument identity initially allowed backend close; the regression failed,
  then backend validation prevented shutdown requests for that unqualified token.
- Native synthetic parent/child reparenting -> twenty-two passing tests; the child
  remained accounted for after its observed parent exited.
- Synthetic AX workbench/modal observations and app-specific graceful shutdown ->
  twenty-four passing tests. Fake AppKit terminates only the owned synthetic Python
  child; these are not graphical shutdown observations.
- SIGINT during injected spawn initially lost the handle; malformed exit replies
  initially counted as success. Both failed first, then passed after deferred
  interruption and strict response validation.
- Incomplete live observations initially passed readiness; known native prerequisites
  initially became errors. Both failed first, then passed with complete live reply
  schemas and a fixed BLOCKED prerequisite reason.
- Missing guarded recovery entry failed first; recovery then reused the original
  owner under the guard while preserving the retained workspace and nonzero result.
- Relative foreign profile arguments initially passed preflight; the regression
  failed, then uncertain relative paths were rejected without touching that process.

One command-opt-in test initially assumed its temporary directory was empty;
the repository autouse fixture already creates a synthetic checkout. It was
corrected to compare directory contents before/after. No product requirement was
relaxed. No error reached four unsuccessful fix rounds.

The new native read-only host preflight was also exercised with a five-second
outer subprocess bound: before implementation it returned controlled
`ownership_uncertain`; after implementation it returned
`prerequisites_observed: true`. It inspected prerequisites and relevant process
metadata only, and did not launch or alter VS Code.

Final full regression:

```text
.venv/bin/python -m pytest -q
398 passed in 4.62s
```

`git diff --check` passed. Documentation links and untracked-file whitespace are
checked separately. Focused synthetic artifacts are pytest temporary resources;
no real IDE run report, GUI timing, coexistence evidence or authenticated-profile
preservation claim has been produced by this implementation.

## Remaining host qualification and limitations

P1-03 began after the required desktop/profile reservation confirmation. The first host run failed ownership/readiness and scoped recovery; investigation is now stopped under the recovery-failure rule. P1-04 cannot freeze production decisions before the required host evidence exists.

The process ledger plus session scan qualifies observed descendant reparenting;
it does not prove detection of a helper that changes sessions before its first
observation. That case must remain explicit in the ownership qualification; no
complete descendant-coverage claim has been made. The NSDate/kernel birth
comparison, real passive workbench/modal predicate, actual graceful shutdown,
regular-window coexistence, real timeout/interruption recovery and complete
process inventory remain unqualified. Profile-conflict inspection currently
covers registered `com.microsoft.VSCode` applications, not arbitrary unregistered
launchers or other product variants. None of these limitations establishes a
passing P1-03 result. Production integration and dependency promotion remain gated.


## First host attempt — 2026-10-21; qualification stopped

The developer explicitly reserved the desktop and `profiles/m1-00` and instructed
execution to proceed. Before launching, a focused TDD regression failed because
regular-window comparisons were absent. The probe now takes bounded read-only
snapshots before spawn and after confirmed exit: process birth identity, window
count/geometry/minimized state, and per-attempt salted title fingerprints stay
in memory. Only window count and the equality result are eligible for saved
qualification facts. No regular application Accessibility settings are changed.
All 31 focused tests passed in 2.58 seconds after this addition. Native process
snapshot/exited branches were also corrected to avoid importing GUI frameworks.

An ignored reviewed config `.ide-smoke/m1-04/harness.normal.yaml` selects the
Info.plist native `Contents/MacOS/Code`, persistent `profiles/m1-00`, a 30-second
startup deadline and **retain_on_failure: true**. The retained workspace policy is
deliberate while descendant completeness remains unqualified. A narrow independent
baseline recorded the marker digest and root/fixed-child identities/types without
reading credentials, settings or conversations.

Actual host command, approved outside the sandbox:

```text
.venv/bin/python scripts/spikes/m1_04/qualify_lifecycle.py --host --config .ide-smoke/m1-04/harness.normal.yaml
```

Local ignored evidence:

- `reports/2cee7a67a59f42458b8476a8374da892/summary.json`
- `reports/2cee7a67a59f42458b8476a8374da892/events.jsonl`
- `reports/2cee7a67a59f42458b8476a8374da892/workspace.json`
- `reports/2cee7a67a59f42458b8476a8374da892/qualification.json`
- `.ide-smoke/m1-04/profile-before.json` and `normal-result.json`

Observed result: exit **4**; probe-local reason `ownership_uncertain`, duration
**0.557689291 seconds**. T01 is HARNESS ERROR (`unexpected_exception` in the
unchanged foundation schema), duration **0.560010500 seconds**; T02–T05 are skipped.
The lifecycle recorded `launch_owned` but not `workbench_ready` or
`shutdown_confirmed`. Cleanup was separately HARNESS ERROR, duration
**0.167394750 seconds**. The single original-owner recovery attempt returned
`shutdown_unconfirmed`. The workspace is retained and the authenticated profile
was not removed or edited by the probe. Independent marker digest and
root/fixed-child metadata comparisons match the baseline; these checks do not
establish whole-profile byte integrity or authentication validity.

After recovery failed, all further GUI actions, fixes and host launches stopped.
A separately approved read-only inspection found the exact owned process still
live, matching the recorded kernel birth and selected executable, registered with
AppKit and not terminated. `NSRunningApplication.launchDate()` was **None**. This
violates a mandatory current ownership predicate and is a concrete qualification
finding; the generic first-attempt result does not isolate every startup-stage
condition. Do not weaken checks or infer a product failure from this result.
No app-specific terminate action can pass that predicate when the launch date is
unavailable. Native registration/readiness timing also remains unqualified.

The original controller has exited after its failed recovery. A later invocation
must not adopt the remaining process using saved diagnostics. Exact resource
identification for manual recovery is retained locally: **PID 911**, kernel birth
**1792619559:850504**, native VS Code `Contents/MacOS/Code`, workspace
`workspaces/2cee7a67a59f42458b8476a8374da892-8300209b717f458eba6a428e380d35fb`.
The developer was asked to quit only that test instance using its normal Quit
command, leaving the regular instance alone. Manual shutdown confirmation is
pending. No forced termination, process-group kill, profile deletion or ownership
broadening was performed. Recovery status must be resolved before another launch.

Coexistence comparison is **incomplete** because the exit/post-snapshot point was
not reached. No unchanged-unrelated-window result is claimed. Controlled timeout,
shutdown refusal, real interruption, synthetic-profile qualification and the other
remaining P1-03 checks have not been run on VS Code. P1-03, P1-04 and P1-VALIDATION
remain unchecked; Phase 1 is not complete and Phase 2 is not authorized.

Next work requires developer guidance under the plan's failed-recovery stop:
resolve the remaining owned process manually, then review an ownership/cleanup
predicate that can use qualified kernel birth plus exact executable/arguments and
controller lineage when AppKit launchDate is unavailable. Bounded registration
polling must be distinguished from fatal identity mismatch. This is a proposed
revision, not permission to change the checks or rerun the IDE now.


Manual recovery follow-up — 2026-10-21: the developer reported quitting the test
instance. Read-only verification found its original kernel birth/PID still live,
with the exact expected native executable and workspace argument. AppKit reports
**zero windows** and `isTerminated == false`: the window is closed but the test
application has not exited. The run guard was successfully reacquired and
released. The developer was asked to use Activity Monitor's normal **Quit** for
exact PID 911, without Force Quit or touching other VS Code processes. Actual
process exit remains unverified. GUI automation is stopped and normal desktop
use is released; no further automatic cleanup or code fix was attempted.

Final regression after the pre-launch coexistence addition:
`.venv/bin/python -m pytest -q` returned **398 passed in 5.02s**.
Relative documentation links and whitespace checks passed. This non-GUI result
does not change the failed host qualification or unresolved manual process exit.


Manual recovery resolved — 2026-10-21: developer reported PID 911 exited.
Independent approved read-only kernel-birth inspection confirms the original
process has exited; the run guard was reacquired and released. The narrow profile
marker/layout baseline still matches, and the failed run's workspace remains
retained. There is no remaining live original test instance. GUI automation is
stopped and the desktop is released. P1-03/P1-04 remain incomplete; manual recovery
does not turn the failed launch/readiness/cleanup check into a pass.

Proposed next correction, pending developer guidance: use exact kernel birth,
selected executable/argv, and controller-child/session association as mandatory
ownership evidence, revalidated immediately before native mutation. Treat missing
AppKit launchDate as unavailable corroborating metadata rather than sufficient
cause to abandon cleanup; if present, check its consistency. Handle application
registration still pending as bounded startup progress under the original deadline,
while retaining hard rejection for an actual identity mismatch. Add focused
red-green cases before changing the probe, then qualify the revised mechanism
only under renewed desktop/profile reservation. No fix or host rerun has begun.


## Authorized ownership correction — 2026-10-21

After original process exit and guard release were verified, the developer
answered “yes” to implementing/testing the proposed ownership correction. This
supersedes the failed-recovery hold for this correction only. Desktop use remains
released; no new host launch has occurred and renewed reservation is required.

The probe now requires kernel birth, exact executable/argv, and live controller
parent/session association immediately before every mutation. Missing AppKit
launchDate is accepted as unavailable corroborating metadata; an available date
must be finite and agree with kernel birth. AppKit application registration
absence is explicitly nonready and permits no AX mutation or shutdown action.
It does not bypass the mandatory process checks. Registration polling during
readiness shares the original startup deadline. During cleanup, a strictly typed
internal termination-pending reply causes another bounded inspection/request
under the same cleanup deadline; once registered, only one actual graceful
termination is sent. Persistent absence refuses cleanup and retains resources.
There is no forced-termination fallback or fresh deadline on retries.

TDD observations through the existing process/AX seam:

- Added missing-launchDate cases first: **2 failed, 2 passed** on the native
  synthetic observer/shutdown subset. After the minimal optional-date correction,
  **4 passed**. All children were test-owned synthetic Python processes.
- Expanded identity/date negative cases: mismatching date, kernel birth, argv,
  executable, controller parent and session were refused without mutation.
  NaN dates exposed **2 failures**; explicit finite-value validation made all
  **18 cases pass**. No foreign process or window was touched.
- Added absent-registration cases first: **2 failed** because absence was treated
  as a fatal ownership error. Explicit nonready/pending replies then produced
  **20 passing native observer cases**, with no mutation while unregistered.
- Added delayed cleanup-registration and permanent-absence scenarios through a
  synthetic worker. The delayed-registration scenario failed first, then passed
  after strict pending-response validation and bounded termination-request polling.
  The permanent-absence case confirms cleanup refusal within its 0.3-second test
  budget plus bounded scheduling overhead, without reporting successful shutdown.
- Focused suite: `.venv/bin/python -m pytest -q tests/unit/test_m1_04_qualification.py`
  returned **51 passed in 6.46s**. A read-only subagent review found no concrete
  safety regression and confirmed the mandatory ownership predicates remain intact.
- Full suite: `.venv/bin/python -m pytest -q` returned **418 passed in 14.31s**.
  `git diff --check` passed. No dependency, production source or profile/settings
  changes occurred.

The original failed host result remains failed, and its workspace remains
retained. These non-GUI corrections do not establish real VS Code readiness,
shutdown/recovery, descendant completeness or coexistence. P1-03/P1-04 and the
Phase 1 validation gate remain incomplete. Renewed desktop/profile reservation
has been requested before another host attempt.


## Normal host qualification after passive-readiness corrections — 2026-10-21

The developer renewed desktop/profile reservation and later resumed the remaining
Phase 1 work. Normal launch/readiness/owned shutdown now pass, without persistent
settings changes, key input, editor operations, Copilot requests or forced kills.

The first corrected run (`46e8770b38754412b401d0afafe2e676`) established safe
shutdown and unchanged unrelated-window comparison, but readiness still failed.
An allowlisted failure-stage diagnostic identified window association
(`4574d8de792a40ec81a617ea16cf0059`). Boolean-only title facts then established
that the first owned window still had a generic loading title
(`2dee85409e39497eb718d55a1cc9e1bd`). A focused red-green correction makes known
generic loading titles explicitly nonready, under the existing startup deadline;
wrong workspace titles and ambiguous candidates remain rejected. No raw titles
were recorded.

The resulting 30-second observation run (`013925741294469589c3692b121b7e8d`)
reached the correct workspace but timed out without the required structural
roles. A five-second diagnostic (`63135db878b542c3af90beac2153311d`) confirmed only
boolean absence of AXWebArea/AXOutline/AXToolbar/AXTabGroup. Both runs closed the
owned instance successfully and recorded one unrelated window unchanged.

A read-only subagent checked the installed Electron Framework Info.plist:
**Electron 42.8.1**. Its [version-pinned source](https://github.com/electron/electron/blob/v42.8.1/shell/browser/mac/electron_application.mm#L300-L332)
restarts a two-second delayed activation whenever AXManualAccessibility is set
true. The probe was setting it on every observation, preventing activation.
Worker lifetime alone was not established as the cause. A red test modeled
asynchronous activation: repeated sets kept the synthetic tree unavailable.
The minimum correction acknowledges one successful temporary enable request per
owned session; subsequent observations do not reset it. Native call timeouts
still abort rather than blindly retry an uncertain enable. No sleep workaround,
persistent observer, setting change or weaker readiness predicate was added.
Both delayed-tree cases then passed, followed by all **58 focused tests in 7.68s**.
Allowlisted failure stages and role/title booleans are separate provisional
qualification facts, not arbitrary native payloads or production reporter changes.

Actual successful normal command:

```text
.venv/bin/python scripts/spikes/m1_04/qualify_lifecycle.py --host --config .ide-smoke/m1-04/harness.normal.yaml
```

Successful report: `reports/9349e2fc4b2a4df1a8015fd9aea62aa1/`.
Probe readiness duration: **2.833040667 seconds**. Exact owned workspace association
and AXWebArea/AXOutline/AXToolbar/AXTabGroup were observed; T01 PASS, T02–T05 SKIP,
and expected incomplete-suite exit 4. Owned shutdown was confirmed before
finalization; cleanup PASS, one unrelated window unchanged. Recovery was
unnecessary. Retention was enabled during investigation, so the workspace remains
for inspection; no workspace/profile deletion is claimed. All earlier attempts
remain failed evidence, never replaced by this passing result. Local controlled
comparison data is summarized in `.ide-smoke/m1-04/normal-attempts.json`.

Conservatively counting readiness-correction rounds: the optional-date correction
left a separate window-association failure; the generic-title correction then
exposed the structural timeout; the one-time temporary-exposure correction passed.
Diagnostic-only runs did not change behavior. No fourth unsuccessful fix round
was reached. GUI work was stopped/released during the developer's status questions;
the developer subsequently resumed work and renewed reservation for failure checks.
P1-03/P1-04 remain incomplete pending those checks and unresolved complete
lifecycle accounting; normal T01 success alone does not complete Phase 1.


## Controlled host checks — 2026-10-21; stopped at recovery failure

The developer resumed work and explicitly reserved the desktop/profile again.
A subagent implemented nine private controlled-backend scenarios through the
existing injected backend seam. Red-green checks began with a missing factory,
then added each observation/control slice; all 9 focused control tests passed.
A further red test required saved scenario labeling before implementation, so
synthetic readiness/failures cannot be confused with natural product behavior.
No public fault switches or production source changes were introduced.

Each host attempt below used a fresh exclusively created marked profile beneath
`profiles/m1-04-<scenario>-<random>/`, real guard/admission/workspace creation,
and the selected native VS Code executable. No authenticated data was copied,
no Copilot sign-in was performed, and no profile was adopted/repaired. Synthetic
profile sentinels were independent of the workspace; an additional outside
sentinel was used for the interruption/recovery checks. Profiles and workspaces
remain retained as local ignored evidence, including after confirmed shutdown.
No synthetic profile deletion was attempted. Persistent `profiles/m1-00` was
not used for these fault injections; its marker/layout baseline still matches.

Actual host entry was an approved inline `.venv/bin/python` driver importing
only the qualification script with `runpy.run_path`, then calling `run_probe`
with `make_controlled_backend(...)` and `recover_probe(...)`. The driver recorded
`controlled-host.json` beside each standard report and appended an index to
`.ide-smoke/m1-04/controlled-host-results.jsonl`. All native actions remained in
the proposed qualification script. No additional implementation file was added.

| Controlled scenario | Report directory beneath reports/ | Observed result |
| --- | --- | --- |
| Withheld readiness | af9f44c9278743319b236b5b545c8af5 | `readiness_timeout` at 1.504574s for 1.5s deadline; cleanup PASS; original owned shutdown confirmed. |
| Stalled observation worker | e639ace2bd9b4f299392abe22394fa76 | Actual inert worker slept; controller bounded it at 0.25s; startup total 0.640784s; `native_timeout`; worker command restored and actual owned cleanup PASS. |
| Simulated pre-spawn failure | aef4b9b49e0e4b8389b4c4ae2bdc9c8a | `launch_failed`, no IDE spawn; cleanup PASS. |
| Deliberate actual early exit | 8c177a3d37cc4d7792329217c72760a1 | Original backend gracefully closed the owned app before the logical readiness assertion; `early_exit` at 0.911687s; later idempotent cleanup PASS. |
| Interrupt after owned spawn | b11371f188e349a68329acb4d7aecc8e | Probe-local `interrupted` at 0.387806s; exit 130; actual owned cleanup PASS; all dependent tests skipped; profile/outside sentinels unchanged. |
| One-shot shutdown refusal | 56559c5d56fa465aac61777c9f3afe12 | Synthetic T01 PASS at 0.393638s; first close deliberately suppressed; separate cleanup HARNESS ERROR and exit 4; original result and workspace/profile preserved. Recovery was NOT confirmed. |

All completed non-refusal launches recorded one unrelated window unchanged by
birth/count/geometry/transient salted-title comparison. The no-spawn case has
no coexistence result; the refusal run did not reach its post-shutdown comparison.
All control results are qualification observations, not a passing GUI suite.

The first early-exit setup quit too early during fresh-profile startup and
produced `launch_failed` (`210b069cc565438cb74d5f319b3c4cf7`). A first proposed
correction attempted passive AX observation and failed at AX exposure
(`99c1ee27a01c470e850cc230b9167ecc`); the second avoided exposure but still
encountered AX attribute failure (`93bf2f3b137245ef845314c478e2c7f5`). Each actual
instance was safely cleaned up and each failed attempt remains recorded. The
third correction polls native `NSRunningApplication.isFinishedLaunching()`
without AX operations before the intentional quit. The getter is declared in
the installed SDK's NSRunningApplication.h; the new red test requires this
native-only bounded path with the same startup deadline. That correction passed
both tests and actual host qualification. No fourth unsuccessful fix round occurred.
This corrects the injected early-exit setup, not a failed normal T01 assertion.

The interruption evidence retains the developer-accepted Phase 1 limitation:
probe facts contain the interrupted reason/duration, but unchanged production
summary T01 remains SKIP with null duration. Correct integrated T01 reporting
remains required in Phase 2; these artifacts do not manufacture a passing result.

### Refusal recovery result and stop

The refusal scenario supplied an explicitly synthetic ready observation; no
real workbench readiness claim is made for that run. Its first close refused
before any underlying termination. `recover_probe` then reacquired the guard and
used the original owner, but returned `shutdown_unconfirmed` within total run
**0.614584s**. Original T01 PASS, cleanup HARNESS ERROR and retained disposition
remain unchanged. This qualifies result preservation/retention, not safe recovery.

Q11/P1-03 required stopping at that failure. All further GUI actions, fixes and
launches stopped. A separately approved read-only inspection found original
**PID 30927**, kernel birth **1792621392:850829**, already absent. Further bounded
read-only inspection found no surviving process in its current session, and
reacquiring/releasing the run guard succeeded. Profile, workspace and sentinels
remain intact. No manual quit is needed. The cause/timing of the later process
exit is unqualified; it does not prove graceful recovery succeeded. See
`reports/56559c5d56fa465aac61777c9f3afe12/post-recovery-readonly.json`.

The read-only review found several possible rapid-failure paths: mandatory
identity rejection, app.terminate returning false, or exit racing token inspection.
Cleanup currently collapses them into the same controlled refusal. The synthetic
ready observation reaches recovery earlier than the native finished-launch gate
used by the corrected early-exit control. Startup timing is a plausible contributor,
not an established cause. Proposed next work, requiring developer guidance:
record only fixed cleanup-stage categories, qualify exit-during-inspection races,
and defer termination while the positively owned native app is still launching,
without extending the original cleanup deadline or weakening identity checks.
No such correction has been implemented after this stop.

Remaining P1-03 host checks: successful refusal recovery, occupied-profile
owner/challenger refusal, wrong-workspace and ambiguous candidate injections,
and obstruction injections. Corresponding non-GUI cases exist, but no host pass
is claimed. The original normal ready/cleanup/coexistence success remains valid.

## Historical P1-04 findings before the later scope revisions

The qualified import graph currently requires two direct macOS-only frameworks:
Cocoa and ApplicationServices 12.2.2. Their declared dependencies require
pyobjc-core, Quartz and CoreText 12.2.2 as well; all five installed distributions
report cp312-cp312-macosx_10_13_universal2 wheels. Existing M1-00 evidence records
wheel-only PyPI installation; installed direct_url metadata is absent, so exact
artifact URLs/hashes cannot be reconstructed from installed metadata alone.
No dependency promotion, installation or lockfile edit occurred. Phase 2 would
need two direct platform-marked dependencies and lock/qualify all five transitives.

Full descendant accounting is not established by current session scans plus
observed PID/birth ledger: an unseen helper can reparent and change sessions;
an already disappeared intermediate process can remove an unobserved ancestry
edge. Repeated empty scans cannot prove complete ancestry. A source audit of
Apple's [process structure](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_internal.h)
and [private process-info contract](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info_private.h)
found parent unique IDs as a possible partial improvement, but these APIs have
not been qualified on this host, missing intermediate ancestors remain a gap,
and exec behavior needs separate qualification. Installed headers explicitly
mark kqueue fork-following flags unsupported since macOS 10.5. None of these
candidates grants cleanup authority or closes Q7. Resolving/reviewing this
limitation is required before freezing production decisions or removing resources
under a claim of complete lifecycle exit. Retention remains conservative.

P1-03, P1-04 and P1-VALIDATION remain unchecked. Phase 1 is incomplete and Phase 2
remains unauthorized. Final regression after the controlled native-state test:

```text
.venv/bin/python -m pytest -q
435 passed in 10.17s
```

No production source/dependency changes or forced IDE termination were added.
GUI automation is stopped and the desktop is released.


## Developer scope revision — recovery deferred, 2026-10-21

The developer explicitly accepted skipping the failed automatic recovery scenario
and requested marking it out of scope for now and as a possible future topic.
The [plan](../implementation-plans/M1-04.md) now defers further deliberately
suppressed-shutdown host scenarios and automatic recovery qualification in both
phases. The recorded refusal/recovery attempt remains failed evidence. This
revision does not turn it into a pass, delete its artifacts, or establish a cause
for the later process exit. Experimental spike recovery code remains unqualified;
no supported production recovery capability is claimed.

Future investigation topic: distinguish startup-related termination refusal,
actual refusal and exit-during-inspection races using fixed cleanup-stage
categories, then determine whether bounded recovery through the original owner
can be qualified. Revisiting that topic requires separate authorization.

Current requirements still include normal bounded owned shutdown, separate
cleanup-error/nonzero reporting, preserving individual results and resources on
uncertainty, and exact local diagnostics for manual inspection. Inert cleanup
failure/all-pass-plus-cleanup-error tests remain required. Neither forced
termination nor stale-process adoption is authorized.

Remaining Phase 1 work is independent of the deferred scenario: occupied-profile
owner/challenger refusal; wrong-workspace/ambiguous candidates; obstruction host
qualification; complete descendant accounting or an explicit reviewed change to
that safety requirement; final qualified design/dependency decisions and Phase 2
task refinement; and developer validation. Phase 2 production integration has not
started. No runtime change or GUI check was made for this documentation revision.
Historical stopping statements above describe the scope in force at that time;
they are superseded only for the now-deferred automatic recovery requirement.

## Resumed Phase 1 — 2026-10-21; intermediate status

The developer resumed with TDD/subagents and renewed desktop/profile reservation.
The [latest plan entry](../implementation-plans/M1-04.md#resumption-status--2026-10-21)
records the current findings, outstanding checks and interrupted pending attempt.
Automatic recovery was not executed in this resumption.

Wrong-workspace (`aeac992e94444ef88b004c3a819da19b`, 0.575946s), ambiguous
candidate (`6ec1fe20c89b48e98abf21a3e8b17c88`, 0.557984s), and modal
(`f47ccc10412a4355bb025aac9f16572f`, 0.571635s) injected observations produced
the expected reasons. All three recorded actual original main-process exit,
cleanup PASS under current observed-process accounting, retained workspaces,
unchanged one unrelated window, profile/outside sentinels and narrow persistent
profile metadata. No real foreign window or dialog was manipulated. Complete
descendant accounting remains unqualified; these cleanup labels do not close Q7.

Occupied-profile attempts are not a pass. Runs
`71a265c6d1d64842a03ea6efdc325486` and
`ac84d75c63fc4e7eb8398c07251c07e7` reached a forbidden-spawn sentinel, which
prevented any challenger launch. An initial interpretation as a live conflict
miss was premature. Diagnostic run `ca623a2788fb4ebcbcd0d3192d0e30a7` established
the original process was in native enumeration but exited by the sentinel;
untraced `0b48e4e517e54b07b9daa7ad91c6bc3e` confirmed exit at the sentinel.
The first overly broad diagnostic trace itself timed out
(`bfbc8a7003bc4d37af2dde5cd743db73`); narrowed tracing completed. Requiring actual
workbench readiness then produced early exit before any challenger
(`30647fd6362a4208875d25f1cf854d71`). Every completed attempt retained resources,
reported original main-process exit, preserved sentinels and unchanged regular
window, and reacquired the guard. No recovery retry occurred.

Installed `Contents/Resources/app/out/main.js`, functions `UC`/`nF`, builds the
Darwin IPC socket inside user-data using a version/kind suffix and warns at 103
characters. Local SDK `sys/un.h` declares `sun_path[104]`. Long synthetic
user-data paths measured 110 bytes; the persistent profile measured 60. A shorter
fixture is the next experiment. The source and measurements support a likely
path-length explanation, not a confirmed causal diagnosis. No completed
short-path result exists at this status checkpoint.

Host entry automatic recovery was removed through three red-green entry tests.
Same-user selected-executable preflight inspection was added through three
red-green native synthetic-process cases with an empty application registry
(exact, alias and uncertain relative profile arguments). Registered alternate
installations remain inspected; unregistered alternate installations remain a
limitation. A read-only subagent review found no concrete safety regression.
Focused qualification suite: **74 passed in 8.43s**. The developer subsequently
requested the full suite. `.venv/bin/python -m pytest -q` completed with
**441 passed in 10.47s**, exit 0. No GUI was launched by that check. No production
or dependency changes were made. Passing non-GUI tests does not complete the
remaining host qualification or Q7 safety requirement.

Raw local index: `.ide-smoke/m1-04/resume-negative-results.jsonl`; controlled
driver: `.ide-smoke/m1-04/resume-negative-host.py`. Per-run
`resume-negative-host.json` records fixed facts. The shortened-path attempt was
interrupted before a recorded result; inspect current state before launching
again. P1-03/P1-04/P1-VALIDATION remain unchecked. The current requirements still
cannot be completed without qualifying/reviewing the independent Q7 gap.

## GUI batch completed — 2026-10-21

At the developer's request, eight controlled GUI qualification cases were run
sequentially on short explicitly marked unauthenticated synthetic profiles and
fresh manager-created workspaces, followed by a normal persistent-profile T01
probe. All nine produced their expected outcomes. The [plan's batch table](../implementation-plans/M1-04.md#developer-requested-gui-batch--2026-10-21)
lists exact run IDs, timings, reasons, command and disposition. The preliminary
short-profile occupied run also succeeded
(`a95fcce1d89a4f18b02c09e810d2a0d8`); final occupied run
`95f5c73bb7dd4c7fa6d689ae21d94d7b` additionally proves original birth/executable/
argv identity and liveness after the rejected challenge, with zero challenger
spawn attempts. Its owner reached the actual workbench before challenge.

All eight controlled cases recorded normal original-owner cleanup under the
current observed-process accounting, main-process reap, one unchanged unrelated
window, preserved independent synthetic/outside sentinels and narrow persistent
profile metadata, guard reacquisition and retained resources. Timeout withheld
readiness; stalled observation used a genuinely sleeping isolated Python worker;
wrong-workspace/ambiguous/modal observations were synthetic and did not manipulate
foreign windows/dialogs. The native application finished launching before those
controls. Deliberate early exit used actual app-specific graceful shutdown;
interruption occurred after owned native launch and before logical readiness.
No forced kill, credential copy, settings change, suppressed shutdown or automatic
recovery was performed.

Normal run `921e198f8f404c6d865869893cd75a89` used the admitted persistent profile
and recorded actual ready structure in 2.893551s; saved T01 duration is 2.896723s.
T01 PASS, dependent T02–T05 SKIP and exit 4 are the expected incomplete-suite
result. Normal cleanup and unchanged regular-window comparison passed. Final
read-only inspection found no selected-executable instance using a checkout test
profile, matched narrow persistent-profile baseline and reacquired/released the
guard. Fixed facts are in ignored
`.ide-smoke/m1-04/gui-batch-final-check.json`; controlled rows are appended to
`resume-negative-results.jsonl`, with per-run `resume-negative-host.json`.

Short paths now provide a stable live occupied-owner fixture. Retain prior
long-path attempts with their limitation; this does not prove the cause of each
earlier early exit, or repair/reclassify deferred recovery evidence. All retained
profiles/workspaces remain intact. No probe/unit implementation changed after
the full **441 passed in 10.47s** result; this batch changed the ignored host
driver and documentation only. No further non-GUI regression was needed for that.

Q7 remains unresolved: current session scans plus observed birth identities can
miss unseen detached descendants. Current cleanup PASS labels are bounded
observations, not complete ancestry proof or authority to delete retained
resources. P1-03, P1-04 and P1-VALIDATION remain incomplete; production integration
and dependency changes have not started. GUI automation is stopped and the
desktop reservation is released.


## Developer deferral — unseen detached-child safety, 2026-10-21

The developer stated: “I'm willing to defer this child safety issue to later
work. record this as deferred.” Investigation and qualification of unseen
children that detach before observation are now deferred future work. The
[plan](../implementation-plans/M1-04.md) updates Q7, active scope, task wording and
acceptance mapping accordingly. This is a scope decision, not proof that such
children exit or a passing completeness result. Automatic recovery remains a
separate deferred topic.

Current observed shutdown covers the original main application, current session
members and previously observed birth identities, including observed reparenting.
Detected ownership/exit uncertainty still requires cleanup error and retention;
there is no new termination authority or permission to delete currently retained
resources. P1-04 must explicitly settle and document production workspace
retention/disposition within the accepted limitation before Phase 2 begins.

P1-03 can now be marked implementation verified under the revised scope using
the existing nine-case GUI evidence and 441 passing non-GUI tests. P1-04 remains
incomplete: consolidate/finalize the qualified design, proposed production
changes/dependencies, limitations/retention policy and refined Phase 2 tasks.
P1-VALIDATION remains unchecked and Phase 2 is unauthorized. No runtime code,
dependency, evidence artifact or GUI state was changed by this documentation
revision. Earlier Q7-blocking statements are historical and superseded for the
now-deferred issue only.


## Final P1-04 specification and Phase 1 checkpoint — 2026-10-21

P1-04 writing is complete. The canonical [final specification](../implementation-plans/M1-04.md#final-p1-04-implementation-specification--2026-10-21)
and [refined Phase 2 tasks](../implementation-plans/M1-04.md#phase-2--implement-and-integrate-t01)
replace earlier provisional production decisions. P1-01–P1-04 are checked;
P1-VALIDATION and every Phase 2 item remain unchecked. This is **implementation
verified; developer validation pending**, not developer acceptance or production
implementation.

| Final decision | Specification/result |
| --- | --- |
| Public lifecycle | IDE protocol with get_version/launch/wait_ready receiving one absolute monotonic startup deadline, close using its independent budget, and monotonic requires_workspace_retention property. |
| Ownership | Native selected executable, exact argv/profile/workspace, kernel birth, controller parent and session, with before-mutation revalidation; optional consistent launchDate. No saved-artifact authority or broader kill targets. |
| Passive readiness | One owned exact-basename title component combined with full process workspace argument; exhaustive <=600-node traversal, AXWebArea/AXOutline/AXToolbar, no modal/unknown dialog, acknowledged AXManualAccessibility once. |
| Bounds | Worker <=3s clipped to remaining deadline, requested AX messaging timeout 0.2s, pause <=0.05s between observations, independent cleanup 10s. Controller process creation is not interruptibly bounded; no hard real-time launch guarantee. |
| Version and path | Read selected Info.plist CFBundleShortVersionString in a bounded production metadata worker. Validate version and complete Darwin IPC path byte length including suffix; >=103 bytes is a controlled unsupported-path prerequisite. These production checks still need Phase 2 TDD. |
| Retention | Once session.launch is entered, always retain its GUI workspace even with configured retain_on_failure:false; keep truthful config, existing stronger retention reasons and genuine cleanup failures. Otherwise use retained/gui_exit_scope_limited. No fabricated error or result change; existing non-GUI behavior remains. |
| Results and interruption | Exact new Reason members/codes fixed in the specification; T01 elapsed duration on every result, including interrupted ERROR, dependent SKIP origins, existing cleanup/evidence exit4 priority over interrupt130. T01 PASS alone leaves suite exit4. |
| Production integration | Exact file/symbol map specifies controller, native backend/worker, lazy default T01 builder, context session/version, private inert factory, result/CLI updates and tests. Existing Reporter schema and WorkspaceManager require no changes. |
| Dependencies | Two direct macOS framework pins 12.2.2; three transitive macOS constraints keep the five-distribution graph at 12.2.2. Phase 2 updates pyproject/uv.lock and qualifies wheel-only preservation/clean environments. No installation occurred here. |
| Accepted limits | Automatic recovery and unseen detached-child completeness deferred. Unregistered alternate installations not comprehensively detected; exclusive reservation remains required. No full ancestry, authentication or editor usability claim. |

Writing verification re-read selected application Info.plist using plistlib:
CFBundleIdentifier=com.microsoft.VSCode, CFBundleExecutable=Code,
CFBundleShortVersionString=1.135.0 and CFBundleVersion=1.135.0. A subsequent product.json read observed matching
version 1.135.0; the production IPC path uses that product version and the metadata
worker will require bundle/product agreement. This is a metadata
observation, not execution of the proposed production getter. Installed
importlib.metadata confirms Cocoa requires core, and ApplicationServices requires
core/Cocoa/Quartz/CoreText; all five versions are 12.2.2. Existing installed wheel
tags and historical wheel-only PyPI evidence remain the provenance; original
artifact URLs/hashes cannot be reconstructed from absent direct_url metadata.
Production resolution must record its own exact artifacts and compatible wheels.
The private backend version method is explicit, and invalid/throwing retention
state must fail closed without escaping finalization; both are Phase 2 test cases.

Two read-only subagents reviewed native and orchestration boundaries. The final
wording preserves these distinctions: AXTabGroup is diagnostic; the full workspace
path is established by process argv rather than AX title; requested AX timeout
is protected by the outer worker; a 50ms pause is not a fixed observation cadence;
600 nodes require queue exhaustion; spawn retention begins before entering backend
startup and survives interruption; retention is not cleanup ERROR. The chosen
unconditional GUI-retention policy is included for review at the Phase 1 gate.

No runtime source/tests, dependencies, lockfile, profile, workspace, GUI or Git
commit changed during this documentation finalization. Latest executed runtime
checks remain **441 non-GUI tests passed in 10.47s** and nine expected GUI outcomes,
with normal T01 ready in 2.893551s and saved duration 2.896723s. Historical failures
and both deferred topics remain preserved; no extra runtime rerun is claimed.

Documentation validation passed: 32 local Markdown targets/anchors; all 11
unique task/gate items with P1-01–P1-04 checked, validation and Phase 2 unchecked;
balanced code fences; direct trailing-whitespace checks for both files; retention/
gate consistency review; and `git diff --check`. GUI automation is stopped, desktop reservation is released,
and detailed evidence remains ignored/local. The current working files are
uncommitted. Stop here for explicit Phase 1 validation; Phase 2 execution and any
later story require their separate authorization.


## Developer validation — Phase 1 accepted, 2026-10-21

The developer stated: “i validate phase 1. do not start phase 2 yet”. Phase 1 is
complete and developer validated, including P1-04's final specification and
refined Phase 2 plan under the recorded scope. P1-VALIDATION is checked in the
[plan](../implementation-plans/M1-04.md). Earlier pending-validation statements
are historical and superseded by this decision.

The accepted evidence remains 441 passing non-GUI tests and nine expected GUI
outcomes, including normal readiness in 2.89s. Automatic recovery and unseen
detached-child completeness remain deferred future work, with conservative GUI
workspace retention specified for Phase 2. Neither deferral is a qualification
claim or permission to delete current retained resources.

Phase 2 remains explicitly **unstarted and unauthorized**. No implementation,
installation, GUI work, later-story work or commit followed this validation.
Resume only after separate execution authorization; preserve existing working
files, profiles/workspaces and ignored local evidence.
