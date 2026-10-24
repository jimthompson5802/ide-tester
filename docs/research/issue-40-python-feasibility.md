# Issue #40 Python feasibility procedure and review record

Prepared 2026-10-24 for [phase 1 of the implementation plan](../implementation-plans/issue-40-python-smoke-test.md). **P1-T01 partial: disposable-fixture guard checks pass; the developer now accepts confirmed owned VS Code main-process exit as sufficient termination evidence.** Complete descendant shutdown is an accepted unverified limitation, no longer a blocker. Remaining work includes actual protected Electron launch/inheritance and the full probe controller. GUI execution remains separately gated. P1-T02/P1-T03 have not started. The full walkthrough below is not implemented or ready for execution.

## Sources inspected

- Repository `fc1d74304acfb965a82b19eaf791d9edc732fde4`; initially clean working tree.
- Neighboring VS Code checkout `68d4ae5bd0e97974ee16dda2053feb95c05371d1`, reference only.
- Installed `/Applications/Visual Studio Code.app/Contents/Resources/app/{package,product}.json`: VS Code 1.135.0, stable, commit `08d4889f9ec4a1685d257b9b95de036c8e1ce1e5`. Metadata reads establish no operational driver capability.
- [Workbench](../../smoke/src/workbench.ts): shipped-driver restoration/editor typing and editor Save As/reopen operations exist; terminal capability is absent from the local interface. `bounded` races a timeout without cancelling the operation.
- [Runner](../../smoke/src/runner.ts), [app resolution](../../smoke/src/app.ts), [resources](../../smoke/src/resources.ts): direct Electron launch and exclusive reservation exist. Cleanup observes main-process exit, without proving terminal shell/Python descendant shutdown. `finishRun` retains resources/reservation when a shutdown callback throws.
- [Git profile](../../smoke/src/git-profile.ts), [real profile](../../smoke/src/real-profile.ts), [common settings](../../smoke/src/profile.ts): ownership, redirected-path rejection, singleton checks and atomic settings merge provide reference patterns. Neither mock profile preparation nor mock backend environment construction is suitable for this walkthrough.
- External checkout `test/automation/src/{extensions,terminal,playwrightDriver}.ts` and `src/vs/workbench/services/driver/browser/driver.ts`: exact-ID extension selectors and `getTerminalBuffer` are reference candidates. The driver reads the targeted wrapper's xterm buffer as `string[]`. These are not installed-app observations.
- External checkout `src/vs/workbench/contrib/extensions/browser/extensions.contribution.ts`: boolean update settings migrate to `on`/`off`; individual opt-ins can still update with `off`. Verify the installed build's effective controls rather than assuming a global setting alone freezes every extension.
- [Earlier source review](issue-40-python-feasibility-review.md) remains background. Its proposed independent success-decoration requirement is superseded by the developer-confirmed completion-marker contract.

During initial preparation, no interpreter, extension, profile or preserved workspace was used. At that point `/usr/bin/sandbox-exec` had only been found by filesystem metadata inspection. Its subsequent disposable-fixture verification is recorded below; Electron compatibility remains untested.

## Review boundary and prerequisites

The original preparation stopped for probe-specification review. The resumed instruction authorized work on its non-GUI prerequisites. Added only the [probe](../../smoke/gui/issue-40-python-feasibility.ts) and [observable fixture tests](../../smoke/tests/python-feasibility.test.ts), alongside this record and the plan. No production module, public flag, dependency or general profile override changed. The full GUI controller remains unimplemented because its process-ownership prerequisite is unresolved.

Before execution, require explicit authorization for the probe, GUI walkthrough, feasibility profile and supplied interpreter. Proposed interpreter: `/Users/jim/Desktop/genai/ide-tester/.venv/bin/python`; its invocation requires authorization for this walkthrough, and must not be inferred from historical approvals. Presence/absolute/canonical path resolution uses filesystem operations only, without version, permission, usability or environment-identity probes.

Require an unlocked exclusively reserved desktop and the existing shared `reports/smoke/.reservation`. One session lasts **30 minutes**, including a separate **120-second cleanup period**. Stop exploration by minute 28 or earlier on an essential blocker. One scenario has an eight-minute deadline; launch is at most 60 seconds, installation readiness 180, interpreter selection 60, execution 60. Each wait uses the smaller remaining deadline. No automatic retries, second session, alternative observation mechanism or unreviewed reload path.

