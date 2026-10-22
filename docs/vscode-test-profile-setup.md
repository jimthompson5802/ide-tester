# Dedicated VS Code test profile safety setup

M1-02 implements read-only profile safety under the existing desktop run lock.
The path/marker policy was qualified and Phase 1 developer validated on 2026-10-21.
Phase 2 adoption was explicitly authorized and completed on 2026-10-21; the real
standalone safety check passed. Real installed-console verification and final evidence consolidation are complete.
Phase 2 is complete and developer validated on 2026-10-21. See the [plan](implementation-plans/M1-02.md)
and [Phase 2 findings](reports/M1-02-phase2.md).

The required dedicated layout is:

```text
profile_root/
  .ide-smoke-profile.json
  user-data/
  extensions/
```

The qualified strict-JSON marker contains only
`{"schema_version": 1, "purpose": "ide-smoke-dedicated-vscode"}`. It records
explicit dedication to testing and never authorizes deleting the profile.
It must be a singly linked regular UTF-8 file of at most 4096 bytes, without a
symlink. Key order and JSON whitespace may vary. Both keys are required exactly
once; unknown/duplicate keys, nonstandard constants, invalid JSON/UTF-8, unsupported
versions, and wrong types are rejected. `schema_version` must be integer `1`;
boolean `true` and decimal `1.0` are invalid. Inspection opens only this marker,
read-only with no-follow/nonblocking flags; it never reads settings or credentials.

## Independently qualified path rules

The production checker accepts a root, explicit home and protected paths, and
checkout context. Guarded runs supply the actual editable source checkout.
It rejects a root containing `..`, symlink components (including dangling links
and loops), missing resources, and wrong kinds. Root and both fixed children must
be real directories with distinct filesystem identities. The marker must also
have a distinct identity. Fixed children are siblings; aliases between them are
rejected without enumerating their contents.

The filesystem root, home, and ancestors of home are rejected. Other children of
home may be dedicated profiles. Protected paths reject both ancestor and descendant
overlap, including equality, resolved aliases, and existing directory identities
that reveal case aliases on the tested macOS filesystem. The explicit macOS
default protected set is:

- `~/Library/Application Support/Code`
- `~/Library/Application Support/Code - Insiders`
- `~/Library/Application Support/Code - Exploration`
- `~/.vscode`
- `~/.vscode-insiders`
- `~/.vscode-exploration`

Installation context protects the enclosing resolved `.app` directory, or the
resolved executable's parent for a nonbundle path. This uses path metadata only,
without running or authenticating the executable. Guarded runs use the same
first regular file selected by foundation PATH lookup, preserving its
wrong-kind/error behavior, without a second PATH selection.
Custom everyday locations must be supplied as protected context when known;
these defaults cannot discover every personal resource. M1-03 now protects the
fixed `<actual-source-checkout>/workspaces/` root in production profile admission.
Workspace creation also protects the selected profile root, enforcing separation
in both directions. Workspace location is not a configuration option.

Known unsafe/missing resources and invalid markers are `BLOCKED`. Permission or
other indeterminate metadata/read/resolve failures are `HARNESS ERROR`. Findings
contain controlled outcome/reason and resource labels in `Result.key`, never
marker contents or exception text. Interrupted inspection is allowed to propagate to the caller's
existing interruption handling. Production findings are saved in `profile_safety_checked` events; failures
also become run issues and origins for all five skipped smoke tests. Metadata inspection does not
eliminate filesystem races or authorize deletion.

## Accepted checkout rule and manual adoption

The developer accepted this rule on 2026-10-21: dedicated roots strictly beneath
`<checkout>/profiles/` are permitted; every other checkout overlap is rejected.
This permits the existing `<checkout>/profiles/m1-00` root in place. The checkout
itself, its ancestors, the `profiles` container itself, source directories, and
similarly prefixed directories such as `profiles-other` are rejected. Dedicated
profiles outside the checkout remain supported. Nested roots beneath `profiles/`
are permitted when they satisfy all other checks.

The allowance never overrides everyday-location, installation, workspace,
symlink, marker, or resource-separation rules. A symlinked `profiles` container
cannot make a source directory eligible; profile paths cannot escape through
symlinks. Filesystem identities preserve these rules through existing case aliases.
Thirteen additional tests qualify the checkout cases. Production integration
receives the actual editable-package source checkout, independently of the
caller's working directory or config location; config directories are not inferred
to be checkouts. The qualified layout is `<checkout>/src/ide_smoke/` with a `pyproject.toml` at
the checkout root. Other package layouts yield `profile_inspection_unknown`
rather than silently omitting checkout protection.

For deliberate adoption of the existing authenticated `profiles/m1-00` directory:

1. Confirm manually that the directory was created solely for these tests.
2. Validate the root and children as real directories without symlink components,
   outside everyday VS Code data/extension locations and their ancestors or
   descendants. Reject home/root paths and unsafe overlap with the checkout,
   installation, disposable workspaces, or between children, using the independent
   rules above and the accepted checkout policy. For an unmarked profile, the
   expected read-only finding is solely `profile_missing` for `marker`, after
   every preceding path/layout check passes. That result permits consideration
   of deliberate adoption; it is not a full profile-safety pass.
3. After deliberate dedication confirmation and applicable authorization, manually
   add the exact marker to the previously unmarked root, without overwriting any
   existing file. Preserve all existing contents and authentication in place.
   Rerun the read-only check and require `profile_safe`. A missing marker blocks
   full validation; an invalid existing marker requires manual review, not automatic
   replacement. Indeterminate inspection must be resolved before adoption.
