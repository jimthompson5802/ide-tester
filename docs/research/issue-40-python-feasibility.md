# Issue #40 Python feasibility procedure and review record

Prepared 2026-10-24 for [phase 1 of the implementation plan](../implementation-plans/issue-40-python-smoke-test.md). **The three requested positive checks now pass:** explicit interpreter selection, the editor/save/reopen/Run Python File in Terminal journey, and combined saved-source/fresh-terminal/program-JSON evidence. Runtime was Python 3.12.15 arm64 from the supplied retained venv path, with matching canonical executable. The developer-approved launch uses `--no-sandbox` for Chromium while retaining the outer preservation guard; Electron main and terminal sentinel writes were denied. All 2,643 preserved entries matched after clean owned main-process exit; successful resources and reservation were removed. Remaining phase-1 timeout/uncertain-shutdown qualification, findings refinement and phase acceptance are pending. Extension-update drift and deliberately interrupted execution/cancellation are now accepted unverified risks. Independent descendant termination remains an accepted limitation. No phase-2 work occurred.

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

During initial preparation, no interpreter, extension, profile or preserved workspace was used. At that point `/usr/bin/sandbox-exec` had only been found by filesystem metadata inspection. Subsequent disposable-fixture and approved Electron/Python verification are recorded below; initial source-review limitations are historical observations, not current status.

## Review boundary and prerequisites

The original preparation stopped for probe-specification review. The resumed instruction authorized non-GUI prerequisites; the terminal-only instruction and confirmation then authorized the focused terminal experiment. At that checkpoint only the [probe](../../smoke/gui/issue-40-python-feasibility.ts), [fixture tests](../../smoke/tests/python-feasibility.test.ts), this record and plan changed; the full Python controller was still unavailable. The later explicitly authorized Python continuation added the walkthrough/preservation/evidence helpers and tests. No production module, production CLI flag, dependency or general profile override changed. The original proposed procedure below is retained as the review baseline; the final continuation records its approved revisions and actual results.

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

Specified file: `smoke/gui/issue-40-python-feasibility.ts`, compiled by the existing tsconfig to `smoke/dist/gui/issue-40-python-feasibility.js`. Initially only its guard check and terminal experiment were available. The later explicitly authorized continuation implemented the following invocation, but its first protected GUI launch failed before Python work; see the final execution record:

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

At the initial non-GUI checkpoint the probe supported only this command; the later focused observation entry point is recorded below:

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

**Historical finding before the subsequent developer decision:** no complete descendant-tracking/containment mechanism was demonstrated within the reviewed scope. Process snapshots leave gaps for short-lived/reparented descendants. At that checkpoint the probe refused every GUI invocation; no profile, desktop reservation or application process had been created. This was not a process leak observed during execution. The decision below removed that proof requirement. The later terminal-only implementation replaced the stale refusal message and added the explicitly authorized focused experiment; the full Python controller remains unimplemented.

## Developer-accepted termination evidence and edge cases

On 2026-10-24, the developer accepted shutdown of the owned VS Code application as sufficient proof of termination for now and requested notes on descendant edge cases. Use the existing application-handle/exit check, bounded cleanup, and retention on uncertain application exit. No complete tracker, additional launchd service or EndpointSecurity integration is required. This revises the evidence contract without asserting that any shell/Python descendant actually terminated; it does not complete P1-T01, accept phase 1 or authorize GUI execution.

Potential edge cases, not observed failures in this work:

- A shell or program detaches into a separate session/process group, or is reparented after its parent exits.
- A background child ignores hangup or remains alive after terminal disposal.
- An extension host or terminal helper does not finish shutting down when the main process exits, particularly after a crash or interrupted cleanup.
- A surviving process keeps file handles, writes after the preservation comparison, or outlives disposable-workspace deletion and reservation release.

