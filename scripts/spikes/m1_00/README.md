# M1-00 discovery probe

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
`enable-accessibility`, `open-ask`, `input-keys`, and `close` operations. Run it
with the checkout interpreter in approved host execution. `launch` keeps its
executor session running until the owned app exits; run subsequent operations
in separate invocations. The dedicated profile uses `profiles/m1-00/` and each
launch gets a fresh `workspaces/m1-00/<run-id>` directory. Local session state,
redacted trees and cleanup records are under `.ide-smoke/m1-00/`. The probe
refuses a second launch while a session record exists. Preserve failed records;
verify process ownership or absence before manually archiving one.

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
