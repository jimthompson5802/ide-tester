# Dedicated VS Code test profile setup — draft

M1-02 Phase 1 has not qualified every readiness mechanism. This is a reviewable
setup proposal; production preflight and a successful host acceptance run remain
pending. See the [Phase 1 findings](reports/M1-02-phase1.md) and
[plan](implementation-plans/M1-02.md). Do not treat the existing public CLI as
performing these proposed checks.

Use the existing macOS login and reserve the unlocked desktop exclusively for
the run. The harness lock excludes cooperating runs, not people or other tools.
The developer accepted a limited prerequisite snapshot on 2026-10-21 and deferred
automated screen-lock detection. Future preflight may succeed while explicitly
recording screen-lock state as unassessed; console/login and permission signals
do not establish unlocked state. Ensure the desktop is unlocked and reserved
before each GUI run and keep it available throughout the run. This is an
operating requirement, not an automated assertion or CLI confirmation prompt.
Actual IDE interaction belongs to T01, after the foundation slice is accepted.

This limitation means a locked desktop can pass preflight and later produce GUI
timeouts with an uncertain cause, reducing unattended reliability. Focus changes
and other desktop activity can also interfere with input; later automation must
verify its owned target before sending input. An unexplained timeout remains a
harness error, not evidence of an IDE regression. Preflight success establishes
neither GUI usability nor authentication. See the
[accepted implications and risks](implementation-plans/M1-02.md#accepted-limitation-and-risks--2026-10-21).

Use Microsoft's official VS Code application and its associated bundled CLI.
The investigated installation is `/Applications/Visual Studio Code.app`; the CLI
is `Contents/Resources/app/bin/code` inside that app. A symlink to this CLI is
acceptable in the proposed convention. Other locations must be correlated with
the selected app before execution; wrappers and other distributions are deferred.
The [official CLI documentation](https://code.visualstudio.com/docs/configure/command-line)
describes version output and isolated data/extension directory arguments.

The proposed dedicated layout is:

```text
profile_root/
  .ide-smoke-profile.json
  user-data/
  extensions/
```

The proposed marker is strict JSON containing only
`{"schema_version": 1, "purpose": "ide-smoke-dedicated-vscode"}`. It records
human dedication; it never permits deleting the profile. Marker validation is
not implemented yet. Missing marker or known unsafe layout will require manual
remediation. Inconclusive inspection must remain a harness error.

To adopt the existing authenticated `profiles/m1-00` directory deliberately,
first confirm it was created solely for these tests. Validate that the root and
children are real directories without symlink components, outside everyday VS
Code data and extension locations, and separate from disposable workspaces and
the installation. Reject home/root paths, overlapping children, personal-profile
ancestors/descendants, and ambiguous layouts even if a marker exists. Only after
those checks and review of this convention should the developer manually add the
marker. Preserve all existing contents and authentication. No copying, migration,
recreation, or new sign-in is required merely to adopt the directory. Automated
safe-path checks are still pending; the current spike checks only part of this.

For later manually authorized setup, start the dedicated instance with both
`--user-data-dir <profile_root>/user-data` and
`--extensions-dir <profile_root>/extensions`. Use its default VS Code settings
profile; do not switch to named profiles, enable Settings Sync, use remote
workspaces, or introduce workspace overrides until their precedence is qualified.
These are proposed qualification constraints, not currently enforced controls.

Manually set `editor.accessibilitySupport` to `on` in the dedicated instance's
settings. VS Code documents `on`, `off`, and `auto` in its
[accessibility guide](https://code.visualstudio.com/docs/configure/accessibility/accessibility).
The historical successful path required `on`. A user-settings file alone cannot
prove the effective value: see [settings precedence](https://code.visualstudio.com/docs/configure/settings).
The inspection must account for representation and applicable overrides before
production can pass this check. A confirmed incompatible value will block; an
unknown effective value will be a harness error. No automated settings changes
are planned.

Manually grant Accessibility permission in macOS System Settings → Privacy &
Security → Accessibility for the actual application/execution context responsible
for the run. Recheck from that context; historical grants and another terminal's
results are insufficient. The passive checks are `AXIsProcessTrusted()` and
`CGPreflightPostEventAccess()`. No permission prompt is automated. Apple Events,
Screen Recording, and input-event listening are unused by the selected path and
are not setup prerequisites. A denied required capability will block; missing or
inconclusive check machinery will be a harness error.

Confirm Copilot Chat is available in the dedicated instance. It can be bundled
inside VS Code; an empty dedicated extensions directory does not mean it is
missing. Manually sign in if the dedicated instance requires it; preserve an
existing working sign-in. Do not copy authenticated profiles between hosts or
automate passwords/MFA. Record confirmation without account identifiers. Extension
metadata establishes presence only; activation, disabled state, live availability,
and sign-in readiness are not established by the current spike. Runtime
authentication will remain explicitly unassessed by preflight; M1-06 owns live
sign-in detection.

After Phase 2 implementation and validation, use the existing
`ide-smoke run --ide vscode` command with an edited local config. Preflight success
will be a separately recorded stage; overall exit 4 will still be expected until
IDE operations exist. No separate public preflight command or passing smoke
tests are delivered by this draft.
