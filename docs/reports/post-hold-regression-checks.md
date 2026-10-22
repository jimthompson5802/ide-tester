# Regression checks after the M1-05 hold

Date: 2026-10-21. Requested by the developer after placing M1-05 on hold.
Scope: verify current non-GUI tests and existing M1-04 T01 GUI behavior.
M1-05 remains on hold; M1-06 is not authorized or started.

## Non-GUI result

```sh
.venv/bin/python -m pytest -q
```

**544 passed in 12.75s.** This includes the current inert M1-05 controller/worker
tests; it does not establish successful native T02/T03 behavior. No test failure
or implementation change was needed.

## GUI result

The developer renewed exclusive desktop/profile reservation. **All nine existing
T01 host checks produced their expected outcomes**, with host sandbox approval.
Normal installed-console T01 passed in **2.731587 seconds** on VS Code 1.135.0.
The eight controlled lifecycle cases also passed their assertions; their expected
nonzero run outcomes are not regression failures.

```sh
.venv/bin/python .ide-smoke/m1-04/phase2-host.py normal_console
.venv/bin/python .ide-smoke/m1-04/phase2-host.py occupied_profile wrong_workspace ambiguous modal timeout stalled_observer early_exit interrupt
.venv/bin/python .ide-smoke/m1-04/phase2-final-check.py
```

| Case | Run ID | Expected outcome / exit |
| --- | --- | --- |
| Normal console | `ae6405a4a2ae4a9db89b05d2b4c7c530` | T01 PASS / 4 (later tests unavailable) |
| Occupied profile | `9a36424dab1a4f49ab22b5b62be8a8bd` | BLOCKED profile_busy / 3 |
| Wrong workspace | `0b8b647166b1446fb7395987a4ecf1e1` | HARNESS ERROR ownership_uncertain / 4 |
| Ambiguous windows | `b869356a010d441fa3c4da7a81db6a97` | HARNESS ERROR ownership_uncertain / 4 |
| Modal obstruction | `683e8aaec3db4c93b6801c4a1d9d7075` | HARNESS ERROR obstructed / 4 |
| Readiness timeout | `edf9d5ae38cb48669d429480c9e33372` | HARNESS ERROR readiness_timeout / 4 |
| Stalled observer | `9b89081da3ee40d7a683f4db568120f3` | HARNESS ERROR native_timeout / 4 |
| Early exit | `b5550f94c71c4d629f5c9827eeb95b4c` | HARNESS ERROR early_exit / 4 |
| Interruption | `628f902b2a244714b0a25c215450fa3d` | HARNESS ERROR interrupted / 130 |

The normal case uses the actual installed console and production default T01.
Controlled cases exercise actual owned launch/cleanup with synthetic observations
for wrong workspace, ambiguity, modal, readiness timeout and stalled observer;
early exit/interruption use the previously qualified controls. They do not claim
all those conditions were induced through real UI gestures. See the
[M1-04 evidence](M1-04-phase2.md#production-host-matrix) for the control definitions.

Each case verified observed owned cleanup, unchanged regular-window fingerprints,
narrow persistent-profile metadata and synthetic sentinels, retained workspace,
matching manifest/summary and guard reacquisition. The occupied-profile challenger
never spawned and preserved its original owner. Independent final checks verified
all nine manifest/fixture comparisons and exact original settings bytes.
Final read-only preflight checked **26** dedicated profiles without observed
conflicts and reacquired/released the run guard.

Current rows are saved in ignored
`.ide-smoke/m1-04/post-hold-regression-results.json`; each `reports/<run-id>/`
contains summaries, events, workspace manifests and controlled host evidence.
No dependencies, implementation or settings changed. GUI runs are stopped and
the desktop/profile reservation is released. Complete unseen detached-child
accounting and automatic recovery remain deferred as in accepted M1-04 scope.

T02/T03 native qualification remains incomplete and on hold. T04/T05 remain
unimplemented. The full public suite cannot report all five smoke tests passing;
a passing T01 with T02–T05 skipped still has expected overall exit 4.
