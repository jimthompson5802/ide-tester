# M1-04 Phase 2 — Production T01 execution evidence

Date: 2026-10-21. Status: **complete and developer validated on 2026-10-21**.

## Results summary

Phase 2 implements production T01 through the public CLI, using the accepted
[plan](../implementation-plans/M1-04.md#final-p1-04-implementation-specification--2026-10-21),
TDD and subagents. P2-01–P2-05 and P2-VALIDATION are complete; the developer stated
“i validate Phase 2” on 2026-10-21.

- **Regression tests:** 511 passed in the preserved `.venv` (12.37s), and 511
  passed in the independent clean environment (12.51s). The working environment
  was preserved; clean installation used locked wheels and offline local packaging.
- **Real T01:** installed-console launch/readiness passed in **2.669878s** and
  recorded VS Code **1.135.0**. T02–T05 remain SKIP, so suite exit **4** is expected.
- **Controlled host checks:** all eight produced expected outcomes: occupied
  profile, wrong workspace, ambiguous windows, modal obstruction, readiness
  timeout, stalled observer, early exit and interruption. Injected observations
  are identified in the detailed evidence below.
- **Interruption and cleanup:** interrupted T01 now saves HARNESS ERROR with
  elapsed duration and dependent SKIP, returning **130** when cleanup/evidence
  succeed. Inert cleanup-failure checks preserve individual results and force
  **4**, including when all synthetic assertions passed.
- **Resource preservation:** observed owned shutdown passed; GUI workspaces were
  retained despite configured removal. Regular-window comparisons, narrow
  persistent-profile metadata, synthetic sentinels and guard reacquisition passed.
  Final preflight found no profile conflicts across 18 checked test profiles.
- **Dependencies and documentation:** Python **3.12.15 arm64**, uv **0.13.1** and
  five PyObjC **12.2.2** distributions qualified; artifact sources/hashes are locked.
  All 106 checked local Markdown targets/anchors and `git diff --check` passed.

GUI automation is stopped and the desktop reservation is released. Automatic
recovery and unseen detached-child completeness remain deferred; observed shutdown
does not prove complete descendant exit. T01 does not establish editor usability
or authentication. No later story, Slice 2 or milestone acceptance is implied.

## Test boundaries and initial red evidence

Previously agreed seams: IDE lifecycle through controlled native boundaries;
run_attempt through inert session injection; typed isolated worker requests and
owned synthetic processes. Ordinary pytest must not launch a GUI.

The first orchestration regression updated interrupted-operation expectations and
ran:

```text
.venv/bin/python -m pytest -q tests/unit/test_orchestrator.py -k 'interruption_preserves_completed or cleanup_failure_preserves_results or summary_failure_reports'
3 failed, 2 passed, 37 deselected
```

All three failures reproduced the known missing behavior: the interrupted operation
was saved as SKIP rather than HARNESS ERROR. This is red evidence, not a completed
verification result.

The first default-T01 integration test ran:

```text
.venv/bin/python -m pytest -q tests/unit/test_t01_integration.py
1 failed
```

It failed because run_attempt had no _session_factory argument. This test follows
the public orchestration path through the accepted inert factory, checking saved
results/version, shared deadline, selected resources and conservative retention.

The sections below record subsequent green checks, dependency qualification and production host evidence; the initial failures above remain historical red evidence.

## Implementation and TDD verification

Production modules implement the portable IDE boundary, VSCodeIDE controller,
native owner/worker, lazy default T01 and controlled result mapping. The probe
now delegates to production rather than retaining a second native implementation.
No reporter schema or WorkspaceManager policy implementation changed.

Small red-green cycles covered missing contract/module APIs, full IPC-path byte
limits (including Unicode), typed/size-limited worker replies, bounded stalls,
repeated-launch ownership, malformed PID/birth claims, missing profile argument,
controlled errors/stages, interruption, cleanup diagnostics, CLI help and retention.
The malformed worker-error test initially accepted extra fields; strict reply
validation made it pass. A valid JSON reply above 64 KiB in encoded bytes
reproduced the byte-count bug before its fix. Native preflight previously ignored
a terminal --user-data-dir without value; a synthetic own-process regression
reproduced that unsafe admission before rejection was added. No error reached
the four-unsuccessful-fix-round threshold.

Root integration checks progressed from the initial red results to 6 green for
shared startup/interruption, 13 green after lifecycle mappings, and 23 green
including version-stage interruption, invalid/throwing retention, local-only
cleanup diagnostics and all-pass GUI cleanup precedence. CLI text tests first
failed then passed after help/reason updates. Existing non-GUI workspace tests
explicitly inject inert operations to preserve M1-03 deletion coverage.

Final preserved-environment command:

```text
.venv/bin/python -m pytest -q
511 passed in 12.37s
```

Independent clean-environment command:

```text
reports/m1-04/clean-env/bin/python -m pytest -q
511 passed in 12.51s
```

The process suite also verifies actual SIGINT handling, saved ERROR/duration,
dependent origins, retained fixtures and guard reacquisition with inert sessions.
All-pass plus cleanup failure returns 4 and preserves each PASS; ordinary successful
GUI retention is not an error. Unsupported-host import tests observe no native
framework loading. Synthetic sensitive exception/stage/payload strings remain
out of saved artifacts and console diagnostics. CleanupError local hints are
revalidated and limited to current in-memory owner PID/birth/workspace.

## Dependency qualification

Reused Homebrew uv 0.13.1 and the existing Python 3.12.15 arm64. Added two direct
macOS-marked framework pins and three transitive constraints. uv.lock records
PyPI registry artifact URLs, sizes and SHA-256 hashes. No extra uv/Python/compiler
installation occurred; dependency source builds were disabled. The existing
.venv already contained all five PyObjC 12.2.2 packages. Its --inexact sync checked
12 dependencies without pruning/reinstalling those packages; the local pure-Python
editable package alone was refreshed offline.

The separate reports/m1-04/clean-env was created offline using existing Python.
Its first wheel-download approval was interrupted; this was reported incomplete.
After the developer asked how to finish the check, a renewed approval succeeded:

```sh
UV_PROJECT_ENVIRONMENT=reports/m1-04/clean-env /opt/homebrew/bin/uv sync --locked --inexact --no-install-project --no-build --no-python-downloads --python /opt/homebrew/bin/python3.12 --cache-dir reports/m1-04/uv-cache
/opt/homebrew/bin/uv pip install --python reports/m1-04/clean-env/bin/python --no-python-downloads --no-deps --no-build-isolation --offline --cache-dir reports/m1-04/uv-cache --editable .
```

The first command installed 12 packages from wheels; the second built/installed
only the local pure-Python package offline using the installed backend. The warning
that inherited VIRTUAL_ENV=.venv was ignored confirms the explicit independent
environment target. The working .venv was preserved. Clean metadata confirmed
the selected existing base, arm64 and all five 12.2.2 distributions carrying
cp312-cp312-macosx_10_13_universal2 tags. Controller imports left frameworks
unloaded; separate explicit framework import qualification succeeded. Local
fixed facts: reports/m1-04/clean-qualification.json.

Compatible cp312 universal2 wheel SHA-256 entries from uv.lock:

| Distribution (all 12.2.2) | SHA-256 |
| --- | --- |
| pyobjc-core | `122e6ad302a2abf5d4d4adb0156db751600ddf2768441696cba17b31323085e7` |
| pyobjc-framework-applicationservices | `5506bd6b5268a97fcb79b5b021f6cbbaaf5cdff3ec87094d8870268d8cf096ed` |
| pyobjc-framework-cocoa | `e106f395531e67694376b0f1184612cbeea3ec8b9bf56b55ef41d026171d2a2d` |
| pyobjc-framework-coretext | `a69611de569d92776e6391ca25492a5bbb4a05ba744006349e377a4fc5f7c8a5` |
| pyobjc-framework-quartz | `7f668979d0c7320bf8f7ed6e030da578f93ab0f5dd619b295ec735cd8d5faa34` |

## Production host matrix

The developer renewed exclusive unlocked-desktop/test-profile reservation. GUI
checks ran sequentially with host sandbox approval. The persistent profile marker
and contents were preserved. Fresh short synthetic marked profiles copied no
credentials; all profiles/workspaces remain retained. Commands:

```sh
.venv/bin/python .ide-smoke/m1-04/phase2-host.py normal_console
.venv/bin/python .ide-smoke/m1-04/phase2-host.py occupied_profile wrong_workspace ambiguous modal timeout stalled_observer early_exit interrupt
.venv/bin/python .ide-smoke/m1-04/phase2-final-check.py
```

The first driver invokes the real installed .venv/bin/ide-smoke console, without
a session injection. Controlled cases use production T01/controller/worker with
private observation controls. The stalled observation runs a sleeping isolated
Python worker, bounded at 0.25s for this check. The 2-second case withholds
readiness. Wrong/ambiguous/modal observations are synthetic; no foreign windows
or dialogs are manipulated. Early exit uses actual original-owner graceful quit.
Interruption occurs after native launch and before logical readiness.

| Case | Run ID | T01 duration (s) | Result / exit |
| --- | --- | ---: | --- |
| normal_console | `2cb518f1eee54a32a2b0a7237e6d05f9` | 2.669878 | PASS / 4 |
| occupied_profile | `4f3d441743b24e1da92fad599f0e5f83` | 3.232078 | BLOCKED / 3 |
| wrong_workspace | `5994feeb40184c03957e691935c86701` | 0.550657 | HARNESS ERROR / 4 |
| ambiguous | `c51353a3595d46cb968ec95051159422` | 0.573584 | HARNESS ERROR / 4 |
| modal | `f7cdddb9defe4c82ae855efc02ac993a` | 0.591949 | HARNESS ERROR / 4 |
| timeout | `0a6c68c494464f2b8755ec75b88b6cbc` | 2.005097 | HARNESS ERROR / 4 |
| stalled_observer | `b598e2a9d6354848945128e5d78e3cb0` | 0.765450 | HARNESS ERROR / 4 |
| early_exit | `4280e4347b34485c9bf3563c230360d0` | 1.192122 | HARNESS ERROR / 4 |
| interrupt | `715c8254914946afb5cabe12dfebbecb` | 0.544897 | HARNESS ERROR / 130 |

Normal T01 validated installed version 1.135.0; T02–T05 were SKIP and suite exit
4 was expected. The saved manifest and sidecar agreed, configured retain_on_failure
remained false, and disposition was retained/gui_exit_scope_limited. Cleanup PASS
records the accepted observed scope. The original occupied owner reached actual
workbench readiness and its PID/birth/executable/argv remained live and matching
after challenge; challenger spawn calls were zero. Every controlled row recorded
original main-process reap, owned close, retained workspace, unchanged regular
window, synthetic marker/sentinel and outside sentinel, narrow persistent-profile
metadata preservation, matching evidence and guard reacquisition. Interrupted
T01 saved HARNESS ERROR/interrupted with finite duration and dependent SKIP;
exit 130 was preserved. Shutdown-refusal/error checks remained inert.

Raw local rows: .ide-smoke/m1-04/phase2-host-results.jsonl; each reports/<run-id>/
contains summary.json, events.jsonl, workspace.json and phase2-host.json. Normal
window fingerprints use salted title hashes, not raw desktop titles. Final read-only
preflight inspected 18 dedicated profiles without observed conflicts and reacquired/
released the guard. Fixed result: .ide-smoke/m1-04/phase2-final-check.json. GUI
automation is stopped and the desktop reservation is released.

## Limits and developer checkpoint

T01 is passive owned-workbench readiness, not editor usability or authentication.
Automatic recovery and unseen detached-child completeness remain deferred;
main/session/previously observed birth identity shutdown does not prove all
descendants exited. Unregistered alternate installations are not comprehensively
detected. Controller process creation is synchronous and not interruptibly bounded.
All GUI launch-attempt workspaces remain retained, including on pass. No old
retained fixture/profile was deleted, no settings changed, and no forced IDE
termination or recovery retry was added.

README, profile setup, example config, repository instructions and M1-04 story
status describe demonstrated behavior. The developer accepted Phase 2 and M1-04
within the recorded scope on 2026-10-21;
M1-05 and later milestones are not authorized and Slice 2 is not accepted.

Documentation verification passed for 106 local Markdown targets/anchors across
the affected README, instructions, plan, setup guide, report and backlog; code
fences and trailing-whitespace checks passed. git diff --check passed. Changes
remain uncommitted for review.
