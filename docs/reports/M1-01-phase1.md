# M1-01 Phase 1 — Packaging and run-lock qualification

Execution authorized by the developer's instruction to implement the
[M1-01 plan](../implementation-plans/M1-01.md), on 2026-10-20. Tasks P1-01
through P1-04 are complete; the developer validated Phase 1 on 2026-10-20.
This report records Phase 1 behavior; subsequent implementation is recorded in
the [Phase 2 report](M1-01-phase2.md). These are synthetic foundation checks, not T01–T05 results.

## Environment and preservation

The execution shell and Python reported arm64. The existing Homebrew uv
0.13.1 and Python 3.12.15 were reused. The checkout `.venv` has the selected
Homebrew base, checkout prefix, disabled user site, and no system site packages.
The working tree was clean before execution.

Baseline evidence is retained locally under `reports/m1-01/baseline.json`.
Only setting names were recorded there. An initial conservative assertion
requiring no inherited Python/environment settings stopped the check. Review
found the checkout's matching `VIRTUAL_ENV`, its prompt, and VS Code's
`PYTHONSTARTUP` script path; no uv or pip overrides were present. Python startup
scripts do not run for these noninteractive commands. The environment was
preserved without changing shell/editor settings.

`inventory-after.json` confirms all five PyObjC 12.2.2 spike distributions were
retained unchanged. Foundation added seven wheel distributions and the local
editable package. No profiles, workspaces, spike evidence, or GUI were touched.

## Qualified setup

Python support is `>=3.12,<3.13`, with shared pin `3.12`; only 3.12.15 arm64 was
qualified here. Package metadata and `uv.lock` govern versions. PyYAML is the
selected YAML parser for Phase 2; pytest supports development checks. Flit Core
is a pure-Python backend without its own dependency tree. Its exact build-system
requirement also appears in the development group so the locked wheel install
provides the backend before local packaging.

Qualified versions on macOS:

| Distribution | Version | Purpose / installed wheel |
| --- | --- | --- |
| PyYAML | 6.0.3 | Runtime YAML parser; CPython 3.12 macOS 11 arm64 wheel |
| pytest | 9.1.1 | Development runner; universal pure-Python wheel |
| flit_core | 3.12.0 | Local package backend; universal pure-Python wheel |
| iniconfig | 2.3.1 | pytest dependency; universal pure-Python wheel |
| packaging | 26.3 | pytest dependency; universal pure-Python wheel |
| pluggy | 1.7.0 | pytest dependency; universal pure-Python wheel |
| Pygments | 2.21.0 | pytest dependency; universal pure-Python wheel |

The universal lock also includes pytest's conditional Windows dependency
colorama, which was not installed or qualified on this host. This does not
establish Windows support. `wheel-provenance.json` records installed wheel tags
and corresponding locked PyPI URLs and SHA-256 hashes. uv's `--no-build` rule
requires dependency wheels even though the universal lock contains sdist metadata.

From this checkout, with the existing `.venv`:

```bash
/opt/homebrew/bin/uv sync --locked --inexact --no-install-project --no-build --no-python-downloads --python /opt/homebrew/bin/python3.12 --cache-dir reports/m1-01/uv-cache
/opt/homebrew/bin/uv pip install --python .venv/bin/python --no-python-downloads --no-deps --no-build-isolation --offline --cache-dir reports/m1-01/uv-cache --editable .
```

The first command installs locked runtime, development, and backend wheels,
preserving extra distributions through `--inexact`. The second performs only
this repository's pure-Python editable packaging using the installed backend;
`--no-deps`, `--no-build-isolation`, and `--offline` prevent third-party
dependency/build-requirement resolution or downloads in that step. Keep these
steps separate. A plain `uv sync` does not enforce these constraints or preserve
the spike inventory. No compiler was invoked or installed. The sandbox blocked
PyPI DNS during resolution and download; identical commands succeeded with
approved network escalation. The cache path above stays inside ignored reports.

A separate unseeded environment was created without downloading Python:

