# Dedicated VS Code test profile safety setup — draft

M1-02 is limited to profile safety by the developer's 2026-10-21 scope revision.
The path/marker rules below have synthetic and host Phase 1 evidence, including
the developer-accepted checkout rule. Phase 1 was developer validated on 2026-10-21;
the developer explicitly instructed that Phase 2 must not start yet.
Production profile-safety checks are not implemented. See the
[plan](implementation-plans/M1-02.md) and [historical findings](reports/M1-02-phase1.md).

The proposed dedicated layout is:

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

The spike accepts a root, an explicit home path, explicit protected paths, and
an optional checkout context. Complete host checks supply the checkout context;
omitting it is suitable only for isolated rule qualification.
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
without running or authenticating the executable. Phase 2 must use the same
first regular file selected by existing foundation PATH lookup, preserving its
wrong-kind/error behavior; the spike helper accepts an explicit file path only.
Custom everyday locations must be supplied as protected context when known;
these defaults cannot discover every personal resource. No workspace path exists
in current configuration. Explicit workspace context can be protected with the
same overlap rule; M1-03 must ensure mutual separation when adding workspace
lifecycle, without adding its configuration in this story.

Known unsafe/missing resources and invalid markers are `BLOCKED`. Permission or
other indeterminate metadata/read/resolve failures are `HARNESS ERROR`. Findings
contain controlled outcome/reason/resource labels, never marker contents or
exception text. Interrupted inspection is allowed to propagate to the caller's
existing interruption handling. These are spike findings; production `Result`
reasons and guarded integration belong to Phase 2. Metadata inspection does not
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
will receive the actual editable-package source checkout, independently of the
caller's working directory or config location; config directories are not inferred
to be checkouts. Supporting a different installation layout requires a defined
checkout-context source rather than silently dropping this comparison.

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
4. Configure the harness to use this dedicated root. Once implemented, profile
   checks will inspect narrowly and read-only. Missing/unsafe layouts or invalid
   markers will block; indeterminate access will be a harness error.

Profile adoption requires no copying, migration, recreation, settings changes,
or new sign-in. Do not inspect credentials or automate passwords/MFA. Preflight
will not create or repair the profile or marker. Disposable-workspace cleanup
must preserve this persistent profile.

Phase 1 performed steps involving read-only path/layout qualification only. It
neither confirmed dedication on the developer's behalf nor created the real
marker. The current host has the expected missing marker; actual manual adoption
and successful real-profile validation remain Phase 2 prerequisites.

Executable identity/runnability, session and permission checks, desktop lock
state, accessibility settings, Copilot inventory/availability, authentication,
and new readiness dependencies are out of scope for M1-02. This guide does not
qualify them. Future GUI runs still require an unlocked, exclusively reserved
desktop; profile validation supplies no GUI-readiness guarantee.

After Phase 2 implementation, the existing `ide-smoke run --ide vscode` command
will record profile-safety validation separately. Overall exit 4 remains expected
while IDE operations are unimplemented. No passing smoke tests or separate public
preflight command are delivered by this story.