These are accepted limitations of main-process-only termination evidence. A matching preservation comparison establishes unchanged contents at comparison time and does not exclude later writes by a surviving process. Existing write-guard fixture success does not independently prove protection through the actual Electron tree.

## Observations and execution status

### Focused terminal observation attempt specification

The developer subsequently directed focus on terminal observation, with at most three attempts. This is a narrower experiment than the full Python walkthrough; a pass establishes actual terminal-driver observation only.

Proposed extension of the already specified `smoke/gui/issue-40-python-feasibility.ts`: add `--observe-terminal --build <app>` and matching non-GUI acceptance tests in `smoke/tests/python-feasibility.test.ts`. Before GUI use, obtain validation of this focused specification and confirmation of an unlocked, exclusively reserved desktop. Each attempt is manually invoked, sequential, with a 60-second launch limit, 60-second observation limit and separate 30-second application cleanup limit. No automatic retries. Stop on a pass; otherwise inspect the failure before making a focused correction and invoking another attempt, at most three total.

Use the existing shared reservation and disposable resource/workspace helpers. Prepare/reuse only the owned, closed `profiles/smoke-python-feasibility` profile with its established marker; preserve it on every outcome, and leave `profiles/smoke-python` and all other existing profiles untouched. Launch installed VS Code with in-memory secret storage, all extensions disabled, no helper/mock/authentication, a fresh owned HOME/TMP, and a minimal explicit environment. Python, environment discovery and Marketplace activity are outside this experiment. No retained-environment interpreter is invoked and no retained data is opened.

For this terminal-observation-only experiment, the default terminal profile runs the existing Node executable with a small probe-owned script inside disposable resources. Its source is generated by the probe and contains a unique run ID; do not pass expected output markers as terminal command text or inject output through the driver. The fixture waits for a probe-owned trigger file, emits two separately triggered batches of greeting/identity/completion lines through its real process stdout, and exits on a hard safety deadline. This verifies fresh buffer changes rather than a static string or command echo; it does not establish a bash/Python profile or the Python extension Run action. The fixture has no package imports beyond Node built-ins and reads/writes only probe-owned fixture paths.

Open a new terminal through the command palette. Require the installed `window.driver.getTerminalBuffer` capability and exactly one owned visible `#terminal .terminal-wrapper`. Read/validate a bounded baseline (at most 2,000 lines / 256 KiB), then trigger batch one and require its exact lines, independently reported run ID and fixture PID. Re-read the same terminal and ensure batch two is absent, trigger batch two, and require its new exact lines while retaining batch one. Record actual returned lines, capability/type, selector/uniqueness, fixture PID, application/version, timings and outcomes only in the ignored owned report. No `writeInTerminal`, terminal typing, screenshots, broad DOM dumps, personal terminal history or direct shell command entry.

Close only the owned VS Code application and verify its main-process exit under the developer-accepted termination contract. The fixture's hard deadline additionally limits survival without claiming independent descendant shutdown. On uncertain application shutdown, retain resources/reservation; on a confirmed failed attempt retain disposable evidence and release the reservation. Preserve the persistent feasibility profile on success and failure. The standalone probe must explicitly report that Python output, interpreter selection, extension installation, protected Electron-launch guard inheritance and arbitrary terminal behavior remain unverified.

The specification was saved before implementation. The developer then replied **“I confirm”** to the request validating this exact experiment and confirming an unlocked, exclusively reserved desktop for at most three sequential attempts. This bounded terminal-only authorization does not accept P1-T01/P1-T02 or authorize the full Python workflow.

Read-only review found no source-level blocker for a Node terminal profile. The implementation waits for the wrapper's xterm binding as well as visibility, uses exact command-palette label matching, disables shell integration, and emits short identity/marker lines because the driver returns physical lines without joining wraps. No code/profile change or GUI attempt occurred before the confirmation.

### Focused terminal observation result — attempt 1 passed

Executed once on 2026-10-24, with approved outside-tool-sandbox GUI execution:

