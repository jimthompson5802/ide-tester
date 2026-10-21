# M1-02 Phase 2 — Production profile safety

**Status — 2026-10-21:** Phase 2 complete and developer validated. The developer
explicitly stated: “I validate Phase 2 as complete”. P2-02 through P2-06 and
P2-VALIDATION are complete; M1-02 is accepted within its revised profile-safety
scope. Earlier pending-validation entries below preserve execution history.
M1-03 authorization and Slice 1 remain separate; no GUI readiness is established.

The developer authorized Phase 2 with “execute phase 2 in plan
docs/implementation-plans/M1-02.md”, superseding the earlier hold after validated
Phase 1. See the [plan](../implementation-plans/M1-02.md),
[Phase 1 contract](M1-02-phase1.md#qualified-phase-2-contract-and-acceptance-mapping),
and [setup guide](../vscode-test-profile-setup.md).

## Implemented behavior

`src/ide_smoke/profile_safety.py` promotes the qualified read-only path/marker
policy into controlled `Result` findings. Known unsafe/missing resources block;
indeterminate metadata or marker access is an error. Findings carry a fixed
resource label in `key`, without marker contents, exception text, or new profile
path diagnostics. The existing `profile_missing` message now covers directories
and marker remediation. Production tests exercise serialization and privacy
through returned Results; existing result aggregation/serialization tests remain
unchanged.

Every run acquires the existing per-user desktop lock before strict config,
basic availability, and profile inspection. `resolve_resources` shares the
existing first-regular-file PATH selection with profile context assembly;
`check_resources` retains its previous result-only behavior. Wrong-kind fallback
and indeterminate-access behavior remain covered. No executable is run or
qualified. Resolved enclosing `.app` or executable parent becomes unconditional
protected context. Known macOS everyday paths live in a separate provider.

Checkout context comes from the actual editable package's resolved source path,
independent of caller/config directories. The qualified `src/ide_smoke` layout
requires `pyproject.toml` in the inferred root; other layouts fail closed with
`profile_inspection_unknown`. Dedicated roots strictly below its `profiles/`
container remain permitted; every other protection prevails.

The `profile_safety_checked` event saves the controlled profile Result. Failures
prevent all operations and supply origins for all five skipped test entries.
Success is recorded separately and still reaches `operations_unimplemented`
(exit 4) through the public console. Reporter schema and config schema did not
change. No runtime dependencies, public commands, GUI actions, workspace lifecycle,
settings/extension checks, or authentication checks were added.

## Checks performed

TDD first demonstrated collection failure for the absent production checker.
Its first dedicated-profile Result test then passed. The 68 previously qualified
behavioral cases were ported to the production boundary and passed; these cover
path/marker rejection, identity/case aliases, accepted checkout allowance,
read-only preservation, bounded marker reads, and private inspection errors.
Additional tests cover source checkout selection, unqualified layouts, and
installation context. Historical spike tests remain separate evidence.

A resource-context test failed importing absent `resolve_resources`, then passed
after factoring the existing selection. The integration regression first failed
because the unmarked profile reached operations; it passed after guarded profile
admission was added. Synthetic fixtures now contain real dedicated children and
marker, with executable installation paths separated from profile roots.

Further checks cover saved profile success independently of smoke results,
blocked/error origins and no operations, inspection interruption, failed profile
event writes, finalization under exclusion, and no inspection by busy contenders.
The process worker records profile inspection separately from operation execution;
the competing CLI produces neither marker. Existing SIGINT, cleanup, evidence
failure, and lock termination/race regressions pass. No error reached four
unsuccessful fix rounds.

Actual final regression command:

```text
.venv/bin/python -m pytest
294 passed in 1.58s
```

Qualified interpreter remains Python 3.12.15 arm64; pytest is 9.1.1 from the
existing environment. Targeted profile/config/orchestrator/process verification
passed 188 tests before the final PATH-context addition; the subsequent targeted
profile/orchestrator/process run passed 115 tests. The final complete suite above
supersedes earlier counts. No installation or environment changes occurred.

## Installed-console observations and retained evidence

All console runs below used the installed `.venv/bin/ide-smoke`, existing real
per-user desktop lock, and caller-relative `reports/<run-id>/` artifacts. Each
listed run has both `summary.json` and `events.jsonl`. Negative cases use synthetic
resources, without modifying personal paths.

| Input / command suffix | Observed result | Run ID |
| --- | --- | --- |
| `--config reports/m1-02/profile-safe.yaml` | `profile_safe` event; final `operations_unimplemented`, exit 4; five skips with unimplemented origin | `d2ae75d6e02d4547b5ad593363d1c725` |
| `--config reports/m1-02/profile-blocked.yaml` | `profile_marker_invalid`, key `marker`, exit 3; five skips with blocked origin | `3e301127d5f34db5ae3948d2fb722829` |
| `--config config/harness.local.yaml` | Real root passes preceding path/layout rules; `profile_missing`, key `marker`, exit 3; five blocked-origin skips | `c93490751dc94bcbb41939163c924ecb` |

The full command prefix for each row was:

```bash
.venv/bin/ide-smoke run --ide vscode
```

Ignored synthetic configs are retained under `reports/m1-02/`. Their inert
resources are retained at `/private/tmp/ide-smoke-m1-02-shf5mcvl/`, with separate
`bin`, `safe`, and `blocked` paths. **Deviation:** synthetic profiles cannot live
under the proposed `reports/m1-02/` location: production correctly rejects that
checkout overlap. Temporary paths outside the checkout preserve the qualified
policy; configs and findings remain under reports. No protected-context exemption
was introduced.

The initial sandbox console attempt was denied access to the per-user lock and
saved `guard_unavailable` in run `dc6f737862c44f7098ec38d1c22d256d` (exit 4), before
config/profile inspection. Subsequent console checks succeeded with approved
host lock access. Initial fixture preparation accidentally used bare `python3`,
which could not import PyYAML and created no fixtures; it was rerun successfully
with `.venv/bin/python`.

The first real-console configuration used the example's absent
`Contents/MacOS/Electron` path and correctly saved `executable_missing` (exit 3)
in run `127814706c0a4103a44f0220f9b936b6`. Narrow local metadata inspection found
bundle executable name `Code` and the existing `/usr/local/bin/code` link. The
ignored local config now selects that existing CLI for basic availability; it
was neither executed nor qualified for identity/runnability. The final real
console run above reaches the expected missing-marker block. These earlier
attempts do not count as successful profile checks.

## Initial real-profile preservation and adoption blocker

Before the observation, the expected finding was solely missing `marker`, with
unchanged root/child/marker metadata and successful lock release/reacquisition.
The production checker met that expectation under the real lock:

```bash
.venv/bin/python reports/m1-02/phase2-observe.py profile_missing
```

Ignored `reports/m1-02/phase2-profile_missing.json` records the controlled result,
Python/architecture, and before/after kind, inode, size, and mtime for the root,
fixed children, and marker only. Metadata equality and lock reacquisition passed.
The first sandbox observation failed at lock acquisition; the identical check
succeeded after escalation. The final observation uses the same existing CLI
path as the local console config. No directory enumeration, content inspection
outside the marker, profile mutation, or authentication inspection occurred.

At the initial Phase 2 checkpoint, the developer had been asked to confirm the profile was created solely for
testing and manually create its exact dedication marker after path/layout
validation. No confirmation or completed marker creation was recorded at that checkpoint.
The agent had left the real profile untouched; the subsequent authorized change
and successful observation are recorded below. A safe synthetic result does not
replace the required real-profile success observation.

The initial checkpoint identified the following remaining sequence: after manual
adoption, rerun the observer expecting `profile_safe`, then the installed-console
real-config command. That sequence was subsequently completed below. Require a `profile_safe` event followed
by unimplemented exit 4, inspect saved skips/origins, and preserve the narrow
metadata observations. Complete P2-05 and P2-06 only then. The final checkpoint in
the plan and execute-plan skill requires explicit developer validation; M1-03
still needs separate authorization.

## Acceptance mapping and limitations

| Revised criterion | Completed tasks and observed evidence |
| --- | --- |
| Safe root/children and protected-path separation | P2-02/P2-05: production policy tests for protected overlap, symlinks, child identities, and checkout allowance; real installed-console `profile_safe` in run `68d6f20bb1bb4fdb8b1918ce662e0dcc` |
| Nonsecret marker and deliberate existing-profile adoption | P2-02/P2-04/P2-05: strict marker tests, developer dedication/layout confirmation, explicitly authorized exclusive marker creation; `phase2-marker-adoption.json` and `phase2-profile_safe.json` under `reports/m1-02/`. Existing contents were retained in place; authentication was not inspected or requalified |
| Read-only inspection and controlled block/error classification | P2-02/P2-03/P2-05: `test_profile_inspection_is_narrow_and_preserves_files`, invalid-marker privacy and indeterminate-inspection tests; guarded inspection-error/interrupt tests verify exit 4/130, no operations, controlled skips and release; real before/after metadata equal in `phase2-real-console-verification.json` |
| Guarded integration and saved findings/skips | P2-03/P2-05: real run above saves profile PASS, final unimplemented exit 4, five correct skip origins and cleanup PASS; process contender/exclusion and finalization tests; invalid-marker console run `3e301127d5f34db5ae3948d2fb722829` saves BLOCKED exit 3 |
| Setup guide and successful/blocked demonstration | P2-04/P2-05/P2-06: implemented guide reconciled with exact path/marker policy and developer-authorized adoption; synthetic safe run `d2ae75d6e02d4547b5ad593363d1c725`, blocked run above, real successful profile stage, and final documentation consistency/link checks |

Metadata preservation cannot establish arbitrary-content safety, authentication
validity, or absence of races. The marker records intent, never deletion authority.
Known default everyday paths do not discover every custom personal location.
Profile safety does not assess IDE usability, permissions/session/lock state,
settings, extension inventory, or Copilot sign-in. Future GUI work requires its
own prerequisites. No story, Slice 1, or GUI acceptance is claimed here. The
M1-01 PATH follow-up's separate developer validation remains pending.

Documentation verification checked 86 relative links/anchors across README,
AGENTS, the plan, this report, setup guide, and local story with no missing
targets. `git diff --check` and new-file whitespace checks passed. All three
listed console summaries/events and their five skip origins were independently
read back and matched expected results. No commit or GitHub edit was requested
or performed.


## Authorized marker adoption and step 4 — 2026-10-21

This section preserves the step 4 checkpoint; subsequent P2-05/P2-06 sections
supersede its remaining-task status.

The developer confirmed steps 1 and 2 (dedication and path/layout), explicitly
requested that the agent create the marker in step 3, and authorized step 4.
This instruction supersedes the earlier requirement that the developer personally
create the file. It does not change production preflight's read-only behavior.

The one-time ignored script `reports/m1-02/adopt-confirmed-profile.py` acquired
the real per-user lock and rechecked that the sole finding was missing `marker`.
It created only `profiles/m1-00/.ide-smoke-profile.json`, using exclusive-create
and no-follow flags, mode 0600, with the exact qualified JSON plus a newline.
No existing file was overwritten. Fixed child inode/size/mtime observations
remained equal. The intentional marker creation changes root metadata; this is
separate from preservation during the later read-only inspection.

The initial sandbox attempt was denied at lock acquisition before any profile
mutation. The identical script succeeded with approved host lock access.
Ignored `reports/m1-02/phase2-marker-adoption.json` records explicit authorization,
exclusive creation, and unchanged fixed-child metadata.

Step 4 then ran successfully with approved real lock access:

```bash
.venv/bin/python reports/m1-02/phase2-observe.py profile_safe
```

Observed: `PASS / profile_safe`, key `profile`; all four inspected resources'
kind/inode/size/mtime snapshots unchanged during the read-only check; lock release
and reacquisition passed. Ignored evidence:
`reports/m1-02/phase2-profile_safe.json`. No GUI operations, credential inspection,
settings changes, or authentication verification occurred.

The user requested steps 3 and 4 only in this follow-up. Step 5's real installed
console check was not run; step 6's final acceptance consolidation remains pending.
P2-05/P2-06 and P2-VALIDATION remain unchecked. The earlier adoption blocker is
resolved; required real installed-console evidence is still outstanding.


## P2-05 completion — 2026-10-21

This section preserves the P2-05 checkpoint; the subsequent P2-06 section
supersedes its remaining consolidation status.

The developer requested the remaining actions to complete P2-05. Expected before
execution: real-profile `profile_safe` event, final `operations_unimplemented`
exit 4, five ordered skips with that origin, successful cleanup, unchanged narrow
root/child/marker metadata, and successful real lock release/reacquisition.

The ignored `reports/m1-02/verify-real-console.py` recorded narrow metadata under
the per-user guard, released it, and launched the installed console as a separate
process without operation injection:

```bash
.venv/bin/ide-smoke run --ide vscode --config config/harness.local.yaml
```

The process returned **4**, as expected. Run ID:
`68d6f20bb1bb4fdb8b1918ce662e0dcc`.

Saved artifacts:

- `reports/68d6f20bb1bb4fdb8b1918ce662e0dcc/summary.json`
- `reports/68d6f20bb1bb4fdb8b1918ce662e0dcc/events.jsonl`
- `reports/m1-02/phase2-real-console-verification.json`
- `reports/m1-02/verify-real-console.py` — repeatable verifier source.

Independent JSON readback established all ten expected checks: process/summary
exit 4; run `HARNESS ERROR / operations_unimplemented`; exactly one
`PASS / profile_safe` event; all T01–T05 skipped with the unimplemented error
origin; cleanup PASS; correlated event/run IDs; guard acquisition before profile
inspection; metadata equality; and real guard reacquisition after console exit.
The guard was released and acquired once more after verification. Metadata
snapshots include only kind, device, inode, size, and mtime of the root, fixed
children, and marker. No directory enumeration or unrelated-content reads ran.

The first sandbox verifier attempt failed acquiring the per-user guard before
snapshotting or launching the console. The identical command then completed
with approved host lock access:

```bash
.venv/bin/python reports/m1-02/verify-real-console.py
```

Python remains 3.12.15 arm64. No production source or dependencies changed in this
follow-up, so the prior 294 passing non-GUI tests remain the regression evidence;
the host check resolves the previously missing real-console evidence. Synthetic
blocked cases and controlled inspection-error tests remain recorded above.
No profile data was changed, no IDE was launched, and no authentication was
inspected. Narrow metadata preservation is not an arbitrary-content integrity
proof and does not eliminate races between the separately guarded snapshots.

P2-05 is now checked complete. Earlier statements that real-console evidence is
outstanding are historical and superseded by this section. P2-06's final
acceptance consolidation and P2-VALIDATION remain pending; neither M1-02 acceptance
nor advancement to M1-03 follows from this task completion.


## P2-06 consolidation — 2026-10-21

The developer requested P2-06 after verified P2-05 completion. The current status
and five-row acceptance mapping above supersede earlier partial-status entries;
those entries retain the observed execution history. README, AGENTS, the plan,
local story, and setup guide now distinguish implemented checks from historical
qualification and from future GUI work. Stale statements that production checks
were unimplemented or Phase 2 was on hold were removed from current-status text.
No earlier developer acceptance or validation date was invented.

Saved successful/blocked console summaries and events, adoption observations,
and real-console preservation evidence were read back during consolidation.
No runtime source, dependencies, profile data, or configuration were changed for
P2-06. The previous 294 passing tests remain applicable; no runtime tests were
rerun for this documentation-only task. No fresh GUI, authentication, executable,
permissions, or session checks were performed.

The two recorded implementation deviations remain explicit: synthetic profiles
live outside the checkout in `/private/tmp` because reports-subtree profiles are
correctly rejected; the developer explicitly authorized agent marker creation
after dedication/layout confirmation, superseding personal manual creation.
Neither changes production preflight's read-only policy. No acceptance blocker
remains. Filesystem-race and narrow-metadata limitations still apply, and raw
local evidence remains ignored rather than distributed with the repository.

P2-VALIDATION remains unchecked. The execute-plan skill and final plan checkpoint
require presenting the implementation-verified phase for explicit developer
validation. This does not validate the separate M1-01 PATH follow-up, Slice 1,
or authorize M1-03/GUI work. No GitHub issue or PR was edited and no commit was
created by this task.


Final P2-06 verification: **89 relative links/anchors** across the six affected
documents passed, as did `git diff --check` and new-file whitespace checks.
Saved artifacts for the real success-stage run and both synthetic console runs
were read back: findings, cleanup, all five skip origins, and correlated saved
real-console checks matched the report. Stored adoption and standalone success
observations also passed readback assertions. All five local story criteria and
P2-02 through P2-06 are checked; P2-VALIDATION is the only remaining Phase 2 gate.


## Final developer acceptance — 2026-10-21

After reviewing the completed phase, evidence summary, and remaining risks, the
developer stated: “I validate Phase 2 as complete”. This closes P2-VALIDATION and
M1-02. The plan, README, AGENTS, local story, and setup guide record acceptance.
The profile-only scope and evidence limitations remain unchanged. No code,
profile, configuration, dependency, or GitHub state changed to record this
validation. No runtime tests were rerun for this documentation-only update.
M1-03 was not started; the separate M1-01 PATH follow-up and Slice 1 gates remain.
