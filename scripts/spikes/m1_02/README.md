# M1-02 readiness qualification

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