```bash
/opt/homebrew/bin/uv venv --python /opt/homebrew/bin/python3.12 --no-python-downloads --offline --cache-dir reports/m1-01/uv-cache reports/m1-01/clean-venv
UV_PROJECT_ENVIRONMENT=reports/m1-01/clean-venv /opt/homebrew/bin/uv sync --locked --inexact --no-install-project --no-build --no-python-downloads --python /opt/homebrew/bin/python3.12 --offline --cache-dir reports/m1-01/uv-cache
/opt/homebrew/bin/uv pip install --python reports/m1-01/clean-venv/bin/python --no-python-downloads --no-deps --no-build-isolation --offline --cache-dir reports/m1-01/uv-cache --editable .
```

uv explicitly ignored the inherited `.venv` activation for the clean sync.
`clean-inventory.json` shows exactly the eight foundation distributions, no
PyObjC, arm64 isolation, correct editable import, and Python metadata bounds.
Console entry points and package/YAML/backend/test imports worked there.

A local source-only dummy distribution with an unavailable backend was rejected
before backend execution using `uv pip install --no-build --no-index
--find-links … --offline`. `source-only-rejection.json` contains the complete
command and nonzero result: no usable wheels; source building disabled. An
initial attempt combined `--no-build` and `--only-binary :all:`, which uv rejects
as mutually exclusive; it is retained separately as
`source-only-initial-option-error.json`. Removing the redundant flag yielded the
intended fail-closed dependency-resolution result.

Lock consistency passed:

```bash
/opt/homebrew/bin/uv lock --check --offline --no-build --python /opt/homebrew/bin/python3.12 --no-python-downloads --cache-dir reports/m1-01/uv-cache
```

## CLI and lock evidence

The Phase 1 CLI provides installed help, argument validation, and explicit
unsupported execution (exit 4, no checks or saved run report). `--config` is
reserved but not loaded yet. `cli-checks.json` captures help (0), run help (0),
unimplemented VS Code run (4), and unsupported IDE (2) in both environments.
Configuration, summaries, taxonomy, and wiring the guard into run entry belong
to Phase 2. The CLI stub does not yet acquire the guard.

The macOS lock uses `fcntl.flock(LOCK_EX | LOCK_NB)` on an open, close-on-exec
descriptor. The default is `~/.ide-smoke/desktop-run.lock`, independent of
checkout and configuration. It serializes cooperating runs for one user on one
host. Acquisition never truncates owner metadata; release never unlinks the
file. Other platforms fail explicitly before importing `fcntl`.

Process tests inject one temporary lock path instead of touching the real
per-user directory. They verify canonical default-path selection separately.
No claim is made about actual home-directory write permission until runtime.
The tests use distinct working directories and inert configuration files; the
real YAML/run boundary is a Phase 2 check. They establish:

- A holder rejects a contender before its action marker; owner stays active,
  finishes normally, and retains lock-file contents and inode.
- Help succeeds while held, and a successor acquires after normal release.
- Simultaneous contenders admit exactly one winner.
- Both termination and hard kill release the OS lock; a successor acquires the
  same persistent inode. This establishes no cleanup of future IDE processes.
- An already-held instance rejects reacquisition; release is idempotent and
  the instance can subsequently acquire again.

Child coordination is bounded (five-second parent waits, ten-second worker
deadline), with terminate/kill cleanup in test finalizers. Lock existence alone
is never treated as proof of ownership. OS errors other than contention remain
errors for the Phase 2 orchestration to classify.

```bash
.venv/bin/python -m pytest --junitxml=reports/m1-01/phase1-tests.xml -q
reports/m1-01/clean-venv/bin/python -m pytest --junitxml=reports/m1-01/clean-phase1-tests.xml -q
```

Both environments passed 13 tests. Reports and raw qualification artifacts are
ignored and local; the committed report is the sanitized record. Documentation
links and whitespace were checked. No Phase 2 assumptions required material
revision: its installation and guard mechanisms are now qualified, with actual
CLI admission/reporting still to implement after explicit developer validation.