```sh
node smoke/dist/gui/issue-40-python-feasibility.js --observe-terminal \
  --build '/Applications/Visual Studio Code.app'
```

Local ignored evidence: `reports/smoke/2026-10-24T14-37-45-795Z-20a87618-dc9d-4ac6-a106-99d51170519c/terminal-observation.json`. The report records actual buffer arrays, process identity, timing, version, profile and cleanup observations. It contains only this synthetic terminal fixture's output; no screenshots, traces, personal terminal contents or authentication were captured.

| Observation | Verified result |
| --- | --- |
| Installed build | VS Code 1.135.0, bundled Copilot metadata 0.63.0; macOS arm64 / Node 26.3.1; all extensions disabled |
| Driver and target | Callable actual `window.driver.getTerminalBuffer`; exactly one visible xterm-bound `#terminal .terminal-wrapper` |
| Baseline | Eighteen empty physical lines; no current token |
| First trigger | Fresh exact `Hello, world!`, `OBS_ID` and `OBS_DONE` lines for token `574a6748dbea`, batch 1, actual fixture PID 92238 |
| Second freshness check | First batch present; second batch absent before its separate trigger |
| Second trigger | Fresh batch-2 lines for the same token/PID; final buffer retained both complete batches |
| Timing | Launch/restoration 1,121 ms; terminal observation 741 ms; total 2,214 ms |
| Cleanup | Owned VS Code PID 92215 exited with code 0; no cleanup errors; disposable resources removed and reservation released |
| Profile preservation | Created only the previously absent feasibility profile with exact owner marker; profile retained afterward; production `profiles/smoke-python` remained absent |
| Attempts | One of the permitted three used; stopped on success, with no automatic retries |

TDD/quality checks: compilation first failed as intended for four missing observation exports. After implementation, seven focused non-GUI tests passed: bounded-buffer validation, exact/negative batch verification, a real two-trigger fixture process, invalid CLI refusal, and profile preservation/refusal. `npm --prefix smoke run build` and a direct ESLint check covering the probe passed. The full `npm --prefix smoke run test:unit` passed **all 82 tests with no skips**, including the earlier write-guard test, using approved host sandbox/loopback access. Post-run filesystem checks confirmed no shared reservation, the preserved feasibility owner marker, and an absent production profile.

**Established:** real installed-driver terminal observation and current-run freshness for two short-line Node fixture batches. No driver terminal-write API or terminal command typing was used. **Still unverified:** Python extension installation/enablement, Python interpreter picker/Run action, Python-generated evidence and canonical identity, bash/Python terminal configuration, wrapped/long-line handling, actual protected Electron-launch guard inheritance, retained-environment comparison, and interrupted/timeout GUI cleanup. The persistent observation profile currently points to the removed disposable fixture script; a future authorized experiment must merge its own current-run terminal settings rather than reuse that old script path.

| Check | Actual result on 2026-10-24 |
| --- | --- |
| Read repository/source/reference files and installed metadata | Completed read-only; revisions and findings above |
| Write enforcement | Twelve fixture denials plus actual Electron-main and terminal sentinel denials passed under the approved outer guard |
| Descendant completeness | Unverified and explicitly accepted as a limitation; owned VS Code main-process exit is now sufficient termination evidence |
| Probe implementation | Guard, terminal observation and focused Python controller implemented; positive Python walkthrough passed |
| GUI/profile/extension/interpreter activity | Fresh Microsoft Python installation observed; final reused-profile run selected and executed the retained interpreter through UI |
| Protected-content baseline and comparison | Passed for 2,643 retained entries before/after every diagnostic launch, including the final successful Python run |
| Terminal driver | Verified operationally on attempt 1 with two independently triggered real stdout batches |
| Fresh install/reuse, Python picker/Run | Fresh install observed separately; full positive picker/Run/evidence journey passed with reused installation; full fresh/reuse production qualification pending |
| Production profile preservation | Absent before/after focused attempt; not created or used |

