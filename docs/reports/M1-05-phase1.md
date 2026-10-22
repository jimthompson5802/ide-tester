# M1-05 Phase 1 — Editor qualification

Date: 2026-10-21. Status: **M1-05 ON HOLD by developer direction. Phase 1 is
incomplete and unaccepted.** Preserve the partial work while the developer
rethinks T02/T03. M1-06 is the intended next story; explicit approval is required
before any M1-06 work. Historical execution details below are not instructions
to resume either story.

Subsequent separately requested regression checks passed 544 non-GUI tests and
all nine existing T01 host checks; see the
[post-hold regression report](post-hold-regression-checks.md). These checks did
not resume native M1-05 qualification or start M1-06. Earlier counts below remain
historical evidence from the hold checkpoint.

The developer authorized Phase 1 with TDD and subagents, renewed exclusive
unlocked desktop and `profiles/m1-00` reservation, and confirmed inert probe
orchestration and worker request/reply validation as the test seams. Ordinary
pytest must never launch the GUI. Phase 2 remains unauthorized.

## Hold checkpoint — 2026-10-21

The developer stopped work and selected M1-06 next, explicitly withholding
authorization to start it. All subagent work is stopped. No M1-06 plan,
investigation, implementation or GUI work was started. This sequencing exception
does not accept M1-05 or Slice 2. M1-05 must also await explicit direction to resume.

Preserved uncommitted implementation:

- `scripts/spikes/m1_05/qualify_editor.py`: revised inert orchestration for New →
  entry → Save As `created.py` → independent safe disk read, through existing
  admission/ownership/cleanup seams. It is an unfinished qualification probe.
- `scripts/spikes/m1_05/editor_worker.py`: bounded opt-in worker and controlled
  diagnostics. Native entry/Save As remain unavailable. A final proposed New fix
  drains the sender run loop for 0.2 seconds after a single guarded Cmd+N pair.
  **That fix is inert-tested only and has not been host-tested.**
- `tests/unit/test_m1_05_qualification.py` and `test_m1_05_worker.py`: current
  focused results reported by subagents are 18 controller and 15 worker tests
  passing; controller/M1-04/T01 regressions passed 115 tests. These do not prove
  native editor behavior. The last full suite was **541 passed in 12.84s**, before
  the revised new-document workflow; no full-suite rerun is claimed for current code.

Actual host outcome: the old Quick Open sequence never established input focus.
The revised sequence's menu and keyboard actions did not establish an untitled
document; the developer visually confirmed no untitled editor appeared. A focused
empty AXTextArea alone is insufficient and may be Chat. No predefined text,
file edit, Save As or disk-persistence success was demonstrated.

Final read-only hold audit, after stopping:

- All **17** saved attempt manifests match their summaries; workspaces are retained,
  original `example.py` bytes are unchanged, `created.py` is absent, and every
  recorded cleanup is PASS. Saved audit: `.ide-smoke/m1-05/hold-state.json`.
- Exact profile settings bytes match the original private backup. The temporary
  accessibility setting is restored to its original unset state.
- Final production read-only profile preflight found no dedicated-profile conflict;
  the run guard was reacquired/released. No IDE was launched for these checks.
  Observed cleanup retains the accepted detached-child accounting limitations.
- Desktop/profile reservation is released. No dependencies or production default
  operations changed. Public T01 remains implemented; T02–T05 remain unavailable.

Preserve ignored `.ide-smoke/m1-05/` drivers, configs, diagnostics and private
settings backup, plus `reports/<run-id>/` and retained workspaces. Do not publish
the settings backup or raw diagnostics. No commit, issue update or PR was made.
The revised sequence below and its remaining selectors/Save-dialog questions are
suspended proposals, not a commitment to continue before the developer's rethink.
Hold-documentation checks passed: 93 local Markdown links/anchors, balanced code
fences and `git diff --check`. No new runtime tests or GUI probes were run after
the stop instruction; only read-only resource checks and documentation updates.

## Current sequence revision — 2026-10-21

After reviewing the old sequence, the developer directed: open an editor pane,
enter predefined text, save it to a file in the workspace root, then confirm
its contents on disk. The developer renewed exclusive desktop/profile reservation.
This is guidance for a revised Phase 1 approach; no fifth Quick Open fix is
authorized or attempted. Historical failures and checks below remain unchanged.

Revised observable checks, before adapting the probe:

1. In the owned session, create a new empty untitled text document and verify its
   editor identity/focus. The workspace-root `created.py` destination is absent.
2. Enter `message = "edited by ide-smoke"\n` through the editor; verify exact UI
   readback, dirty untitled state and destination still absent.
3. Invoke Save As through the IDE, qualify the expected owned Save dialog and
   exact `<current-workspace>/created.py` destination, then verify that saved
   path is the active document. Refuse overwrite prompts.
4. Independently read exact UTF-8 bytes using the admitted directory identity
   and bounded read-only inspection. Repeat in a second fresh workspace.

The manager's existing `example.py` remains untouched; reports must distinguish
that original fixture target from the new output. Untitled-document identity
replaces existing-path identity before Save As; exact full path is required after
saving. The source story's existing-file AC1 is superseded for this execution
and will not be claimed as verified. Production T02/T03 remain unavailable.
Existing inert orchestration/worker validation seams remain the confirmed test
boundaries, with their observable sequence updated. Original settings are restored;
no further setting changes are authorized by this sequence revision itself.

Revised controller TDD first reproduced the obsolete `example.py` target guard,
then implemented New → empty untitled readback → text entry → dirty untitled and
destination absent → Save As → exact active destination → independent disk read.
Eighteen focused controller tests and 115 controller/M1-04/T01 regressions passed.
These are inert simulations; native entry/Save As remain disabled until targeting
and the Save dialog are qualified.

Initial revised host investigation (same ignored driver command below):

| Run ID | Result |
| --- | --- |
| `58ffb94578a449de86116a0207a55adf` | New Text File menu action returned success; no untitled identity/dirty state established; bounded observation timeout. |
| `857cb84bebf4468bb9895f3b971ae2c2` | Controlled structural diagnostics found no recognized Untitled token, absent window AXDocument, empty focused text area and unknown AXEdited. This does not identify an editor. |
| `a8cbfa6de991495f8dc1e906054e7f60` | First new-document fix explicitly opened File menu before New Text File; still no untitled identity. |
| `9b7747f975684dcfadf2b395e80e9cb4` | Second fix used one guarded session Cmd+N pair; still no untitled identity. No text entered. |

The session-key mechanism rechecks full process/workspace/window/modal ownership,
frontmost PID and focused owned window before each event. Check and delivery are
separate OS calls, leaving a residual focus race; acceptance at the Phase 1 gate
is required before adopting this mechanism in production. A read-only host check
confirmed AX trust, event-posting and event-listening access, with no active
Command modifier. Settings remain unchanged. Each revised attempt so far closed
the owned instance and passed the narrow preservation/guard checks. The first
used a 30-second operation budget; subsequent discovery uses 8 seconds, with the
existing 3-second/remaining-deadline worker cap. No saved output is claimed.

## P1-01 baseline and observable checks

Read the M1-04 plan and Phase 2 evidence, profile setup guide, existing discovery
spike, production worker/session/IDE/orchestrator, local config, story and proposal
contracts. The current checkout was clean before execution.

Read-only checks found macOS 15.7.9 arm64, Python 3.12.15 arm64, VS Code 1.135.0,
and the five installed PyObjC 12.2.2 distributions. The approved host permission
check reported Accessibility trusted and a visible graphical session. The
dedicated profile and its existing marker will be preserved. Local configuration
selects the unsupported `code` wrapper; a separate ignored probe config will
select `/Applications/Visual Studio Code.app/Contents/MacOS/Code`.

Narrow read-only inspection of `user-data/User/settings.json` found no explicit
values for `files.autoSave`, `editor.accessibilitySupport`, `files.encoding`,
`files.eol`, `files.trimFinalNewlines`, `files.insertFinalNewline`,
`files.trimTrailingWhitespace`, or `editor.formatOnSave`. Unset values do not
prove effective settings; dirty-state and UI readback qualification remain required.
No settings changed and no credentials or conversations inspected.

Before probe implementation, define these required observable checks:

- One newly admitted fixture initially contains `message = "original fixture"\n`.
- The owned process/window/workspace and full generated file path are identified;
  the intended editor is focused before editing and Save.
- Replacement occurs through the IDE; readback matches
  `message = "edited by ide-smoke"\n` and dirty state is observed while disk still
  contains original bytes, before a qualified explicit Save action.
