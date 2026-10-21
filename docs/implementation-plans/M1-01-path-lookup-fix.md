# M1-01 follow-up — Search PATH past directory candidates

**Source:** Review of `main...HEAD` at `fc4eb92`, followed by the developer request: “create a plan to fix the issue and add a test for this edge case.” Related requirements: [M1-01 configuration contract](M1-01.md#cli-and-configuration-contract) and [M1-01 story](../../specifications/ide-copilot-milestone1-user-stories.md#story-m1-01--bootstrap-the-python-project-and-cli).

**Execution status:** Implementation authorized and completed on 2026-10-20. PATH-01 through PATH-04 passed; developer validation of this correction is pending. This follow-up does not change the accepted M1-01 foundation status or authorize later stories.

## Problem and current evidence

When `ides.vscode.executable` is a bare command name, [check_resources](../../src/ide_smoke/config.py) searches PATH entries in order. It immediately returns any inspection issue other than `EXECUTABLE_MISSING`.

For `PATH=/first:/second`, with `/first/code` a directory and `/second/code` a regular file, the function returns `BLOCKED / executable_not_file` for `/first/code`. It never examines the available later file. The preceding review reproduced this with temporary synthetic resources and an existing synthetic profile, without launching an IDE.

[Existing tests](../../tests/unit/test_config.py) cover command-name availability, absent resources, explicit paths of the wrong type, and indeterminate availability. They do not cover an earlier PATH directory sharing the command name. The preceding review ran the existing suite: 136 tests passed. That result predates the proposed regression test and fix.

## Scope and acceptance criteria

Correct command-name availability lookup in `src/ide_smoke/config.py` and add focused non-GUI tests in `tests/unit/test_config.py`.

1. **AC1:** An earlier PATH directory named like the command does not prevent finding a regular file in a later PATH entry. With an existing profile, `check_resources` returns `None`.
2. **AC2:** If the search finds directory candidates but no regular file, return `BLOCKED / executable_not_file`, retaining the first rejected candidate's key and path. If every candidate is absent, retain `BLOCKED / executable_missing`.
3. **AC3:** Preserve immediate `HARNESS ERROR / availability_unknown` for indeterminate access, acceptance of existing nonexecutable regular files in foundation checks, explicit-path handling, and profile validation after successful lookup.
4. **AC4:** The new edge-case test exposes the current bug before the fix and passes afterward; the configuration tests and full non-GUI suite pass.

Dependencies are the existing M1-01 package, fixtures, and `.venv`. There are no unresolved prerequisites. Executable runnability remains M1-02 work. This correction adds no dependencies, GUI operations, configuration fields, or later-story implementation.

## Technical approach

Keep the current ordered PATH loop and `_inspect` result classification. Remember the first `EXECUTABLE_KIND` result and continue searching after that candidate. Continue past missing candidates as today. Return other issues immediately so access uncertainty keeps its existing meaning.

When a regular file is found, proceed to the existing profile check. If the loop exhausts PATH without finding a regular file, return the remembered wrong-kind result if present; otherwise return the existing missing-executable result. Remembering the wrong-kind result avoids describing an observed directory as absent.

Retain existence-only checking rather than switching to `shutil.which`, which would also enforce execution permissions and change the current foundation contract.

## Phase 1 — Regression test, correction, and verification

**Outcome:** PATH lookup accepts a later regular file while preserving meaningful diagnostics when none is found.

**Prerequisite:** Separate developer authorization to implement this plan. Reuse the existing environment and fixtures; no setup or installation is needed.

| Task | Concrete change | Depends on | Verification |
| --- | --- | --- | --- |
| PATH-01 | Add `test_cli_name_lookup_skips_directory_candidate` in `tests/unit/test_config.py`. Create two temporary PATH folders, a `fake-ide` directory in the first, a regular `fake-ide` file in the second, and use the fixture's existing synthetic profile. Set PATH with `monkeypatch.setenv` and `os.pathsep`; configure the bare name. Assert `check_resources(...) is None`. | Authorization | Run this test before changing production code; it must fail because the current result is `EXECUTABLE_KIND`. Record the failure. |
| PATH-02 | Add `test_cli_name_lookup_preserves_directory_diagnostic`. Use multiple PATH entries with a directory candidate and an absent later candidate. Assert `BLOCKED`, `EXECUTABLE_KIND`, the executable configuration key, and the first directory candidate's path. | PATH-01 | The test protects the fallback diagnostic against a fix that incorrectly reports all such searches as missing. |
| PATH-03 | Update only the bare-name lookup loop in `src/ide_smoke/config.py` using the approach above. | PATH-02 | Both new tests pass. The earlier directory no longer terminates a successful lookup. |
| PATH-04 | Run the configuration tests, then the full non-GUI suite; inspect the final diff for scope and diagnostic changes. | PATH-03 | Record commands, outcomes, and final test counts. Existing missing-resource, explicit wrong-type, permission-uncertainty, and nonexecutable-file tests remain green. |

Use these existing test commands during implementation; the named regression test is proposed and must first be created:

```bash
.venv/bin/python -m pytest tests/unit/test_config.py::test_cli_name_lookup_skips_directory_candidate
.venv/bin/python -m pytest tests/unit/test_config.py
.venv/bin/python -m pytest
git diff --check
```

Tests use temporary synthetic files and PATH overrides scoped by pytest. No command candidate is executed, and no installed IDE or authenticated profile is accessed.

**Phase completion and developer checkpoint:** Stop after PATH-04. Present the changes, the initial regression failure, checks actually performed and their results, diagnostic paths if any, deviations, and remaining limitations. Request explicit developer validation of this correction. M1-02/M1-03 and Slice 1 acceptance retain their separate authorization and validation gates.

## Acceptance mapping

| Criterion | Tasks | Evidence |
| --- | --- | --- |
| AC1 | PATH-01, PATH-03 | Earlier directory plus later regular file returns no availability issue. |
| AC2 | PATH-02–PATH-04 | New directory-only fallback test plus existing all-missing command-name test. |
| AC3 | PATH-03, PATH-04 | Diff inspection confirms only wrong-kind candidates gain continuation; existing configuration coverage remains green. |
| AC4 | PATH-01, PATH-04 | Recorded regression failure before the fix and passing focused/full suite afterward. |

## Implementation controls

Stop and seek developer guidance if new evidence requires changing acceptance criteria or expanding scope. Follow the [repository four-unsuccessful-fix-round rule](../../AGENTS.md#validation-and-documentation), including its required report of attempted fixes, results, and diagnostics; do not attempt a fifth round or work around the failing requirement without guidance.

Planning validation is limited to repository inspection, acceptance mapping, relative-link checks, and consistency with the existing README and M1-01 contract. Runtime verification of this correction belongs to the authorized implementation phase.

## Execution results — 2026-10-20

PATH-01 through PATH-04 are complete. Bare-name lookup now continues past directory candidates, retaining the first wrong-kind result if no regular file is found. Missing candidates still permit continued lookup, indeterminate access still returns immediately, and a successful lookup still reaches profile validation. Explicit-path handling is unchanged.

The two new tests use temporary synthetic PATH entries and the fixture's existing synthetic profile. The fallback test includes two directory candidates followed by an absent candidate to verify retention of the first directory's key and path. No candidate was executed and no IDE or authenticated profile was accessed.

| Check actually performed | Result |
| --- | --- |
| `.venv/bin/python -m pytest tests/unit/test_config.py::test_cli_name_lookup_skips_directory_candidate` before the production fix | Expected failure: `BLOCKED / EXECUTABLE_KIND` for `first/fake-ide` instead of `None`; reproduced the reported bug. |
| `.venv/bin/python -m pytest tests/unit/test_config.py` after the fix | 73 passed, including both new tests. |
| `.venv/bin/python -m pytest` after the fix | 138 passed, non-GUI suite; Python 3.12.15 and pytest 9.1.1. |
| `git diff --check` and final diff inspection | Passed; production change is confined to the bare-name PATH loop. |
| Relative-link target checks for this plan and `AGENTS.md` | Passed. |

The initial regression failure was printed in the test output; no separate diagnostic artifact was saved. No scope deviations, installations, or dependency changes were needed. Executable runnability and GUI readiness remain outside this correction.

**Developer checkpoint:** Implementation is ready for explicit developer validation. M1-02/M1-03 and Slice 1 retain their separate authorization and validation gates.
