# Human-readable smoke test results

Branch: `vscode-smoke-test-reporter`  
Status: implementation and non-GUI verification complete on 2026-10-22; developer acceptance not yet recorded.

## Summary

Keep `result.json` unchanged. Show a readable summary in the terminal by default and save the same summary as `result.txt` beside it.

Illustrative output, including the implemented run ID and suite-duration fields:

```text
Smoke test: PASSED
Run ID: <run-id>
Scope: Selected suites

Suite       Result        Duration
Editing     PASSED        1.200 seconds
Chat        PASSED        1.500 seconds

Harness disposition: PASSED
Resources: Removed
Reservation: Released
Duration: 4.924 seconds
JSON report: /path/to/result.json
```

## Implementation plan and results

- [x] Add one shared formatter for terminal and text-file output. Derive suite outcomes from `checks` and the final harness disposition from `outcome`, including cleanup errors.
- [x] Display `PASSED`, `FAILED`, `BLOCKED`, `HARNESS ERROR`, and `NOT RUN` distinctly. A passing suite remains visibly passed when cleanup causes an overall harness error.
- [x] Include the run ID, scope, available suite durations, total duration, failure reason, cleanup errors, and report path. Show the resource path when resources are retained.
- [x] Handle incomplete results honestly: missing suite or cleanup information displays as unavailable.
- [x] Apply reporting to both `smoke` and `qualify`, including invalid arguments and early harness errors.
- [x] Add `--output text|json`, defaulting to `text`. JSON mode preserves the current terminal JSON format; both modes save `result.json` and `result.txt` when a result report path is available.
- [x] Preserve existing exit codes. A text-report write failure returns nonzero and clearly identifies the reporting error while preserving the saved JSON.
- [x] Update usage documentation with the summary example, artifact locations, and JSON-output option.

The shared formatter and text writer live in [report.ts](../smoke/src/report.ts). [cli.ts](../smoke/src/cli.ts) uses them for both commands and argument/early-error paths. [arguments.ts](../smoke/src/arguments.ts) validates the output option. The runner and saved JSON schema were left unchanged. Usage is documented in the [smoke README](../smoke/README.md#results-and-recovery); the [root README](../README.md) records the updated non-GUI test count.

Text files end with a newline, matching the default terminal writer. On a text-write failure, text mode appends a reporting error to the terminal summary; JSON mode adds a terminal-only `reportingError` field. Neither changes the previously saved JSON. Early errors without a result report path, such as an existing reservation, print a summary but do not create report artifacts. Unknown fields in incomplete results are not inferred.

## Test plan and verification results

- [x] Format successful editing-only, Chat-only, combined, and foundation results.
- [x] Cover a failed suite followed by a suite that did not run, blocked prerequisites, and passing checks followed by cleanup failure.
- [x] Cover incomplete early-error results without inventing suite or cleanup outcomes.
- [x] Verify default terminal output matches `result.txt`, JSON mode remains parseable, and saved JSON retains its existing structure.
- [x] Verify invalid output options and report-writing failures return nonzero.
- [x] Run compilation and the full non-GUI regression suite. GUI execution is unnecessary for this reporting change.

Tests are in [report.test.ts](../smoke/tests/report.test.ts), [cli.test.ts](../smoke/tests/cli.test.ts), and [arguments.test.ts](../smoke/tests/arguments.test.ts), alongside the existing regression tests.

Recorded checks from implementation on 2026-10-22:

| Check | Result |
| --- | --- |
| TDD: initial formatter test | Failed compilation because the new formatter module did not exist; passed after implementation. |
| TDD: CLI text/artifact tests | Failed against the previous JSON-only behavior and unsupported `--output`; passed after implementation. |
| `npm --prefix smoke run compile` | Passed for tester, tests, and helper. |
| `npm --prefix smoke run test:unit` | Final run: 27 passed, 0 failed. |
| `git diff --check` | Passed. |
| Relative links in root and smoke READMEs | Resolved locally. |

The first full regression run encountered sandbox-denied loopback binding (`listen EPERM: operation not permitted 127.0.0.1`), which also prevented the mocked launch test from reaching its intended stage. The suite was rerun with approved access outside the sandbox; all tests passed. This was an environment restriction, not a functional pass in the restricted run.

Successful suite summaries use synthetic result fixtures. CLI tests exercise invalid arguments, missing apps, existing reservations, and saved artifacts without launching VS Code. The text-write failure test uses a directory at `result.txt` to force a real filesystem error and verifies that saved JSON is preserved in both output modes. No GUI execution was performed for this change; these results do not establish new GUI qualification.

## Assumptions and scope

- Plain text without colors or terminal dependencies is sufficient.
- Final disposition includes both the overall harness outcome and resource/reservation cleanup status.
- Converting historical JSON files through a separate command is outside this change.
- Existing GUI compatibility and qualification limits remain documented in the [smoke README](../smoke/README.md#qualified-compatibility).
