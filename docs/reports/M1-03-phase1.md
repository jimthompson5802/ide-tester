# M1-03 Phase 1 execution

Execution authorized 2026-10-21 by “execute plan m1-03”. **Complete and developer validated on 2026-10-21.**

## P1-01 policy and qualification criteria

Root: actual editable-source checkout/workspaces; reports remain cwd-relative.
Retention defaults false. Existing roots require exact versioned purpose marker
`.ide-smoke-workspaces.json`: `{"schema_version":1,"purpose":"ide-smoke-workspaces"}`.
Marker reads are bounded to 4096 bytes, reject links, duplicate keys, extra keys,
wrong types, and multiply linked files. No repair or adoption occurs.

Cleanup authority is an in-memory handle registered by the creating manager,
with held root/child descriptors and recorded identities. JSON is never authority.
Names combine run identity and randomness; exclusive mkdir collisions fail without
retry or overwrite. Partial children are registered before fixture initialization;
uncertain partial initialization is preserved. Root initialization failures preserve
the root for manual inspection. Nested links may be unlinked without traversal.
The threat boundary covers accidental misuse and detectable replacement, excluding
hostile continual same-user interference and mount manipulation.

Observed interpreter: Python 3.12.15 arm64; `shutil.rmtree.avoids_symlink_attacks`
is true. `os.open/stat/mkdir/unlink/rmdir` support dir_fd; `scandir` supports fd.
Use shared stdlib code; no native/platform-specific helper is needed. Unsupported
capabilities must refuse creation/deletion. Qualification tests will check actual
replacement at traversal, outside/profile sentinels, hard links, identity swaps,
unsafe markers, initialization interruption and controlled I/O failures.

Manifest fields: schema_version, run_id, workspace_path, target_path, target_name,
initial_fixture_sha256, retain_on_failure, disposition, reason. Dispositions:
not_created, created, removed, retained, cleanup_failed. Paths are generated paths,
never discovered filenames or file contents. Initial manifest precedes deletion.
Final sidecar and summary must agree when writes succeed. Late reporting/release
failures cannot restore deleted data. Hard-kill recovery is manual.

## Filesystem qualification

P1-02/P1-03: `tests/unit/test_workspace.py` initially failed collection because
`ide_smoke.workspace` did not exist. After implementation, a test's directory
ordering assumption failed and was corrected to compare sets. Injection tests
initially changed `os.open` identity without updating its capability set; tests
were corrected to register the instrumented wrapper. These were test defects.

26 focused tests pass, including deterministic replacement immediately before
nested-directory open by the stdlib traversal, collision preservation, root and
marker replacement, nested symlink unlinking, hard-link preservation, fixture
substitution, forged handle refusal, and partial initialization accounting.
Host temporary filesystem accepts case aliases (case test passed, no skip).
Cleanup uses fd-relative symlink-resistant `shutil.rmtree`; nested replacement
raises a controlled error and preserves the outside target. A failed deletion
may already have removed some owned entries; there is no rollback. No retry
widens its target. Repeat successful removal does not inspect substitute paths.

P1-04: existing orchestration uses zero-argument cleanup callbacks and a final
snapshot under the lock; integration will append workspace disposition after
callbacks and before snapshot. Process worker can inject a synthetic checkout
through an internal factory, without exposing public CLI cleanup options.

## Integration and failure qualification

P1-05: new focused tests first failed on the unsupported workspace section and
missing Config field. Optional `harness.workspace.retain_on_failure` now defaults
to false, accepts only actual booleans, and preserves existing required keys.
`tests/unit/test_workspace_config.py` supplements the existing configuration
suite; both passed 86 checks at that point. Configuration loading creates nothing.
The example documents creation during admitted execution.

P1-06/P1-07: initial lifecycle tests failed because no sidecar/context existed.
After integration, 45 lifecycle/orchestration tests passed. Further red tests
exposed incorrect uncertainty classification for missing/linked/wrong-kind
markers, acceptance of a fixed-root case alias, a home case alias, and a signal
after exclusive mkdir leaving no recorded candidate. Each was corrected and its
regression passed. The candidate is recorded before mkdir; cleanup authority is
withheld until a child descriptor/identity is established. Collision never grants
authority. An uncertain candidate is preserved with `ownership_uncertain`, even
when retention is false. Its fixture digest is null if initialization did not
complete. Initial metadata is saved after callbacks and before any deletion.