P1-T01/P1-T02 remain unchecked for outstanding timeout/uncertain-shutdown procedure qualification; effective update controls and deliberately interrupted execution/cancellation are accepted unverified risks rather than pending verification requirements. Their requested positive Python UI and evidence checks now pass under the explicitly approved launch revision. P1-T03 and phase-1 developer validation remain pending; production implementation remains gated. No phase-2 work occurred. Earlier blocker and unverified statements below describe their historical checkpoints and are superseded by the final continuation record for these three checks.

## Authorized Python journey verification: protected-launch blocker

The developer requested verification of interpreter selection, the Python execution journey and combined execution evidence, then explicitly confirmed an unlocked exclusively reserved desktop, Microsoft Python extension installation in the feasibility profile and guarded use of `/Users/jim/Desktop/genai/ide-tester/.venv/bin/python`. This authorizes the following focused continuation, without accepting phase 1 or advancing to production implementation.

The specified probe now delegates its original `--build <app> --python-interpreter <path>` invocation to `smoke/gui/python-walkthrough.ts`, with separately tested `python-preservation.ts` and `python-execution-evidence.ts` helpers. One sequential eight-minute scenario uses a separate 120-second cleanup budget and the shared reservation. It first tests the existing disposable write guard, records stable retained-resource manifests, launches Electron through a fixed-text sandbox wrapper, and requires denied writes to a disposable protected sentinel from Electron main and an actual terminal Node process. No write is attempted against preserved resources. The sandbox protects the retained environment, root metadata, editor settings, preserved workspaces and resolved Homebrew Python installation. External symlink targets except the supplied interpreter and unenumerated hardlink aliases block execution.

Next, install/open Microsoft Python through Extensions UI, inspect installed extension schemas and versions, require supported suppression controls, create/save/reopen `hello.py` through editor UI, enter the absolute interpreter in Python's explicit path picker, create a fresh bash terminal and record a marker-free baseline, then invoke Python's Run Python File in Terminal once. Accept only exact saved bytes, fresh greeting/identity/completion output read through the actual driver, and matching bounded regular non-symlink program-written JSON with the supplied canonical executable and script identity. Compact ASCII identity JSON escapes spaces so physical wrapped lines can be concatenated and compared exactly with the file; duplicate, reordered, partial or mismatched output fails verification. The program derives its evidence path from `__file__`, writes an exclusive temporary file and atomically replaces the initially absent destination.

On an essential unsupported UI/settings/protection contract, stop and retain the incomplete run rather than bypass it. No interpreter preflight, package/environment installation, terminal command typing, authentication automation, screenshots or broad DOM dumps are allowed. Close the owned app and confirm main-process exit before the preservation comparison and resource cleanup. No independent descendant termination or Python exit status is claimed. Timeout/cancellation qualification and production fresh/reuse behavior remain separate pending work.

### Actual run and diagnosis

The first invocation failed before GUI launch because a top-level dynamic import waited on a circular module dependency (Node exit 13). Moving CLI execution into a caught async entry point fixed that defect; a new non-GUI regression verifies that dispatch settles and refuses an unauthorized interpreter before reservation or launch. This was not a GUI attempt or Python invocation.

The following invocation then made one real protected GUI attempt:

```sh
node smoke/dist/gui/issue-40-python-feasibility.js \
  --build '/Applications/Visual Studio Code.app' \
  --python-interpreter '/Users/jim/Desktop/genai/ide-tester/.venv/bin/python'
```

Local ignored evidence: `reports/smoke/2026-10-24T14-49-56-759Z-b93629c4-e938-4503-af36-7ec7be1664f9/python-walkthrough.json`, `preservation-before.json`, and sanitized `guard-launch-diagnosis.json` beside them. Disposable failed resources remain at `/private/tmp/ide-smoke-Pa9b6E`; the dedicated feasibility profile is preserved. The raw initial report says `outcome: incomplete`; this is a **protected-launch harness error**, not a Python functional failure. The controller now classifies unfinished probe runs as harness errors, without rewriting the historical report.

