# M1-02 qualification spikes

## Current profile-only qualification

`profile_safety.py` provides the independent read-only
`inspect_profile_safety(root, *, home, protected_paths, checkout=None)` boundary. It returns only
controlled `outcome`, `reason`, and `resource` fields, reusing foundation outcome
labels. It has no standalone command and is not installed-console admission.
The qualified rules and developer-accepted checkout policy are in the
[draft guide](../../../docs/vscode-test-profile-setup.md).

Run synthetic behavioral checks without touching the real profile:

```bash
.venv/bin/python -m pytest tests/unit/test_m1_02_profile_safety.py -q
.venv/bin/python -m pytest
```

Phase 1 qualification observed **68 focused / 215 total passing tests**. Initial
resumption had 55 focused / 202 total passing tests before the accepted checkout
rule. That initial guarded host check ran inline with `.venv/bin/python -`; its equivalent source is retained
in ignored `reports/m1-02/profile-only-observe.py`, and its allowlisted evidence
is `reports/m1-02/profile-only-observation.json`. On this checkout it can be
reproduced, with host approval for the existing real per-user lock, using:

```bash
.venv/bin/python reports/m1-02/profile-only-observe.py
```

Expected current observation: real root/children, missing marker (`BLOCKED`),
unchanged root/child inode/size/mtime, and lock release/reacquisition. The script
reads metadata and the marker only, preserves the profile, and saves evidence
under `reports/m1-02/`. The then-unresolved checkout policy was excluded
from that partial observation; it establishes no complete profile-safety pass.
Do not substitute another lock after a sandbox denial. No real marker creation,
GUI action, configuration change, or readiness probe belongs to this invocation.

The final guarded observation includes the accepted checkout rule:

```bash
.venv/bin/python reports/m1-02/profile-policy-observe.py
```

Its source and `reports/m1-02/profile-policy-observation.json` evidence are retained
locally and ignored. It checks the same narrow resources with explicit checkout,
everyday, and installation context. Expected actual result: root location/layout
admitted, then `BLOCKED / profile_missing / marker`, unchanged root/child metadata,
and lock release/reacquisition. It neither creates a marker nor establishes a
full dedication pass. These saved host-observation scripts are not distributed in
a fresh checkout; the tracked spike and synthetic tests remain reproducible there.

## Historical readiness qualification

> Historical broader readiness probe. M1-02 is now limited to profile safety;
> running this script also investigates excluded areas and is not the revised
> story's acceptance procedure. See the current implementation plan below.


This is a partial Phase 1 investigation, not the production preflight. See the
[report](../../../docs/reports/M1-02-phase1.md) and the
[implementation plan](../../../docs/implementation-plans/M1-02.md).

From the checkout, using the actual intended host execution context:

```bash
.venv/bin/python scripts/spikes/m1_02/qualify.py --context host
```

The context argument labels provenance; it does not escape a sandbox or establish
permission attribution. Host execution requires access to the existing real
per-user run lock. The sandbox attempt was denied at lock acquisition and did
not start probes. Do not substitute a checkout-local lock to bypass that denial.

The parent acquires the foundation lock, then sequentially runs isolated session
and metadata workers (10 seconds each) and the inspected official CLI's
`--version` (10 seconds). Native calls are bounded by their worker process. On
timeout/interruption only the directly owned worker is killed and reaped. These
workers do not launch other processes; the inspected CLI waits for its Node-mode
child. Descendant-process timeout cleanup is not yet qualified for production.
Output capture is file-backed; only up to 8192 bytes are decoded. The script has
per-command bounds, not the proposed shared production-preflight deadline.

The script reads app identity and extension manifests, the dedication marker's
existence, the dedicated extensions registry, and the dedicated user settings.
Only controlled observations and allowlisted versions/wheel tags are recorded.
It does not inspect account stores, UI/windows, credentials, or authentication.
Settings inspection accepts strict JSON only and does not establish effective
settings. Installation paths and the M1-00 profile are fixed investigation inputs;
configurable installation identity and complete profile validation remain work.

Evidence is saved in ignored `reports/m1-02/host-qualification.json` (overwritten
on another run). Exit **4 is intentional**: qualification is incomplete and the
script never claims readiness. Exit 3 indicates competing ownership. Worker
options are internal and must not be invoked directly outside the guarded parent.
The initial failed metadata observation is separately retained locally.

The inert candidate checks run with:

```bash
.venv/bin/python -m pytest tests/unit/test_m1_02_qualification.py
```

No dependency installation, IDE launch, permission request, settings/profile
mutation, marker creation, or Copilot request is performed.