Lifecycle event tests first failed on missing resource Result payloads. Fixed
`workspace_created`/`workspace_finalized` events now carry allowlisted resource
results and no test ID; they never make T01–T05 pass. Manifests use a frozen typed
record serialized through `Reporter.workspace_manifest()`. Tests cover exact
field names, digest readback, run correlation, nonpassing retention, pass removal,
reverse callback ordering, initialization interruption, uncertain mkdir ownership,
operation-cleanup failure preservation, deletion failure severity, initial
metadata failure preservation, and late sidecar/event/summary failure honesty.
Sensitive synthetic filenames, file contents, profile contents, and exception
messages stay out of artifacts. Synthetic profile file bytes remain unchanged.

No new dependency, lockfile, environment, native helper, GUI operation, or
executable invocation was added. Shared workspace code uses stdlib descriptor
operations; macOS's existing protected-path helper supplies metadata context.
`OperationContext` shares the same handle/workspace/target with every inert action;
future process cleanup remains a registered callback preceding workspace disposal.

## Checks actually performed

| Check | Observed result |
| --- | --- |
| Existing interpreter inspection | Python 3.12.15, arm64; Darwin/macOS 15.7.9; descriptor deletion capabilities available. |
| `.venv/bin/python -m pytest -q tests/unit/test_workspace.py` | Latest focused run: 35 passed, no skipped host case check. |
| `.venv/bin/python -m pytest -q tests/unit/test_workspace_reporting.py` | 20 passed, including resource Result events. |
| Combined workspace/configuration/orchestration/profile/process checks | 260 passed before the last additional alias/lifecycle cases. |
| `.venv/bin/python -m pytest -q` | 367 passed after the additional lifecycle and home-alias checks; final recheck recorded below. |
| Process lock overlap and SIGINT | Actual child processes with synthetic checkout roots; contender creates no workspace; SIGINT removes by default and retains when configured; successor acquires guard. |

Process workers inject their synthetic checkout internally. No public CLI path or
cleanup option was added. Unit tests similarly isolate their checkout; they do
not create workspaces in the actual checkout. The exact test files are
`tests/unit/test_workspace.py`, `tests/unit/test_workspace_config.py`,
`tests/unit/test_workspace_reporting.py`, the extended
`tests/unit/test_profile_safety.py`, and `tests/process/test_run_entry.py` with its
worker. Existing orchestration/configuration/CLI tests remain regression coverage.

## Initial P1-08 prerequisite stop — subsequently resolved

Read-only metadata inspection found the **pre-existing** actual `workspaces/`
root is a real directory, contains one entry, and lacks the required purpose
marker. Its contents were not inspected or changed. The agreed policy prohibits
automatic adoption, marker repair, and stale-resource cleanup. A developer
question requests authorization to preserve the whole root under ignored
`reports/m1-03/preserved-workspaces/`, developer-managed relocation, or leaving
this qualification blocked. At that stop no answer had been recorded; the
authorization and completed checks are recorded below.

Ignored configs `reports/m1-03/remove.yaml` and `reports/m1-03/retain.yaml` are
prepared. The synthetic executable is an inert file under `reports/m1-03/` and
was never executed. A new generated synthetic profile under the ignored
`profiles/m1-03-synthetic-<uuid>/` subtree supplies real children, a synthetic
marker, and a preservation sentinel. The authenticated `profiles/m1-00` was
neither used nor modified.

Actual command:

```bash
.venv/bin/ide-smoke run --ide vscode --config reports/m1-03/remove.yaml
```

The sandbox initially denied the per-user lock; approved escalation of the same
command accessed the existing lock. Initial synthetic config placement under
reports was rejected by accepted profile policy (exit 3); moving the synthetic
profile under profiles still exposed parent traversal in its relative config
path (exit 3). Correcting the config to the canonical absolute synthetic profile
path produced the intended **workspace prerequisite block**, exit 3:
`reports/4d8db84867e647f0bd9611ca4c9dc4b5/summary.json`.
Independent inspection confirmed `workspace.disposition == "not_created"`, five
skips with `workspace_unsafe` origin, and no new workspace marker. Earlier
sandbox/admission reports remain local ignored diagnostics and do not establish
workspace qualification.

