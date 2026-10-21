# M1-01 Phase 2 — Foundation acceptance evidence

The developer validated Phase 1 on 2026-10-20. Phase 2 proceeded under the
existing instruction to implement the [M1-01 plan](../implementation-plans/M1-01.md).
P2-01 through P2-06 are complete; the developer accepted Phase 2 and validated M1-01 on 2026-10-20.
M1-02/M1-03 and Slice 1 approval remain separate gates.

This delivers a foundation, not operational IDE checks. Public execution with
valid settings and available resources reports `operations_unimplemented`, saves
all five T01–T05 results as dependent `SKIP`, and exits 4. No GUI, IDE launch,
profile contents/settings, credentials, or Copilot interaction was involved.

## Implemented behavior

- `config.py`: safe YAML with duplicate/unknown-key rejection, typed required
  fields, finite positive numeric timeouts, configuration-relative paths and
  home expansion. Basic file/directory availability uses stat without reading
  profiles or executing files. Positive absence is blocked; permission or other
  indeterminate stat errors preserve uncertainty as harness errors. Existing
  nonexecutable files remain available for this limited check.
- `guard.py` and the Phase 1 macOS lock: platform selection avoids macOS imports
  on unsupported hosts. All admitted CLI runs acquire the nonblocking canonical
  per-user guard before configuration-dependent execution. Only the acquiring
  invocation releases its descriptor; neither owner metadata nor the file's
  inode is replaced by contenders or ordinary release.
- `results.py`: five exact labels, closed controlled reasons, dependent origins,
  severity and exit-code rules. Incomplete/skipped suites cannot pass. Timeout
  uncertainty is distinct from an observed content mismatch.
- `orchestrator.py`: fixed T01–T05 order, internal inert operation boundaries
  with timeout parameters, dependent stopping, reverse registered cleanup, and
  interruption/error handling. The guard remains held through registered
  cleanup and evidence finalization; release errors amend cleanup evidence.
- `reporting.py`: run IDs, UTC timestamps, allowlisted JSON events, and atomic
  minimal summaries. Versions not observed are null. Unexpected exception text,
  YAML contents, credentials, environment dumps, prompts, and responses are
  excluded. Relevant configuration/resource paths are permitted diagnostic fields.
- `cli.py`: help, explicit settings selection, sanitized argument errors, and
  brief stderr output with actual summary location or inability to save. The
  public CLI exposes no simulated-result or configurable-lock/output flags.