4. Configure `ides.vscode.profile_root` in the local YAML to use this dedicated
   root and select an existing executable path. Run `.venv/bin/ide-smoke run
   --ide vscode --config config/harness.local.yaml` from the checkout. Profile
   checks inspect narrowly and read-only. Missing/unsafe layouts or invalid
   markers block (exit 3); indeterminate access is a harness error (exit 4).

Profile adoption requires no copying, migration, recreation, settings changes,
or new sign-in. Do not inspect credentials or automate passwords/MFA. Preflight
does not create or repair the profile or marker. Disposable-workspace cleanup
must preserve this persistent profile.

Phase 1 performed steps involving read-only path/layout qualification only. It
neither confirmed dedication on the developer's behalf nor created the real
marker. The later Phase 2 follow-up confirmed dedication and explicitly authorized agent
marker creation. The marker now exists and the standalone real-profile check
passes; installed-console verification is also complete. Final consolidation is complete; developer acceptance was received on 2026-10-21.

Executable identity/runnability, session and permission checks, desktop lock
state, accessibility settings, Copilot inventory/availability, authentication,
and new readiness dependencies are out of scope for M1-02. This guide does not
qualify them. Future GUI runs still require an unlocked, exclusively reserved
desktop; profile validation supplies no GUI-readiness guarantee.

The existing `ide-smoke run --ide vscode` command
records profile-safety validation separately. M1-02 itself establishes no passing smoke test or separate public preflight
command. Production T01 behavior is described below; exit 4 remains expected
while T02–T05 are unimplemented.


## Manual marker creation

After the dedication confirmation and a read-only result solely identifying the
missing marker, create the marker manually with an editor or an exclusive-create
operation. For the existing profile, the exact target is
`profiles/m1-00/.ide-smoke-profile.json` relative to the checkout. Do not overwrite
an existing file. Use exactly:

```json
{"schema_version": 1, "purpose": "ide-smoke-dedicated-vscode"}
```

A new profile requires deliberate manual creation of the root and both fixed
children at a safe dedicated path before adding its marker. An existing profile
requires only the marker after path/layout qualification; preserve its contents.
Review any rejected path or existing invalid marker manually. Never repair a
personal profile to make it eligible. On this host `/usr/local/bin/code` is an
available CLI path for basic resource checks; this guide does not qualify its
runnability. The example executable path must be edited to match the host.


## Production T01 launch requirements

M1-04 Phase 2 runs T01 through the public CLI and is complete and developer
validated on 2026-10-21. See the [execution evidence](reports/M1-04-phase2.md). The qualified
combination is macOS 15.7.9, Python 3.12.15 arm64, PyObjC 12.2.2 and VS Code
1.135.0 at `/Applications/Visual Studio Code.app/Contents/MacOS/Code`. Select
that native executable; the `code` wrapper is an unsupported prerequisite.
The selected bundle/executable and matching bundle/product version metadata are
validated without substituting another installation.

Reserve the unlocked desktop and dedicated profile exclusively for the entire
run. Establish Accessibility permission and a visible graphical session manually.
The harness checks trust/session and refuses observed profile conflicts before
spawn. It inspects registered Code applications and same-user processes matching
the selected executable; unregistered alternate installations are not comprehensively
detected. These checks cannot establish exclusive reservation.

The complete Darwin IPC path `<profile>/user-data/<version[:4]>-main.sock` must
encode to fewer than 103 filesystem bytes, including suffix; use a short dedicated
profile path. The persistent `profiles/m1-00` remains admitted unchanged. No
profile creation, settings repair, sign-in or credential copying is automated.

Version lookup, launch and readiness share one absolute startup deadline from
`ide_startup_seconds`. Native calls use isolated workers bounded to 3 seconds
or remaining time, requested AX timeout 0.2 seconds, exhaustive traversal up to
600 nodes, and pauses up to 0.05 seconds between observations. Controller process
creation is synchronous and not interruptibly bounded; there is no hard real-time
launch guarantee. The positively owned app receives acknowledged
`AXManualAccessibility` once, without persistent settings changes.

T01 passively checks one owned workbench window with an exact workspace-basename
title component plus full process workspace argument and AXWebArea/AXOutline/AXToolbar.
Modal or unknown dialogs remain untouched and cannot pass. T01 establishes neither
editor usability nor authentication; T02–T05 remain unimplemented. A successful
T01 stores version and duration but the incomplete suite returns 4. Controlled
prerequisites return 3; readiness/ownership/native errors return 4. An in-operation
interrupt saves T01 HARNESS ERROR/interrupted with duration, skips dependents and
returns 130 unless cleanup/evidence failure requires 4.

Cleanup uses a fresh 10-second bound and app-specific graceful shutdown after
revalidating the current original owner. It observes the main process, current
session and previously observed birth identities, including observed reparenting.
Unseen detached-child completeness and automatic recovery remain deferred.
Every workspace whose session entered launch is retained regardless of
`retain_on_failure`, normally as `gui_exit_scope_limited`. The flag stays truthful
in the manifest; retention alone creates no cleanup error. Cleanup uncertainty
preserves results/resources, records a separate cleanup error and returns 4.
Local console diagnostics may show only current-owner PID/birth/workspace for
manual inspection; saved artifacts confer no termination/deletion authority.
Preserve retained profiles/workspaces; no stale sweep or forced kill is provided.