The unresolved protection requirement is enforcement against extension/interpreter writes to retained environment contents through the actual Electron launch. Environment variables and matching before/after hashes alone do not prove prevention. The reviewed launch procedure must establish that protection before selecting/executing Python.

The developer has removed the complete descendant-tracking requirement: confirmed exit of the owned VS Code main process is sufficient termination evidence for now. Keep bounded application cleanup and reservation retention on uncertain application exit. The accepted edge cases are recorded below; independent descendant exit must not be claimed.

## Profile, settings and environment specification

Only `profiles/smoke-python-feasibility/{user-data,extensions,state}`, with root `.owner` value `ide-tester:smoke-python-feasibility:v1`, may be prepared. Create only when absent. Reuse requires the exact marker, canonical non-redirected directories/files, valid object settings and closed-profile singleton checks. Refuse unowned, malformed, redirected or locked state; never adopt, reset, delete locks or repair databases. Merge owned settings atomically while retaining unrelated keys/state. Preserve the profile on every outcome.

Do not create, launch or modify `profiles/smoke-python`. Before and after, record its absence, or compare an existing closed profile read-only without reading authentication/conversation contents. Never use its extension installation to satisfy feasibility. Preserve all other profiles, root `.vscode/` and `reports/m1-03/preserved-workspaces/`.

Proposed owned settings, subject to installed schema inspection:

```json
{
  "files.autoSave": "off",
  "editor.formatOnSave": false,
  "files.simpleDialog.enable": true,
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "window.restoreWindows": "none",
  "security.workspace.trust.enabled": false,
  "update.mode": "none",
  "extensions.autoUpdate": "off",
  "extensions.autoCheckUpdates": false,
  "telemetry.telemetryLevel": "off",
  "chat.disableAIFeatures": true,
  "terminal.integrated.profiles.osx": {
    "Python feasibility": { "path": "/bin/bash", "args": ["--noprofile", "--norc"] }
  },
  "terminal.integrated.defaultProfile.osx": "Python feasibility",
  "terminal.integrated.shellIntegration.enabled": false,
  "terminal.integrated.enablePersistentSessions": false,
  "terminal.integrated.tabs.enabled": true,
  "terminal.integrated.env.osx": {
    "PYTHONDONTWRITEBYTECODE": "1",
    "PYTHONNOUSERSITE": "1",
    "PIP_NO_INDEX": "1",
    "PIP_DISABLE_PIP_VERSION_CHECK": "1"
  }
}
```

Shell integration is unnecessary for the accepted marker contract; disabling it permits explicit no-startup-file bash arguments. This is a proposed configuration, not a demonstrated installed-app contract. Terminal HOME/TMPDIR must additionally be set to the generated owned paths in the launch and terminal environments. Resolve generated values before saving settings; no literal placeholder paths.