Current setup, accepted schema, path rules, privacy, taxonomy, and exit codes are
documented in [README usage](../../README.md#setup-and-usage). The proposal's
larger example remains illustrative; [the committed small example](../../config/harness.example.yaml)
defines supported fields. Unknown-key diagnostics identify the supported parent
section and corrective action without echoing arbitrary user-supplied names.

## Verification actually performed

Both environments passed **136 non-GUI tests**:

```bash
.venv/bin/python -m pytest --basetemp reports/m1-01/phase2-evidence --junitxml=reports/m1-01/phase2-tests.xml -q
reports/m1-01/clean-venv/bin/python -m pytest --basetemp reports/m1-01/phase2-clean-evidence --junitxml=reports/m1-01/phase2-clean-tests.xml -q
```

The first used the preserved spike environment; the second used the independent
clean environment qualified in [Phase 1](M1-01-phase1.md). No dependency or lock
changes were needed for Phase 2. All five baseline PyObjC distributions remain
unchanged. Source builds, compiler installation, and Python/tool upgrades were
unnecessary. Python 3.12.15 arm64 and Homebrew uv 0.13.1 remain the qualified
versions; no new platform or Python minor version is claimed.

The retained evidence roots above were new pytest-owned directories for this
execution. Reusing `--basetemp` causes pytest to clear its selected temporary
directory; choose a fresh directory when retaining another run's evidence.
Default `.venv/bin/python -m pytest` does not select those retained roots.

| Source acceptance criterion | Implementation and observed evidence |
| --- | --- |
| AC1 — Package and setup | `pyproject.toml`, shared 3.12 pin, console/import/metadata checks, README setup; clean and preserved installs qualified in Phase 1. |
| AC2 — Justified locked wheels | Unchanged Phase 1 lock/backend qualification and source-only rejection; spike inventory preserved. |
| AC3 — CLI and unavailable operations | Help succeeds; invalid arguments return 2; a valid public run saves five skips and returns 4. |
| AC4 — Strict YAML | Tests cover unknown keys at every schema level, every missing required field, types, malformed/empty/unsafe/duplicate YAML, unreadable input, invalid paths, numeric timeout boundaries, path rules, missing resources, and uncertain availability. |
| AC5 — Structured events | Parsed JSONL events correlate run IDs/timestamps with summaries; finalization is checked while the owner holds the guard. |
| AC6 — Classification | Table-driven outcomes and mixed severity, mismatch versus unexplained timeout, usage versus prerequisite errors, and incomplete-suite rejection. |
| AC7 — Summaries and codes | Saved block/error/timeout/interruption samples; registered cleanup and evidence failures override success/interruption with code 4. Real output-root obstruction and atomic replace failure are covered. |
| AC8 — Stopping and cleanup | Action markers prove dependents do not execute; origin reasons survive; completed results remain after interruption; cleanup is attempted in reverse registration order and continues past failures. |
| AC9 — Cross-process exclusion | Actual CLI parsing/admission via internal inert operations, distinct working directories/configurations and report roots, rejection before action/cleanup markers, owner metadata/inode retained, help while held, and subsequent admission. |
| AC10 — Non-GUI tests | Both 136-test reports passed, including Phase 1 process-race/normal/terminated-holder tests and Phase 2 CLI/SIGINT tests. |

The CLI process worker injects only an isolated lock path and inert operations
behind the real parser/run-entry boundary. The owner is held until an explicit
marker releases it; the contender returns 3 without touching the owner's cleanup
or result. Owner/successor success is synthetic foundation evidence, not product
T01–T05 evidence. A separate real SIGINT test returns 130, saves interruption
origins, executes registered cleanup, and admits a subsequent process.

Privacy checks inject synthetic sensitive markers into invalid configuration,
unknown keys, exception/timeout/cleanup/evidence errors, and argument values.
These markers do not appear in saved run artifacts or terminal diagnostics.
Configuration files themselves are not copied into reports by the harness.

Additional installed-console checks used synthetic files and an empty synthetic
profile directory with the **real** canonical per-user lock. Six cases passed:
help (0), unsupported IDE arguments (2), valid but unimplemented run (4), absent
profile (3), malformed YAML (2), and absent default config (2). Each admitted
attempt saved all five skips with the appropriate origin. The filesystem sandbox
initially denied default-lock access; that invocation saved `guard_unavailable`
evidence. Approved host execution then established the intended behavior. This
was lock access qualification only, not desktop readiness qualification.

## Retained local artifacts

Artifacts are ignored, host-local, and not included in a fresh checkout:

- `reports/m1-01/phase2-tests.xml` and `phase2-clean-tests.xml`: full pytest results.
- `reports/m1-01/phase2-evidence/`: settings fixtures, inert process markers,
  saved events/summaries, and partial evidence for controlled write failures.
- `reports/m1-01/phase2-clean-evidence/`: independent-environment equivalents.
- `reports/m1-01/phase2-evidence-index.json`: 38 summary references with run IDs,
  result reasons, and exit codes, including timeout, exception, interruption,
  cleanup failure, and cross-process rejection.
- `reports/m1-01/cli-samples/cli-checks-phase2.json`: six installed-console
  commands, captured safe output/codes, and summary paths; corresponding run
  reports live under that working directory's `reports/`.
- Phase 1 inventory, wheel provenance, and installation evidence remain retained
  at the paths in its report.

Documentation relative links/anchors, tracked and new-file whitespace, package
lock consistency, and ignored-artifact/shared-pin rules were checked. Reports
outside this checkout do not inherit its ignore rules.

No material plan deviation was needed. Operational limitations remain explicit:
availability is not executable/session/profile/auth readiness; timeouts are
passed to future operations without a speculative timeout execution framework;
OS lock recovery does not clean up future IDE processes; hard kill/machine loss
cannot guarantee reports; fixture safety and GUI assertions remain later stories.
M1-01 is complete and developer validated on 2026-10-20. This acceptance does not authorize the next story.