| Check | Observed result |
| --- | --- |
| Disposable guard | All twelve mutation attempts denied; permitted write passed |
| Stable retained baseline | 2,643 entries; canonical interpreter resolved read-only to Homebrew Python 3.12.15 binary; no version invocation |
| Owned Electron launch | Main PID 3803; renderer crashed before workbench readiness; helpers 3804–3808 aborted |
| Failure diagnosis | Owned helper crash stacks map to the binary's `Failed to initialize sandbox.` branch; exact OS errno unavailable |
| Guard inheritance through actual Electron/terminal | Not reached; remains unverified |
| Extension install, interpreter picker, editor/Run journey | Not reached; remain unverified |
| Combined real Python execution evidence | Not reached; remains unverified |
| Main-process shutdown | Confirmed `SIGABRT` exit; independent descendants not checked |
| Preservation comparison | All 2,643 entries matched after confirmed main exit |
| Resource disposition | Failed resources retained; reservation released; production Python profile absent |

Conflict between the outer Seatbelt policy and Chromium's helper sandbox is an **inference**, not an established OS diagnosis. The launch is incompatible as tested. No policy was removed, no protected-path mutation was attempted and no second GUI session was started. Existing terminal-only success does not qualify the guarded launch.

TDD and quality checks: missing helper/runner modules first failed compilation; terminal-error rejection first failed its intended assertion, then passed. Build and explicit ESLint including all four GUI modules passed. The full non-GUI suite passed **96 tests, zero failures/skips**, including fixture preservation, hardlink/external-link refusal, wrapped identity reconstruction, stale/wrong/echoed/partial/error evidence rejection, strict invocation and dispatch settlement. These tests do not establish Python syntax/runtime behavior or GUI success. Review tightened reopened editor comparison, explicit picker-entry observation, aggregate stage budgets and the bounded Electron guard evaluation; those GUI paths remain unexecuted. Per-extension update opt-ins, interruption/cancellation and fresh/reused Python behavior remain unqualified.

### Concrete diagnostic proposal (subsequently approved and executed)

Keep the same external write-denial policy, owned profile, disposable workspace, clean environment, deadlines and preservation comparisons. Add only `--no-sandbox` to the owned VS Code launch to disable Chromium's internal sandbox, then require successful denied-sentinel checks from Electron main and the real terminal before installing/selecting/running Python. This lowers Chromium's internal process isolation; it does not remove the outer preservation guard. Whether that configuration works remains unverified. This changes the reviewed protected-launch contract and requires developer direction before another GUI attempt. If declined, investigate a different preservation mechanism before continuing; never bypass preservation silently.

### Approved diagnostic continuation

The developer answered **“yes”** to the concrete diagnostic proposal above. This authorizes one continuation using `--no-sandbox` while retaining the outer write-denial guard and all ownership, sentinel, preservation and cleanup checks. The existing desktop reservation confirmation applies to this continuation. The diagnostic must establish denied sentinel writes through Electron and its real terminal before proceeding with the already authorized Python journey. This is not phase acceptance or authorization to remove the preservation guard.

### Final positive verification: passed

Local ignored report: `reports/smoke/2026-10-24T15-08-01-439Z-dd2b38d6-650e-47c0-b6af-6022ff4c1515/python-walkthrough.json`. The same original probe invocation above now includes the approved `--no-sandbox` application argument internally. This passes only with the external preservation policy and actual sentinel checks intact; the exception is limited to this feasibility procedure, not a production launch decision.