The required real-root remove/retain console cases reaching unimplemented exit 4
were **not performed at that stop**. Their manifests, independent preservation checks, and
real-root filesystem qualification remain incomplete. Synthetic test success
cannot substitute for these checks. P1-08 stayed unchecked at that stop. P1-09 documentation
is partially updated but its final acceptance mapping/review package remains
incomplete pending P1-08. M1-03 and Slice 1 are not developer accepted.

## Foundation review context and limits

M1-01 foundation is developer accepted; its PATH lookup follow-up still has the
separately documented pending developer-validation item. M1-02 profile safety is
accepted, with its case-insensitive app-suffix review fix recorded in repository
instructions. M1-03 adds workspace policy but no IDE/Copilot readiness evidence.
M1-03 final acceptance and combined Slice 1 acceptance must each be explicit;
neither authorizes M1-04 automatically.

Deletion can partly remove owned entries before an I/O error; `cleanup_failed`
does not promise a pristine retained tree. Descriptor-relative stdlib traversal
protects nested symlink targets, including the deterministic replacement test.
This does not establish safety against hostile continuous same-user interference,
mount replacement, hard-kill cleanup, or arbitrary-content integrity of an
uninspected authenticated profile. Late report/release failures cannot restore
removed data. An outdated sidecar after a failed update is evidence failure,
never proof of completed finalization. Manual recovery guidance is in README;
markers and reports never authorize stale-resource deletion by the harness.

Final checks at this stop: `.venv/bin/python -m pytest -q` passed **367 tests**
in 2.16 seconds, with no skips. A local Markdown path/heading check validated
**87 relative links/anchors with zero errors** across the six changed Markdown
files. `git diff --check` passed. `git status --short` contains only intended
source/tests/documentation changes; profiles, workspaces, configs and raw reports
remain ignored. The pre-existing workspace root is still a real directory with
one entry and no marker; only this narrow metadata was rechecked. No commits or
GitHub changes were made. At that stop real-root qualification remained blocked.


## Resumption — installed-console qualification complete

The developer explicitly authorized relocation on 2026-10-21: “you can move it”.
Using `DesktopRunLock`, the ignored one-off script
`reports/m1-03/relocate_root.py` checked the destination was absent, then renamed
the entire old root to `reports/m1-03/preserved-workspaces/`. It performed no
content reads, marker creation, deletion, adoption, or overwrite on that directory.
Before/after root device/inode/mode/size and immediate-entry metadata matched;
`reports/m1-03/relocation.json` records the narrow observations. This establishes
identity/metadata preservation by rename, not an arbitrary-content integrity scan.
The preserved directory stays ignored and is excluded from harness cleanup.

The installed console then created the absent fixed root and its purpose marker
through normal exclusive initialization. Actual sequential commands were:

```bash
.venv/bin/ide-smoke run --ide vscode --config reports/m1-03/remove.yaml
.venv/bin/ide-smoke run --ide vscode --config reports/m1-03/retain.yaml
.venv/bin/ide-smoke run --ide vscode --config reports/m1-03/remove.yaml
```

These commands used approved host access to the existing per-user desktop lock.
No fake executable was executed and no IDE was launched.

| Run ID | Policy | Observed disposition and independent outcome |
| --- | --- | --- |
| `c60138e016474a9182fe263d47ea4016` | default removal | Generated child absent after cleanup; fresh root and valid marker remain. |
| `4b12c35da17e48529f8cb9a5dd5e0a99` | retain on nonpass | Distinct child remains; exact `example.py` bytes and initial SHA-256 independently verified. |
| `b5c12fbb00cf40088ddfbe9a9d11b4c0` | successor removal | Another distinct child removed; retained fixture unchanged; actual guard reacquisition succeeded. |

