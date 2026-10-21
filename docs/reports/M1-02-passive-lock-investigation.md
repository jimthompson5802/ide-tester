# M1-02 — passive unlocked-session investigation, 2026-10-21

> **Current scope — 2026-10-21:** The developer subsequently limited M1-02 to
> profile safety. This investigation and its subsequent limited-snapshot decision
> are historical; session/permission/lock qualification is now out of scope.
> The [current plan](../implementation-plans/M1-02.md) governs remaining work.


The developer authorized continued investigation of an automated passive check
after reviewing the [partial Phase 1 report](M1-02-phase1.md). This follow-up
examined primary Apple documentation and existing Apple SDK headers. It did not
find a documented, unprivileged passive snapshot that establishes that the
intended graphical session is currently unlocked. This is a bounded research
conclusion, not proof that no such mechanism exists anywhere.

The investigation initially left the plan unchanged. After reviewing these
findings, the developer accepted a limited prerequisite snapshot and deferred
automated screen-lock detection; see the [subsequent decision](#subsequent-developer-decision--2026-10-21).
An undocumented heuristic has not been adopted, and Phase 2 has not started.
The previous host observations remain the only runtime observations; this
follow-up performed source inspection only.

## Candidates and disposition

| Candidate | Primary evidence | Qualification decision |
| --- | --- | --- |
| Core Graphics caller-session dictionary | Apple's [documented session keys](https://developer.apple.com/documentation/coregraphics/window-server-session-properties) and local `CGSession.h` expose user identity, console set, on-console status, and completed login. | Useful existing prerequisite signals. None of the documented keys reports screen-lock state. A completed login must not be classified as unlocked. |
| Security `SessionGetInfo` | [Security sessions API](https://developer.apple.com/documentation/security/sessions) and local `AuthSession.h`: attributes describe root session, graphics availability, TTY, and remote session; header describes attributes as established at session creation. | Does not supply a current lock-state attribute. A true graphics-access flag is not enough to pass an unlocked-state check. No Security API was invoked. |
| Workspace active/inactive notifications | [`sessionDidResignActiveNotification`](https://developer.apple.com/documentation/appkit/nsworkspace/sessiondidresignactivenotification) is documented for a session switching out; the counterpart reports switching in. | No documented guarantee that every screen lock is a session-switch event. Notifications also do not by themselves supply the initial lock state of an already running session. No observer was installed. |
| AppKit protected-data property and notifications | [`isProtectedDataAvailable`](https://developer.apple.com/documentation/appkit/nsapplication/isprotecteddataavailable) exists; local `NSApplication.h` declares availability from macOS 12.0. [Apple DTS discussion](https://developer.apple.com/forums/thread/850327) distinguishes protected-data/keybag state from direct screen-lock state. | A public passive property, but no documented equivalence to the required unlocked graphical-session snapshot was established. Reading it would add an observation without resolving that semantic gap, so no runtime probe was added. No protected file or credential was accessed. |
| Endpoint Security LoginWindow lock/unlock events | [`es_event_lw_session_lock_t`](https://developer.apple.com/documentation/endpointsecurity/es_event_lw_session_lock_t) and local `ESMessage.h` describe explicit session lock/unlock events. [Client documentation](https://developer.apple.com/documentation/endpointsecurity/client) and local headers describe entitlement, root, and TCC requirements. | These are actual documented lock events, but not the small unprivileged snapshot needed here. A new subscriber still needs an initial state and correct graphical-session association. Privileged monitoring infrastructure is outside the authorized design; no client was created. |
| Active display, awake screen, frontmost app, Accessibility trust, event-posting permission | [`CGDisplayIsActive`](https://developer.apple.com/documentation/coregraphics/cgdisplayisactive%28_%3A%29) concerns display drawing availability; existing checks cover caller permissions and session visibility. | These concepts do not establish screen-lock state. No display/window enumeration or input probe was performed. |
| `CGSSessionScreenIsLocked`, `IOConsoleLocked`, and distributed lock notification names | No declaration of the two lock-property names was found in the public CoreGraphics, AppKit, IOKit, or Security header trees searched in the installed macOS 15.2 SDK. [Apple DTS](https://developer.apple.com/forums/thread/850327) describes commonly circulated lock/unlock notifications as implementation details. | Potential empirical heuristics, not qualified documented mechanisms. Moving a property read to IORegistry does not establish documented semantics. Neither absence of a key nor failure to read it may silently mean unlocked. No private property was queried. |

The Apple forum thread concerns another application's requirements. Its DTS
reply is primary guidance about protected-data state and notification support;
the original poster's unconfirmed observations are not treated as Apple API
guarantees. In particular, the thread does not establish that the protected-data
property is equivalent to unlocked state for macOS 15.7.9 or this invocation.

## Additional documented permission finding

The installed Apple `CGEvent.h`, lines 404–405, documents
`CGPreflightPostEventAccess()` as checking whether the calling process already
has event-synthesis access. The neighboring request function is separately
described as potentially prompting. This resolves the earlier inability to read
the web page's explanatory prose: the nonprompting preflight call is appropriate
for a permission snapshot. It still does not establish delivery of an event,
control of an IDE, or screen-unlocked state. No new permission observation was
made and no requesting function was called.

## Source provenance and checks actually performed

Existing SDK root:
`/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk`, identified by its
`SDKSettings.json` as **macOS 15.2**. This is a documentation source; it is not the
qualified runtime host version, which remains macOS 15.7.9. The tools were already
present. No compiler was invoked or installed, and no dependency was installed.

Read directly:

- `CoreGraphics.framework/Headers/CGSession.h` and `CGEvent.h`.
- `AppKit.framework/Headers/NSApplication.h` and `NSWorkspace.h`.
- `Security.framework/Headers/AuthSession.h`.
- `usr/include/EndpointSecurity/ESMessage.h`, `ESTypes.h`, and `ESClient.h`.

The framework paths above are under the SDK's `System/Library/Frameworks`.
The narrow lock-name search covered public header trees for CoreGraphics,
AppKit, IOKit, and Security. A search with no matches limits what can be claimed
about that SDK; it does not prove an implementation property never exists.

Ignored `reports/m1-02/passive-lock-source-audit.json` retains the SDK version,
eight inspected header paths, SHA-256 fingerprints, and relevant symbol line
numbers. It contains no runtime session data. Web documentation and Apple staff
guidance are linked beside the conclusions they support. Where web pages did not
expose prose through the reader, local public headers supplied the evidence.

No runtime probe was justified after the candidate's documented meaning failed
the requirement. Consequently no lock acquisition, host escalation, security
settings changes, screen lock/unlock, user switching, GUI interaction, unrelated
window inspection, Keychain access, or profile access occurred in this follow-up.
No production or spike code changed; runtime tests were not rerun for these
documentation-only changes. The earlier **147 passing tests** remain historical
Phase 1 evidence, not validation of a new lock detector.
Follow-up documentation validation passed for 83 relative links/anchors across
seven affected documents, whitespace, and `git diff --check`.

## Consequence at the end of the investigation

P1-03 remained unresolved under the then-current requirement for a documented automated
passive unlocked-state check. No passing readiness result should be emitted from
the signals qualified so far. Unknown lock state remains a harness error under
the plan, with no IDE operations following it.

More searching without a concrete new candidate is unlikely to be productive.
The practical next decision identified was a reviewed plan change: either permit per-run
human confirmation alongside the documented passive checks, or authorize empirical
qualification of an explicitly unsupported lock-state heuristic. The latter would
need a separately reviewed observation protocol, including manually controlled
locked/unlocked cases on this host, session association, strict unknown-state
handling, and requalification boundaries. Such experiments are not authorized by
this investigation and were not performed. Even successful observations would
establish tested behavior, not a documented Apple contract.

## Subsequent developer decision — 2026-10-21

The developer accepted the available signals as good enough for now and
authorized revisions documenting the implications and risks. The
[revised plan](../implementation-plans/M1-02.md#accepted-limitation-and-risks--2026-10-21)
accepts a limited console/login/current-user and permission snapshot, alongside
the other required checks, with **screen-lock state explicitly unassessed**.
Automated detection is deferred; the unassessed state alone will not block or
error an eventual preflight run. The research conclusion above is unchanged:
no documented automated unlocked-state detector was qualified.

An unlocked, exclusively reserved desktop remains an operating requirement.
No private-key heuristic, privileged monitor, or new per-run CLI confirmation
mechanism is adopted. The accepted risks are passing preflight on a locked
desktop, reduced unattended GUI reliability, uncertain environmental causes of
later timeouts, input-focus interference, and overinterpreting preflight success.
The plan records handling for each risk, including explicit reporting and later
owned-target/interaction verification.

The other Phase 1 executable/profile/settings/inventory and controlled-case work
remains pending. Accepting the lock-state limitation does not complete Phase 1,
authorize Phase 2, validate Slice 1, or establish authentication or IDE usability.