| Requested check | Actual observed evidence |
| --- | --- |
| Explicit interpreter selection | Entered `/Users/jim/Desktop/genai/ide-tester/.venv/bin/python`; reopened Select Interpreter picker displayed exactly `Selected Interpreter: /Users/jim/Desktop/genai/ide-tester/.venv/bin/python` |
| Python execution journey | Created untitled source through editor input; saved `hello.py`, compared all 1,128 UTF-8 bytes, closed/reopened and matched every displayed line, verified bytes again, invoked `Python: Run Python File in Terminal` once |
| Combined execution evidence | Fresh `Hello, world!`, structured identity and `PYTHON_SMOKE_COMPLETE 61e2ef91faa0` read through installed `window.driver.getTerminalBuffer`; identity reconstructed from four physical wrapped lines matched raw program JSON exactly; script, token and canonical executable matched; saved bytes rechecked |
| Actual Python identity | Version 3.12.15, architecture arm64, PID 20445, PPID 20436; invocation is the supplied `.venv/bin/python`; canonical executable `/opt/homebrew/Cellar/python@3.12/3.12.15/Frameworks/Python.framework/Versions/3.12/bin/python3.12` |
| Source digest | `536af41694e74e6f1f5ffc41aecc32d8ee86bb6d77fe1cbe9a182f864398d4f4` |
| Protection and preservation | Electron main and terminal denied sentinel writes; all 2,643 retained entries unchanged after confirmed main exit |
| Cleanup | Main PID 20272 exited code 0; owned successful resources removed; reservation released; feasibility profile preserved; production profile absent |

Microsoft Python `ms-python.python` 2026.10.0 was installed fresh through Extensions UI during the earlier `2026-10-24T14-59-27-028Z-4f7f21cd-1444-4175-8019-ea87b4442bdb` run. Its header then showed Disable and Uninstall, establishing installed/enabled state. Dependencies present: `ms-python.debugpy` 2026.6.0, `ms-python.vscode-pylance` 2026.4.1 and `ms-python.vscode-python-envs` 1.40.0. All proposed suppression keys were found in installed schemas. The final successful run reused this installation; it does not establish a full fresh-install-to-execution run or production qualification. No reload or authentication action was needed.

Observed UI refinements: command-palette labels sometimes omit category prefixes; terminal/picker icons add leading whitespace; Extensions search is Monaco rather than an HTML input; Install must target the unique visible header action; editor auto-indentation must be disabled to preserve inserted source. The explicit-path input must display `Enter path to a Python interpreter.` before entry. Settings additionally used by this probe: editor font size 10, line height 12, word wrap off, minimap off, auto-indent none, format-on-type false, auto-closing brackets/quotes never, quick suggestions false and trigger-character suggestions false. These affect only the owned feasibility profile.

The installed Python Environments extension owns the status item `ms-python.vscode-python-envs.python.interpreterDisplay`; it sometimes showed an unrelated Homebrew 3.15 interpreter or a loading spinner even while Python's picker and executed program agreed on the supplied 3.12 interpreter. The probe records that status without treating it as authoritative. Exact selected-picker path plus actual program identity establish the requested selection/execution; cross-extension status consistency remains unverified.

`Python: Create Terminal` still permitted Run to create a second terminal. The verified selector is therefore **`#terminal .terminal-wrapper.active`**, requiring exactly one visible xterm-bound active target before each driver read. VS Code reference `terminalInstance.ts` sets `.active` in `setVisible`. The pre-dispatch baseline was token-free in the initial owned terminal; Run created a second owned terminal and activated it. The final report has two total terminals and one active terminal. The new terminal's complete current-token output, initially absent program file, exact source and matching identity together establish freshness; this is not a same-terminal-before/after claim. No terminal text was injected by the harness. Physical wrapped identity reconstruction now has actual Python GUI evidence; paths containing literal spaces remain non-GUI-test coverage only.