- A separate bounded read observes exact edited bytes after Save.
- A second fresh fixture starts with original bytes and repeats the successful
  sequence without modifying the retained predecessor.
- Original-owner cleanup, regular-window fingerprints, narrow profile metadata,
  outside synthetic sentinel, retained workspace/manifest agreement and guard
  reacquisition are verified. No raw UI trees/titles are committed.

Missing host evidence will remain incomplete. This phase adds no production
default operations or dependencies and makes no Copilot requests.

## Probe TDD and initial host investigation

Subagents implemented an inert controller and strict opt-in worker validation;
a separate read-only review checked targeting, focus and disk authority. Controller
red/green cycles covered the missing successful sequence, uncertain targeting,
asynchronous Open, invalid process identity, replaced fixture directory and
admitted reruns. Sixteen controller tests and three initial worker tests passed.
The controller plus M1-04 qualification/T01 regressions passed 113 tests in 9.13s.
These are inert results, not proof of native editing.

Host command, sequentially under the renewed reservation and sandbox approval:

```sh
.venv/bin/python .ide-smoke/m1-05/host.py
```

The ignored driver invokes the tracked opt-in probe via `run_attempt()` using a
native-executable config at `.ide-smoke/m1-05/harness.yaml`. Its synthetic outside
sentinel and controlled results are in the same ignored directory. The first
five attempts established a stale Accessibility observation error; none replaced
or saved file contents:

| Run ID | Observation |
| --- | --- |
| `61881bacc2e240a0bb2d0d52a691dd99` | T01 PASS; editor observation HARNESS ERROR. |
| `0d3b94681fc9491f88d87b7403a95c00` | T01 HARNESS ERROR before editor operation. |
| `7d7e36e0c863437a928c280a63e756f5` | T01 PASS; editor discovery AX attribute error. |
| `c971bcb3c5124dc6be85b10ab65259b2` | Discovery succeeded; subsequent Open ownership reobservation failed. |
| `fedd17575207467d9b3337972aded27b` | Discovery captured `AXRole`, numeric error `-25202`. |

The installed framework identifies `-25202` as `kAXErrorInvalidUIElement`.
Discovery observed one owned window and an initially focused text area, but no
generated-target path match; this does not qualify an active file. Diagnostic
instrumentation recorded only fixed attribute names/numeric errors, never raw UI
values. Failed observations remain failed. The proposed next fix is a bounded
retry of a fresh read-only ownership snapshot only on this identified stale
element error; mutating actions must never be replayed after uncertain completion.

Every attempt above reported observed owned shutdown, unchanged regular-window
fingerprints (one unrelated window), unchanged narrow persistent-profile metadata,
unchanged outside sentinel and successful guard reacquisition. Reports and
retained workspaces are under `reports/<run-id>/` and the manifest-selected
workspace paths. These narrow checks do not establish arbitrary profile-content
integrity or complete detached-child accounting. No editor-update/Save success
is claimed.

Subsequent diagnostic/fix checks:

- `9c636a13811247178dfd8dbb9980f41d`: first stale-element fix retried a complete
  native ownership observation within 0.4 seconds; custom discovery still failed
  on a stale AX element. This fix round did not resolve the error.
- `71047a172a3d4025a4f710b1cf6c31e2`: second fix extended fresh read-only retries
  to whole discovery/inspection requests, never Open/replace/Save. Discovery
  succeeded but Open could not establish its expected control.
- `2829d84070e842a5af8fc1f5208c7b6b`: diagnostic rerun showed broad discovery
  still encounters stale `AXDocument` elements; the second fix is insufficient.

Twenty-two focused inert tests passed after these changes. Required ownership
predicates remain unchanged; actual replacement and Save remain unavailable.
The third proposed fix narrows optional diagnostic traversal and uses the owned
application's actual focused element with exact owned-window path association,
preserving full lifecycle ownership/modal checks. The four-unsuccessful-fix-round
limit applies; no fifth attempt is permitted without developer guidance.

The third stale-element fix narrowed optional traversal and qualified the focused
element directly. Run `0d76593de7934fce874fb7f87ca563a2` reached Quick Open but
failed the focused-input assertion; no stale-element error was reported. A
controlled structural observation found exactly one empty `AXTextField` with
the known Quick Open label and owned-window association, while only an
`AXStaticText` element reported focus.