All three returned the expected **exit 4**, `operations_unimplemented`, five
origin-preserving `SKIP` entries, `profile_safe`, and cleanup `PASS`. Summary and
sidecar agree; lifecycle events share the run ID. Root identity/mode and marker
digest stayed consistent between runs. Synthetic profile marker/sentinel digests,
outside sentinel bytes, and preserved old-root metadata stayed unchanged.
The retained workspace is
`workspaces/4b12c35da17e48529f8cb9a5dd5e0a99-d5db593613244f0f8b0b6d0a7a1c34f6/`.
It remains local and ignored for developer inspection; no stale cleanup was added.

Independent observations were performed by the ignored
`reports/m1-03/verify_console.py` and saved to
`reports/m1-03/console-qualification.json`. Each run's actual files are
`reports/<run-id>/summary.json`, `workspace.json`, and `events.jsonl`. Configs and
synthetic resources remain available locally for inspection. These are fixture
checks, not GUI or Copilot assertions. The only manual intervention was the
explicitly authorized old-root relocation; the agreed runtime policy is unchanged.

## Final acceptance mapping and Slice 1 checkpoint

| Criterion | Actual evidence |
| --- | --- |
| Unique workspace and known fixture | Exclusive creation/collision tests; three distinct console child names; retained fixture readback/digest. |
| Separation from persistent profiles | Bidirectional overlap and profile-protection tests; unchanged synthetic profile sentinels across creation, retention, removal and failures. Authenticated profile unused. |
| Safe-path cleanup | Handle/descriptor tests, root/child/marker swaps, links/hard links, alias/home protection, interrupted mkdir accounting, deterministic traversal replacement preserving outside target, real-root default removals. |
| Configured retention | Strict optional boolean tests; real retained manifest/fixture; failed operation cleanup or initial evidence saves preserve data; late errors report actual removal. |
| Unit tests and evidence | Focused and full regression results below; run-correlated sidecars/summaries/events and independent qualification observations. |

At the implementation checkpoint, P1-01–P1-09 were verified and developer
validation was pending for M1-03 and separately for combined Slice 1. M1-01/M1-02 acceptance is preserved;
the separately recorded M1-01 PATH follow-up validation remains pending. The
foundation now provides guarded config/result reporting, profile safety, and owned
workspace lifecycle. IDE/Copilot execution remains unimplemented; M1-04 requires
separate authorization after the applicable foundation gate. No dependencies,
package metadata, lockfiles, authenticated profiles, or GUI behavior changed.


Final resumed checks: targeted workspace/configuration/orchestration/profile/process
regression **262 passed**; full `.venv/bin/python -m pytest -q` **367 passed**
in 2.19 seconds, no skips. **88 relative Markdown links/anchors** passed with zero
errors. `git diff --check` passed, and explicit `git check-ignore` checks confirmed
preserved material, synthetic configs/profile, qualification evidence and retained
workspace remain ignored. Status contains only intended source/tests/docs;
`pyproject.toml` and `uv.lock` are unchanged. P1-08/P1-09 are now complete with no
remaining implementation blocker. Stop here for explicit M1-03 and Slice 1
validation; no new story or GUI work is authorized by this checkpoint.


## Final developer acceptance — 2026-10-21

The developer stated: “I validate m1-03. commit the changes. Do not move on to the
next milestone or phase.” M1-03 and its final phase are developer accepted within
the documented workspace-safety scope. This supersedes earlier pending M1-03
validation entries; their implementation and prerequisite history is retained.
Combined Slice 1 and the separate M1-01 PATH follow-up validation remain pending.

Only acceptance documentation changed after the 367-test passing regression and
real console qualification. No runtime tests were rerun solely for this record;
no resources, profiles, dependencies, or GUI behavior changed. The requested local
commit is separately authorized. Stop after committing; no next phase, milestone,
M1-04 execution, or publishing action is authorized.


## Slice 1 developer acceptance — 2026-10-21

After separately validating M1-03, the developer stated: “i also validate slice1”.
This accepts the combined M1-01–M1-03 foundation and resource-isolation checkpoint
and supersedes historical pending Slice 1 statements above. It does not expand
the recorded evidence into IDE/Copilot readiness or qualify GUI behavior.

The developer's instruction to stop before another phase or milestone remains in
force. No new implementation, GUI work, or environment changes followed this
acceptance. The separate M1-01 PATH follow-up validation remains as recorded.
Only acceptance documentation changed; runtime tests were not rerun for this
record. The 367-test passing result and installed-console evidence remain valid.