The approved diagnostic exploration used **14 manually invoked sequential launches** between 14:54 and 15:08 UTC in the same reserved session: 13 incomplete probe runs, followed by the passing run. No automatic retry or later GUI run followed the pass. Each incomplete run retained its disposable resources and report; every launch confirmed main-process exit code 0, unchanged preservation inventory and reservation release. Routine probe corrections stayed within the revised guard/UI procedure. No error reached four unsuccessful fix rounds: hidden Install alternatives, unavailable status item and multiple-terminal targeting each needed at most two proposed corrections.

| Launch UTC (report directory prefix) | Result and correction |
| --- | --- |
| 14:54:36 | Main-process dynamic import unsupported; used built-in filesystem access in evaluation |
| 14:55:12 | Category-free terminal command label; exact optional-category matching added with TDD |
| 14:56:26 | Icon-prefixed terminal profile label; matched surrounding whitespace |
| 14:57:10 | Extensions search uses Monaco; used shipped editor-input driver |
| 14:57:56 | Four Install action matches; narrowed to root extension header |
| 14:58:39 | Hidden alternative Install actions still matched; required visible action |
| 14:59:27 | Fresh installation passed; auto-indentation changed source; disabled it |
| 15:00:08 | Icon-prefixed interpreter entry; matched actual label |
| 15:02:07 | Picker transition cleared early input; waited for explicit-path placeholder |
| 15:02:38 | Assumed old status-item ID absent; inspected installed source |
| 15:03:55 | Legacy Python status item unavailable; required exact selected path in picker instead |
| 15:05:47 | Python executed correctly, but second terminal prevented observation; tried Python-created terminal |
| 15:06:44 | Python-created terminal still followed by a second; narrowed actual driver target to unique active terminal |
| 15:08:01 | All three requested checks and cleanup passed; stopped |

An independent read-only review replayed the verifier against the final report and filesystem-resolved canonical interpreter, regenerated the source digest/bytes and compared the complete reopened editor contents. No material false pass was found for these focused positive checks. Remaining limits: effective per-extension update opt-ins, failure/cancellation and timeout behavior, independent Python exit status, complete descendant shutdown, direct extension-host sentinel mutation, paths with spaces in real GUI output, full fresh/reused production qualification and phase-1 acceptance. No production Python suite exists and no phase-2 work occurred.

Final validation after these corrections: `npm --prefix smoke run build` passed; explicit ESLint including all four GUI modules passed; `npm --prefix smoke run test:unit` passed **97 tests, zero failures/skips**, with approved sandbox/loopback access. No further GUI run was needed after the pass. Plan/research relative links, whitespace/final newlines and `git diff --check` were checked; all 17 full task/validation checkboxes remain unchecked because focused positive verification is not full phase acceptance.

## Accepted risks and phase clarification (2026-10-24)

Developer scope decision (2026-10-24): effective extension automatic-update prevention and deliberately interrupted execution/cancellation are accepted unverified risks; no dedicated qualification is required for either. Retain existing suppression settings and basic complete-evidence checks, without claiming these edge cases were tested. Timeout/deadline handling and uncertain owned VS Code shutdown remain separate pending checks. Production implementation belongs to phase 2; production fresh/reused-profile and failure qualification belong to phase 3. They are later-phase work, not missing phase-1 feasibility verification. Paths-with-spaces GUI coverage is a phase-3 variant. Cross-extension status consistency is a recorded limitation, not a new phase-1 gate: exact Python picker selection and actual execution identity already passed. This decision supersedes earlier records listing updates/interruption as pending requirements; it does not accept phase 1 or authorize phase 2.

The current phase has established the requested positive UI journey and combined evidence. Its remaining verification concerns timeout/deadline handling and uncertain main-process shutdown, followed by findings/procedure refinement and developer validation. A complete production fresh-install journey, reused-profile qualification and optional GUI paths-with-spaces variant belong to phase 3 after phase-2 implementation. No runtime behavior, test code, profile setting or environment changed for this decision. Historical pending lists above remain execution history and are superseded by this scope decision.
