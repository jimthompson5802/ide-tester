# M1-02 Phase 1 — profile qualification verified, 2026-10-21

> **Current scope — 2026-10-21:** The developer subsequently limited M1-02 to
> profile safety only. The [revised plan](../implementation-plans/M1-02.md)
> supersedes the broader remaining-work requirements below. Executable, session,
> permissions, settings, Copilot, authentication, and readiness-dependency
> qualification are out of scope. This report preserves historical observations;
> profile-safety qualification is verified and Phase 1 was developer validated on 2026-10-21.
> The scope revision itself supplied no runtime evidence. The later
> [profile-only resumption](#profile-only-qualification--resumed-2026-10-21)
> records new qualification, including the developer-accepted checkout policy.


Execution was authorized by the developer's instruction to implement the
[M1-02 plan](../implementation-plans/M1-02.md). Phase 2 has not started. The initial
unlocked-state qualification gap caused a stop for review. The developer has
since accepted a limited prerequisite snapshot with screen-lock state unassessed;
see the [accepted limitation and risks](../implementation-plans/M1-02.md#accepted-limitation-and-risks--2026-10-21).
Phase 1 qualification is complete and developer validated on 2026-10-21. No
production code, dependencies, configuration, profile, or OS permissions changed.
The pending M1-01 PATH-fix developer validation remains pending.

## Profile-only qualification — resumed 2026-10-21

The developer requested continuation of Phase 1 and subsequently accepted the
recommended checkout rule. **P1-01, P1-04, and P1-05 are complete and verified;
Phase 1 was developer validated on 2026-10-21.** Production code, dependencies, configuration, real profile,
and OS permissions remain unchanged. Phase 2 has not started. The pending M1-01
PATH-fix developer validation is unchanged.

Created `scripts/spikes/m1_02/profile_safety.py` and
`tests/unit/test_m1_02_profile_safety.py`. The pre-agreed seam is the plan's
read-only `inspect_profile_safety` boundary with explicit protected context.
It reuses foundation `Outcome` labels and returns allowlisted spike findings;
production `Result`/`Reason` integration is deferred to Phase 2. The
[draft guide](../vscode-test-profile-setup.md#independently-qualified-path-rules)
records the exact independently qualified rules.

| Mechanism | Actual evidence |
| --- | --- |
| Dedicated layout; missing/wrong kinds; symlink roots/ancestors/children/marker | Synthetic regular, missing, dangling-link, loop, directory-marker, and FIFO-marker cases. |
| Marker contract and narrow reads | Valid exact marker passes; 13 malformed/type/version/duplicate/unknown/oversize cases plus invalid UTF-8 and a hardlinked marker block. No other content is read or enumerated. |
| Protected-path separation | Equality, ancestor/descendant overlap, resolved aliases, six explicit everyday defaults, and filesystem identity comparisons for macOS case aliases. Installation helper resolves a symlink into an enclosing `.app` without execution; nonbundle parent context is supported. |
| Children remain separate | Fixed sibling layout; repeated directory identity blocks, in addition to symlink rejection. |
| Uncertain inspection/privacy | Injected metadata, marker-open, descriptor-inspection, and resolution permission failures return controlled `HARNESS ERROR` findings without exception text. |
| Preservation | Synthetic sentinel file and root/child/marker metadata are unchanged; reads are limited to the marker and enumeration is forbidden. Host root/child metadata is unchanged. This does not inspect or verify authentication/content. |
| Checkout policy and adoption | **Developer accepted 2026-10-21.** Dedicated roots strictly below `<checkout>/profiles/` are allowed; every other checkout overlap is rejected. Thirteen added cases cover nested roots, outside roots, checkout/container/ancestor/source/prefix rejection, protection precedence, symlinks, and case aliases. Manual dedication/marker creation remains unperformed and is not required for Phase 1 contract qualification. |

TDD ran incrementally: the first test failed because the proposed spike module
did not exist, then passed after its initial implementation. New behavioral
groups failed before their matching path/marker implementations and passed after
them. Tests exposed both a protected-path case-alias bypass and a home-case-alias
bypass on this host; filesystem identity comparisons fixed each, and each focused
rerun passed. No error required four unsuccessful fix rounds.

After the developer accepted the checkout rule, eight new behavioral cases failed
with the missing `checkout` argument before implementation, then passed with the
new comparison. Five further qualification cases passed, demonstrating other
protections remain effective and symlinks/case aliases cannot bypass the rule.
Initial resumption results were 55 focused / 202 total passing tests. The final
results below supersede those counts.

Actual final commands/results:

```text
.venv/bin/python -m pytest tests/unit/test_m1_02_profile_safety.py -q
68 passed in 0.21s

.venv/bin/python -m pytest
215 passed in 1.29s
```

Before the host observation, the expected result was real directories, an absent
marker, unchanged narrow metadata, and successful guard release/reacquisition.
The inline `.venv/bin/python -` observation first failed acquiring the real
per-user lock in the sandbox; no guarded profile check ran. The identical command
then succeeded with approved host escalation. It held the real lock through
observation/evidence writing and released it in `finally`; reacquisition passed.
Python reports 3.12.15 arm64. Expected and actual spike finding agree:
`BLOCKED / profile_missing / marker`. The partial protected context includes the
six everyday defaults and the existing explicit installation path, with the
unresolved checkout comparison clearly excluded. This is **not a complete
profile-safety acceptance check**. No subprocess, GUI, settings, manifest,
credential, or authentication check ran.

After acceptance, the new host command ran with approved host lock access:

```bash
.venv/bin/python reports/m1-02/profile-policy-observe.py
```

It supplies the checkout context as well as everyday and installation paths. The
accepted rule admits the existing root's location; real root/children pass the
path/layout checks and the check reaches the expected missing-marker block.
Expected and actual findings again agree, root/child inode/size/mtime observations
are unchanged, and real guard release/reacquisition passes. No marker was created,
so this qualifies the actual path/layout and missing-marker handling, without
claiming successful real-profile dedication or authentication. The original
partial observation above is retained as historical evidence; the checkout rule
is included in this final observation.

Ignored local evidence:

- `reports/m1-02/profile-only-observation.json` — expected/actual finding and
  before/after allowlisted root/child/marker metadata; preservation comparison true.
- `reports/m1-02/profile-only-observe.py` — equivalent saved source of the inline
  observation, reproducible with the same host lock access.
- `reports/m1-02/profile-policy-observation.json` — final explicit-checkout
  observation; expected result and metadata preservation comparisons true.
- `reports/m1-02/profile-policy-observe.py` — final guarded observation source.

The draft guide now defines the full path/marker contract and manual adoption
procedure. The real missing marker is expected at this checkpoint: complete all
preceding path/layout checks, confirm deliberate dedication, manually create the
exact marker without overwriting existing files when authorized, then require a
full read-only pass. Accepting the checkout policy did not confirm dedication,
authorize marker creation, or accept Phase 1. No real profile was moved, copied,
recreated, or modified.

### Qualified Phase 2 contract and acceptance mapping

Phase 2 requires explicit Phase 1 developer validation and its own implementation
authorization. No unresolved safety-policy decision remains. The integration must:

- Receive explicit home, known protected locations, the actual editable-package
  source checkout (independent of caller/config directories), and installation
  context selected by existing foundation metadata-only executable lookup. Factor
  that lookup into an internal reusable helper if needed while preserving basic
  availability and first-wrong-kind/error behavior. Protect the enclosing resolved
  `.app` or executable parent, without runnability or identity checks.
- Keep the portable checker separate from macOS protected-location selection;
  preserve the accepted checkout subtree and every other path/marker rule.
- Run after strict configuration/basic resources under existing desktop exclusion;
  retain controlled production `Result` reasons, events, skips, cleanup,
  interruption, and evidence behavior. Known unsafe resources block (exit 3);
  uncertain inspection errors (exit 4). A safe profile still reaches unimplemented
  IDE operations (exit 4), with no smoke assertion pass claimed.
- Require deliberate manual dedication/adoption before the real-profile success
  check; the profile checker must not create markers or inspect account
  content. Use synthetic profiles for negative checks and preserve real contents.
- Add no readiness dependencies or workspace schema. When M1-03 adds workspace
  lifecycle, require mutual path separation using the same protected-context rule.

| Revised criterion | Phase 1 evidence | Remaining Phase 2 work |
| --- | --- | --- |
| Safe root/children and protected separation | Path/layout/identity/symlink tests; accepted checkout rule; final guarded host observation | Production checker/context and installed-console validation |
| Marker and in-place adoption | Strict marker cases; exact manual procedure; existing root satisfies path/layout checks with marker absent | Developer dedication, manual marker, successful real-profile check |
| Read-only inspection and controlled classification | Synthetic no-write/privacy/error cases; host metadata unchanged | Production reasons, guarded events/skips, interruption/evidence regression |
| Setup guide and saved validation evidence | Qualified draft guide; synthetic pass/block/error assertions; saved host missing-marker observation | Final guide, saved production successful/blocked observations, acceptance report |

The developer validated Phase 1 on 2026-10-21 and explicitly instructed: “Do not
start phase 2 yet. Commit the changes.” The Phase 1 checkpoint is complete;
Phase 2 remains unstarted. M1-02 story acceptance and Slice 1 validation are not
implied by this decision. Metadata
checks cannot establish arbitrary-content safety, guarantee authentication
preservation, eliminate races, or prove GUI readiness.

Documentation verification checked **87 relative links/anchors** across the plan,
report, guide, spike README, root README, AGENTS.md, and local stories with no
missing targets. Tracked diff and new Python-file whitespace checks passed. The
local story retains unchecked production acceptance criteria. No GitHub issue
was edited.

### Profile-only baseline — resumed 2026-10-21 (P1-01)

Before inspection, the expected observations were real directories at the existing
root and both fixed children, no symlink components, and a possibly absent marker.
Read-only `lstat` observations confirmed those directory kinds and no symlink
components from `/` through `profiles/m1-00`; the marker is absent. Python reports
3.12.15 arm64. `config/harness.local.yaml` is absent, so the historical M1-00 path
was an explicit investigation input, not a configured production path. No profile
contents, settings, manifests, credentials, or GUI/session state were inspected.

Source review found that `Config` provides only executable, profile root, and
timeouts. `check_resources` follows filesystem links and checks only regular-file/
directory availability; it has no dedication or separation policy. `run_attempt`
acquires the per-user lock before loading configuration and checking resources;
available resources still yield `operations_unimplemented`. Controlled `Result`,
`Outcome`, `Reason`, saved event/summary payloads, and dependency skips exist.
There is no disposable-workspace path configuration. The example selects
`~/.ide-smoke/profiles/vscode-test`, distinct from the historical root.

The broad `qualify.py` was reviewed but not executed: it includes now-excluded
settings, inventory, executable, and session probes. No new dependency is needed
for filesystem policy. Blanket checkout-overlap rejection conflicts with in-place
adoption of `profiles/m1-00`; developer selection was requested before implementing
that comparison. The later accepted decision and qualification above resolve it.
Marker and other independent rules were qualified against synthetic paths.
The earlier 147-test result
does not verify any revised profile-safety mechanism.

## Historical work and actual observations

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
