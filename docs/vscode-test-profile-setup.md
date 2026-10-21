# Dedicated VS Code test profile safety setup — draft

M1-02 is limited to profile safety by the developer's 2026-10-21 scope revision.
This proposed procedure awaits remaining Phase 1 qualification and validation.
Production profile-safety checks are not implemented. See the
[plan](implementation-plans/M1-02.md) and [historical findings](reports/M1-02-phase1.md).

The proposed dedicated layout is:

```text
profile_root/
  .ide-smoke-profile.json
  user-data/
  extensions/
```

The proposed strict-JSON marker contains only
`{"schema_version": 1, "purpose": "ide-smoke-dedicated-vscode"}`. It records
explicit dedication to testing and never authorizes deleting the profile.
The exact marker and protected-path rules require Phase 1 validation.

For deliberate adoption of the existing authenticated `profiles/m1-00` directory:

1. Confirm manually that the directory was created solely for these tests.
2. Validate the root and children as real directories without symlink components,
   outside everyday VS Code data/extension locations and their ancestors or
   descendants. Reject home/root paths and unsafe overlap with the checkout,
   installation, disposable workspaces, or between children. Exact comparisons
   remain qualification work; the current spike checks only part of this.
3. After safety validation and review of the convention, manually add the marker.
   Preserve all existing profile contents and authentication in place.
4. Configure the harness to use this dedicated root. Once implemented, profile
   checks will inspect narrowly and read-only. Missing/unsafe layouts or invalid
   markers will block; indeterminate access will be a harness error.

Profile adoption requires no copying, migration, recreation, settings changes,
or new sign-in. Do not inspect credentials or automate passwords/MFA. Preflight
will not create or repair the profile or marker. Disposable-workspace cleanup
must preserve this persistent profile.

Executable identity/runnability, session and permission checks, desktop lock
state, accessibility settings, Copilot inventory/availability, authentication,
and new readiness dependencies are out of scope for M1-02. This guide does not
qualify them. Future GUI runs still require an unlocked, exclusively reserved
desktop; profile validation supplies no GUI-readiness guarantee.

After Phase 2 implementation, the existing `ide-smoke run --ide vscode` command
will record profile-safety validation separately. Overall exit 4 remains expected
while IDE operations are unimplemented. No passing smoke tests or separate public
preflight command are delivered by this story.