Candidate Python controls from official [Python manifest](https://raw.githubusercontent.com/microsoft/vscode-python/main/package.json) and [Python Environments manifest](https://raw.githubusercontent.com/microsoft/vscode-python-environments/main/package.json), inspected read-only during preparation: `python.createEnvironment.trigger: "off"`, `python.createEnvironment.contentButton: "hide"`, `python.experiments.enabled: false`, `python.globalModuleInstallation: false`, `python-envs.terminal.autoActivationType: "off"`, `python.terminal.useEnvFile: false`. These mutable source manifests do not prove the Marketplace-installed version supports them. Inspect that version's schema and effects before selecting/executing the interpreter. An unsupported essential control is a blocker, not permission to invent another key. Do not set a default interpreter path or use configuration to substitute for UI selection.

Launch environment is built from scratch: `HOME`, `TMPDIR`, `XDG_STATE_HOME` point into owned resources/profile state; `PATH=/usr/bin:/bin:/usr/sbin:/sbin`, `LANG=en_US.UTF-8`, and the four terminal environment values above. Exclude inherited Python/venv, shell startup, proxy, Git, token, Copilot and authentication overrides. Do not call `prepareProfile`, `prepareMockState`, start a mock, load the helper or copy saved authentication. Use `--use-inmemory-secretstorage`, `--disable-extension github.copilot-chat`, dedicated user-data/extensions paths, `--enable-smoke-test-driver`, `--new-window`, skip-welcome/release-notes, disabled telemetry/experiments and English locale, with only the disposable workspace open.

## Preservation and candidate enforcement

Before any launch, inventory `.venv/`, `pyproject.toml`, `uv.lock`, `.python-version`, and the unchanged resources named above. With Node filesystem APIs, record sorted relative names, lstat type/mode, regular-file size/SHA-256 and modification times, directory membership, and symlink text. Never recurse through external symlinks or read unrelated private targets. Record canonical interpreter path separately through `realpath`; retain the venv invocation path. Store full manifests only in the ignored run report, with aggregate comparisons in tracked findings. Exclude access time because reads can change it. An unreadable, changing or redirected baseline blocks the run.

Proposed enforcement to validate before use: launch the entire owned Electron process tree under a macOS sandbox policy denying `file-write*` to lexical/canonical protected directories (`subpath`) and files (`literal`), including rename/unlink operations. Keep the policy in owned resources; generate escaped path data, never shell text. Resolve symlinks before policy construction; any writable external symlink target needs explicit scope review rather than silent private-target traversal. No chmod, immutable flags, environment copying, root metadata edits or actual write attempts against preserved paths are allowed.

The reviewed probe must first validate the policy on disposable sentinel directory/file/link fixtures using a Node child, including append, create, rename, unlink and a grandchild attempt. Denials must leave the sentinel manifest unchanged; permitted owned fixture writes must work. Policy inheritance for the actual Electron/extension-host/pty tree must also be established before selecting Python. Availability of `sandbox-exec` alone proves nothing. If policy or inheritance cannot be established safely, stop for direction. This candidate adds a feasibility question; it does not claim a working enforcement solution.

No pip/uv/conda/package/bootstrap/environment-create command or corresponding UI action is permitted. Suppression settings are defense in depth; block any observed automatic install/create behavior. Compare protected manifests again only after confirmed shutdown. Any change fails preservation, retains evidence and requires direction without attempted repair. Matching manifests establish observed unchanged contents; they do not replace enforcement evidence.

## Exact proposed probe artifact for validation

Specified file: `smoke/gui/issue-40-python-feasibility.ts`, compiled by the existing tsconfig to `smoke/dist/gui/issue-40-python-feasibility.js`. Only its non-GUI guard check is implemented. The following original full-walkthrough invocation is **not available**; the probe rejects it without launching anything:

```sh
node smoke/dist/gui/issue-40-python-feasibility.js \
  --build "/Applications/Visual Studio Code.app" \
  --python-interpreter "/Users/jim/Desktop/genai/ide-tester/.venv/bin/python"
```

The artifact is a narrowly scoped interactive walkthrough controller, not a production Python suite. Required behavior/checks:

1. Reject unknown/duplicate/missing options. Resolve app metadata/interpreter presence without invoking Python; acquire `createRun` reservation, record deadlines/ownership and baselines. Implement only the feasibility profile contract above. Validate the write guard and owned application handle before proceeding with the walkthrough. Never dispatch the current CLI, which has no Python suite.
2. Use existing Playwright Electron support with argument arrays and the reviewed protected launch wrapper. Preserve access to the actual application PID/start identity. Verify only the owned first window/restoration. No screenshots, broad DOM dumps, traces, secrets or personal terminal histories.
3. Provide sequential operator checkpoints for Extensions install/enable, editor save/reopen, explicit interpreter picker and terminal creation. Record exact observed labels, IDs, publisher, enabled/installed state, actual extension/dependency versions, update controls, prompts and timings. Operator performs only the specified UI actions in the owned window; no terminal commands. An unexpected sign-in, Keychain dialog or reload requirement stops the walkthrough for review.
4. Require callable `window.driver.getTerminalBuffer`. Target exactly one owned `#terminal .terminal-wrapper` using the upstream candidate; inspect uniqueness/xterm binding before reading. Call only `getTerminalBuffer(selector)` via page evaluation; never `writeInTerminal`, terminal injection, extension APIs or direct Python subprocesses. Validate a bounded string array (maximum 2,000 lines and 256 KiB); missing capability, ambiguous target or wrapped/ambiguous identity records block acceptance.
5. Generate run-specific source as data for the operator to enter through the editor. Require absent `hello.py`/evidence destinations before Save As; independently compare exact saved UTF-8 bytes/digest, close/reopen display, and verify bytes again. Source prints `Hello, world!`, a JSON identity line prefixed `PYTHON_SMOKE_IDENTITY `, and `PYTHON_SMOKE_COMPLETE <run-id>` after writing exclusive temporary/atomic versioned JSON evidence beside `__file__`. JSON carries run ID, script path, `sys.executable`, actual version, PID and PPID. No prefix/base-prefix requirement, package imports beyond standard library, or harness-written success evidence.
6. Before Run, read a baseline with no current-run markers and establish ownership of the fresh shell/terminal. Operator selects the absolute supplied path through Python's explicit-path picker, keeps saved `hello.py` active, then invokes Run Python File in Terminal exactly once. The probe observes fresh greeting, parsed identity and completion via the actual driver, independent regular non-symlink bounded JSON, correct script/canonical interpreter and unchanged saved source together. Record observed errors as failures. Independent exit status is outside scope; errors after all completion evidence that were not observed remain undetected.
7. Check a deadline/cancel fence before every action, checkpoint continuation and evidence acceptance. On expiry, stop new work, close the owned page/app, and settle outstanding operations before cleanup; `Promise.race` alone is insufficient. Retain partial evidence without accepting late output. Checkpoints cannot extend the session deadline.
8. Retain the owned application process handle and verify its exit; a close request or window disappearance alone is insufficient. No complete descendant registry or independent shell/Python shutdown proof is required under the developer's revised contract. Program PID/PPID may remain useful execution diagnostics without implying descendant tracking. No broad `pkill`, app-name matching or killing unverified PIDs.
9. In a separate 120-second cleanup budget, close only the owned app, verify its main-process exit, then compare preservation manifests. Call `finishRun` with a throwing shutdown callback on uncertain application exit/timeout so reservation/resources remain. Confirmed failed runs retain disposable evidence but may release reservation; persistent profiles always survive. Sanitized records belong under `reports/smoke/<run-id>/`; successful resource deletion requires accepted application-shutdown evidence and matching protected contents. An uncertain application exit requires retaining the desktop reservation until developer-directed recovery. Descendant survival is an accepted limitation, rather than a required cleanup failure.

The full artifact specification above originally required validation before addition. The resumed instruction authorized adding its non-GUI prerequisite checks; it did not accept the phase or authorize GUI use. Full implementation still needs checks for ownership refusal, timeout fencing and reservation retention. Implemented guard checks do not qualify GUI behavior. The earlier process-observation blocker below is historical and superseded by the developer's subsequent decision.

## Resumed P1-T01: actual verification and remaining blocker

The new probe supports only this non-GUI command:

```sh
node smoke/dist/gui/issue-40-python-feasibility.js --self-check
```

It creates its own marked `/private/tmp/ide-python-guard-*` fixture. The macOS sandbox policy denies writes to a protected directory and an individually protected file. The worker attempts append, creation, file rename/unlink, directory rename, symlink unlink, writing through an outside symlink, ordinary-grandchild append, detached-grandchild append, and literal-file append/rename/unlink. All twelve attempts must report an OS permission denial. A separate permitted output write must succeed; protected fixture bytes, directory entries and captured metadata must remain unchanged. Successful checks remove only the marked canonical fixture; verification failures retain it. Neither retained environment paths nor any profile is passed to these checks.

Observed results:

| Command/check | Result |
| --- | --- |
| `/usr/bin/sandbox-exec -p '(version 1)(allow default)' /usr/bin/true` inside tool sandbox | `sandbox_apply: Operation not permitted`; tool restriction, not evidence that host enforcement is unavailable |
| Same harmless check with approved execution outside tool sandbox | Passed |
| Initial `npm --prefix smoke run compile` after adding the acceptance test first | Intended red: TS2307, missing probe module |
| Compiled first guard acceptance test outside tool sandbox | Passed for nine directory/symlink/descendant cases |
| Expanded compiled test before literal-file implementation | Intended red: three expected literal-file protection cases absent |
| `npm --prefix smoke run build` after implementation/format correction | Passed: lint, formatting and both compilations |
| `npm --prefix smoke run test:unit` with approved outside-sandbox execution | All **76 tests passed**, including twelve guard-denial cases and refusal of GUI invocation; no skips |
| Additional ESLint check covering the new `gui/` file (not covered by default lint script) | Found one control-character-regex rule violation; replaced it with a character-code check, then lint and build passed |
| Final `node --test smoke/dist/tests/python-feasibility.test.js` after the lint correction | Both tests passed; twelve denial cases and GUI refusal verified against final compiled code |
| Final documentation checks | All 33 local link targets resolve; whitespace/final newlines and `git diff --check` pass; all 17 plan checkboxes remain unchecked |

The first formatting correction command used the subdirectory's older Node and was rejected by Prettier. Invoking Prettier explicitly with the repository-root Node corrected formatting without changing dependencies. No verification error reached four unsuccessful fix rounds. Fixture assertion failures above were expected TDD stages, not evidence of a passing missing feature.

The guard now has **operational Node-process evidence**, including inheritance across a detached grandchild. This does not establish the actual Electron/extension-host/pty launch wrapper, inheritance through that tree, protection of every retained path/alias, or Python UI compatibility. Those remain unverified; the real retained environment has not been exercised or compared.

A delegated read-only investigation examined three alternatives for complete descendant shutdown:

1. **Application process-group cleanup:** reference `../vscode/node_modules/node-pty/src/unix/pty.cc:759–762` sets `POSIX_SPAWN_SETSID` for terminal shells. Application-group cleanup alone therefore cannot be assumed to include terminals. Reference `terminalProcess.ts:394–415` catches pty kill errors and emits an exit event; `node-pty/lib/unixTerminal.js:230` signals the shell PID. These are source limitations, not observed installed-app shutdown behavior.
2. **launchd job containment:** installed `/usr/share/man/man5/launchd.plist.5:609–613` documents remaining-process cleanup within the job's process group. That documented guarantee does not close the separate-session gap. `launchctl procinfo` is diagnostic and requires root; no launchd job was created or removed.
3. **Kernel/EndpointSecurity tracking:** the delegated review found that [Apple XNU's process filter](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_event.c) rejects recursive `NOTE_TRACK`/`NOTE_TRACKERR`/`NOTE_CHILD` support, and [Apple's descendants client](https://developer.apple.com/documentation/endpointsecurity/es_new_descendants_client(_:_:)) requires a restricted entitlement. These do not provide a demonstrated available tracker in the current dependency/privilege scope. No native helper, entitlement, service or infrastructure was installed.

**Historical finding before the subsequent developer decision:** no complete descendant-tracking/containment mechanism was demonstrated within the reviewed scope. Process snapshots leave gaps for short-lived/reparented descendants. The implemented probe therefore refused every GUI invocation; no profile, desktop reservation or application process was created. This was not a process leak observed during execution. The decision below removes that proof requirement; the existing probe still supports only `--self-check`, and its old containment-specific refusal message has not yet been updated. The full controller remains unimplemented.

## Developer-accepted termination evidence and edge cases

On 2026-10-24, the developer accepted shutdown of the owned VS Code application as sufficient proof of termination for now and requested notes on descendant edge cases. Use the existing application-handle/exit check, bounded cleanup, and retention on uncertain application exit. No complete tracker, additional launchd service or EndpointSecurity integration is required. This revises the evidence contract without asserting that any shell/Python descendant actually terminated; it does not complete P1-T01, accept phase 1 or authorize GUI execution.

Potential edge cases, not observed failures in this work:

- A shell or program detaches into a separate session/process group, or is reparented after its parent exits.
- A background child ignores hangup or remains alive after terminal disposal.
- An extension host or terminal helper does not finish shutting down when the main process exits, particularly after a crash or interrupted cleanup.
- A surviving process keeps file handles, writes after the preservation comparison, or outlives disposable-workspace deletion and reservation release.

These are accepted limitations of main-process-only termination evidence. A matching preservation comparison establishes unchanged contents at comparison time and does not exclude later writes by a surviving process. Existing write-guard fixture success does not independently prove protection through the actual Electron tree.

## Observations and execution status

| Check | Actual result on 2026-10-24 |
| --- | --- |
| Read repository/source/reference files and installed metadata | Completed read-only; revisions and findings above |
| Write enforcement | Twelve OS-denial cases passed on disposable fixtures, including detached-grandchild inheritance; actual Electron tree/retained paths unverified |
| Descendant completeness | Unverified and explicitly accepted as a limitation; owned VS Code main-process exit is now sufficient termination evidence |
| Probe implementation | Non-GUI guard check and GUI-invocation refusal only; full controller unavailable |
| GUI/profile/extension/interpreter activity | None |
| Protected-content baseline and comparison | Not run; must precede/follow authorized launch |
| Fresh install/reuse, Python picker/Run, terminal driver | Unverified |
| Production profile preservation comparison | Not run; no profile was accessed or prepared |

P1-T01 remains unchecked because the actual protected launch procedure and full controller are not established. The descendant-proof blocker is removed by explicit developer direction. P1-T02 additionally needs separate GUI authorization and a reserved desktop. P1-T03 and phase-1 developer validation remain dependent on real observations; production implementation remains gated. No phase-2 work occurred.