The first input-focus fix used a scoped AX focus request to that uniquely
identified field. Run `c3d3406be9f144c7bfd0c956ce528085` still reported
`input_focus_unqualified`; no path text followed. The developer then explicitly
authorized temporary `editor.accessibilitySupport=on` and exact restoration of
the formerly unset value. Original bytes are privately preserved in ignored
`.ide-smoke/m1-05/settings-before.bin`. Run
`6bb6d1992c4e44fcb563fd6be0a3980c` with the setting reported AX setter success
(`0`) but immediate focus readback false; this setup hypothesis did not resolve
focus. The next fix will wait boundedly for that one request's asynchronous
completion, without repeating it. Replacement and Save remain disabled.

The full non-GUI regression command `.venv/bin/python -m pytest -q` passed
**538 tests in 13.26s** at this checkpoint. A follow-up disk safety review added
red/green checks for replacement during a read, a new hard-link alias and parent
replacement. The verifier rechecks the current directory entry/parent identity,
single-link regular-file status and opened inode before accepting bytes.
Focused controller/M1-04/T01 regressions passed **116 tests in 8.67s**.

## Four unsuccessful input-focus fixes — guidance checkpoint

Error: `input_focus_unqualified`. Quick Open's single empty field has the
expected known label and owned-window association, but focus reads false.
The input's supported AX actions can return success without establishing focus.
The probe refuses to enter any path text under that uncertainty.

| Fix round | Proposed fix and host run | Actual result |
| --- | --- | --- |
| 1 | Scoped `AXFocused=True` on the uniquely identified field; `c3d3406be9f144c7bfd0c956ce528085` | Focus unqualified; no path entered. |
| 2 | Developer-authorized `editor.accessibilitySupport=on`; `6bb6d1992c4e44fcb563fd6be0a3980c` | Setter returned `0`, immediate focus readback false. |
| 3 | Bounded asynchronous confirmation of that one focus request; `16b74c30dda2421e86fe5d12258ab030` | Focus remained false. |
| 4 | Supported scoped `AXPress`, once, followed by bounded confirmation; `1ac6d5e90d904b34ae80dd24ffa668cb` | AXPress returned `0`; focus remained false. |

No fifth focus fix or alternative workaround was attempted. The separate earlier
stale-element investigation is historical and did not establish input focus.
M1-05 P1-01 is complete; P1-02 is partial; P1-03/P1-04 and developer validation
remain unchecked. Native replacement/Save are intentionally unimplemented and
fail closed. No actual file update/Save, production T02/T03 or Phase 2 acceptance
is claimed. The next required decision is developer guidance on further focus
investigation or a reviewed alternative mechanism; elapsed time is not permission.

Final checks:

- `.venv/bin/python -m pytest -q`: **541 passed in 12.84s** (511 previous tests,
  19 controller tests, 11 worker tests). Tests use inert system boundaries;
  simulated persistence is explicitly a test fixture action, not IDE evidence.
- All 13 host attempts' manifests match summaries, workspaces remain retained,
  fixture bytes remain exactly original, and observed cleanup is PASS.
  Read-only audit: `.ide-smoke/m1-05/final-resource-audit.json`.
- Every driver row records unchanged regular-window fingerprints, narrow profile
  metadata and outside sentinel, and successful guard reacquisition. The final
  read-only production preflight observed no dedicated-profile conflict and the
  guard was reacquired/released again.
- Exact original settings bytes were restored from the private backup and
  compared equal. `editor.accessibilitySupport` is unset again. The hypothesis
  did not qualify a required editor setting.
- GUI qualification is stopped, no owned test instance remains observed, and
  the exclusive desktop/profile reservation is released. No dependencies,
  production default operations, configuration schema or authenticated marker
  changed. No credentials, conversations, raw trees/titles or screenshots are
  committed. Observed cleanup retains M1-04's detached-child limitations.

Diagnostics: `.ide-smoke/m1-05/host-results.jsonl`,
`.ide-smoke/m1-05/open-checkpoints.jsonl`,
`.ide-smoke/m1-05/attribute-errors.jsonl`, and
`reports/<run-id>/{summary.json,events.jsonl,workspace.json,qualification-editor.json}`.
The exact host command is recorded above. Backup settings remain private/ignored;
do not publish them. Changes are uncommitted for review.

Documentation verification: 39 local Markdown targets/anchors across the plan,
report and AGENTS.md passed; code fences balanced and `git diff --check` passed.
