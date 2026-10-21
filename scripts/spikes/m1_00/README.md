# M1-00 discovery probe

**Current scope — 2026-10-20:** Use the [revised M1-00 plan](../../../docs/implementation-plans/M1-00.md):
submit `Reply with exactly the word READY.` and require `response.strip() == "READY"`
for its assistant response. Existing evidence may be reused if it establishes both
receipt and the exact assertion. The broader discovery/diagnostic operations documented below are
historical tools, not a checklist to rerun. In particular, `--cancel`, completion
qualification and restart testing are outside the current task. No test instance
is currently open; original test settings were restored and the authenticated
profile was preserved.

## Current result and offline reproduction

Retrospective review of the second saved exchange establishes exact `READY`
matching for its whole observed assistant body. Developer validated M1-00
on 2026-10-20; Slice 0 is complete. No additional request was needed. Run the evidence check locally:

```bash
.venv/bin/python scripts/spikes/m1_00/verify_saved_ready.py
```

This reads the existing ignored observation/tree files and checks the new
assistant container, its single text leaf and the host-recorded exact comparison.
It performs no GUI actions and cannot run without those local artifacts. See the
[current result](../../../docs/reports/M1-00-phase1.md#reduced-scope-result--saved-evidence-review)
for filenames, configuration and the developer-confirmed window-title caveat.

## Minimal host reproduction

The established host path is: use the dedicated authenticated profile and a
fresh disposable workspace with `discover.py launch`; temporarily set
`editor.accessibilitySupport=on` in that profile, preserving original settings;
run `discover.py enable-accessibility` and `discover.py open-ask --quiet`;
then run `observe_response.py` without flags. The observer verifies input readback,
submits the fixed READY prompt and records bounded observations. Inspect the
associated assistant body and compare its whole text with
`response.strip() == "READY"`; observer exit status alone is not an assertion.
Restore original settings and use `discover.py close` for owned cleanup.

This is a record of the exercised host path, not a single-command harness.
It requires approved host GUI execution, exclusive desktop use, Accessibility
access and current manual sign-in. The saved-evidence check above is sufficient
for the current task; another host run is unnecessary.

## Historical prerequisite probe

The phase/task references below belong to the superseded broader plan. Use the
current plan above to decide what work is needed; do not resume its old phases.


This is a read-only prerequisite probe for Phase 1 of the
[M1-00 plan](../../../docs/implementation-plans/M1-00.md), not a harness or Chat
demonstration. It sends no UI actions and requests no permissions. Run from the
checkout root using the existing standalone environment:

```bash
/opt/homebrew/bin/uv pip install --no-config --no-python-downloads --no-managed-python --python .venv/bin/python --only-binary :all: --default-index https://pypi.org/simple --keyring-provider disabled --requirements scripts/spikes/m1_00/requirements.txt
.venv/bin/python scripts/spikes/m1_00/preflight.py
```

`--only-binary :all:` disables source builds for the entire dependency graph.
uv 0.13.1 rejects combining it with `--no-build`; use the command above. The five
pinned dependencies were installed and imported on Python 3.12.15 arm64 using
`cp312-cp312-macosx_10_13_universal2` wheels. The installation required sandbox
escalation for uv cache access and downloads. The initial install selected the
two framework packages; the command above consumes all five resolved pins.

Exit 2 reports blocked prerequisites; exit 0 means only that the checks passed.
Neither proves window ownership, UI access, authentication, or Chat feasibility.
Sandbox visibility may differ from the host context. Run outside the sandbox only
with the required execution approval. The probe prints application counts and
wheel metadata, excluding titles, UI text, process arguments and credentials.
Save local output under ignored `.ide-smoke/m1-00/`; keep profiles and workspaces
under their separate ignored roots. No profile has been created by this probe.

Before GUI investigation, confirm exclusive desktop use and a regular VS Code
window, establish observed permissions for the actual caller, then follow
T3–T5 in the plan. Authentication and consent are manual. Phase 2 requires the
explicit Phase 1 developer checkpoint.

## Attended discovery and diagnosed input prerequisite

`discover.py` is a macOS-only experimental probe with `launch`, `inspect`,
`enable-accessibility`, `open-ask`, `configuration`, `input-keys`, and `close` operations. Run it
with the checkout interpreter in approved host execution. `launch` keeps its
executor session running until the owned app exits; run subsequent operations
in separate invocations. The dedicated profile uses `profiles/m1-00/` and each
launch gets a fresh `workspaces/m1-00/<run-id>` directory. Local session state,
redacted trees and cleanup records are under `.ide-smoke/m1-00/`. The probe
refuses a second launch while a session record exists. Preserve failed records;
verify process ownership or absence before manually archiving one.

`configuration` saves a dated snapshot of the owned window's mode/model picker
labels and the observed sign-in-required message; it never reads account controls
or conversation values. A model picker becoming available does not establish a
successful authenticated request or authentication reuse. `inspect --quiet` (also
accepted by `open-ask`) saves the same redacted tree while printing only ownership,
coexistence and node-count metadata.

Observed sequence: launch; enable the owned app's `AXManualAccessibility`;
open Ask via the Command Palette; configure/verify screen-reader support in
the test profile; perform unsent keyboard-input checks; close only the owned
app. Native value assignment and some alternative menu/key routes remain
exploratory commands, not established working input methods. A returned AX
success code alone is insufficient evidence.

The actual Chat editor's `AXValue` was empty outside screen-reader mode even
when keyboard input reached its buffer. `input-keys` therefore requires the
visible Screen Reader Optimized indicator. Set `editor.accessibilitySupport`
to `on` in the dedicated profile before using that command; its observed empty
editor representation can be an empty string or a newline. Do not change personal
settings. The material configuration condition still requires checkpoint review.

`diagnose_proxy.py` reproduces the cause with the same unsent marker under
screen-reader support off/on. It expects an existing owned Ask session with
Accessibility enabled and no test `User/settings.json`, temporarily changes
that one setting, compares the same buffer without intervening typing, verifies
selection/clear, then restores the settings file's absence:

```bash
.venv/bin/python scripts/spikes/m1_00/diagnose_proxy.py
```

Approval dialogs can steal focus and dismiss transient UI between invocations.
The working palette/input operations combine activation, action and outcome
verification within one invocation, with owned-window/frontmost checks before
keys. Diagnostic reproduction and a rerun of `input-keys` passed on the host;
neither submitted a prompt or established authentication/response completion.
See the [execution report](../../../docs/reports/M1-00-phase1.md) for limitations
and the original four-round stop followed by developer-authorized diagnosis.

## Phase 1 response-signal discovery

`observe_response.py` sends one fixed harmless synthetic request in an existing
owned Ask session and samples Accessibility for 25 seconds. It requires an empty
input, verified screen-reader support and an unchanged regular-window baseline.
It verifies the typed input before Enter and records structural classes, hashed
row identifiers/labels, marker-comparison booleans and UI-control signals. Raw
prompts/responses are excluded. It saves local evidence even if observation fails.

```bash
.venv/bin/python scripts/spikes/m1_00/observe_response.py
```

Run only during authorized exclusive desktop use in approved host execution.
The command has a real Chat side effect and no automatic retries. Its fixed
25-second sampling window bounds discovery; it never classifies completion or
returns a response assertion. A zero process exit means the observations were
recorded, not that a Chat test passed. Review the `regular_unchanged` field too.

Two executions observed synthetic replies in one IDE launch. The second exposed
`interactive-request`, `interactive-response`, `chat-response-loading` and
`chat-response-completed-at` through `AXDOMClassList`, with distinct transcript
row identities. Loading disappearance and a timestamp do not distinguish success
from cancellation/error. Phase 2 must challenge those candidate signals before
using them in a success decision. Manual sign-in is confirmed; restart reuse,
live cancellation rejection and stale-history rejection remain unverified.

The second execution's final regular-window title fingerprint differed from the
launch baseline; its cause is unresolved. Other regular-window comparisons
matched. No further requests were made; original test settings were restored and
the owned app exited with the authenticated profile preserved. The observer now
blocks a new request when the regular-window baseline has already changed.
