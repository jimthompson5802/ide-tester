# Possibility of reusing VSCode smoke-test approach

> **Historical reference — fresh-start reset (2026-10-22):** This document preserves prior planning, research, decisions, and recorded results. Implementation, test, and execution claims refer to the previous harness; that source and its execution reports were removed from this branch. Commands and approvals here do not establish current functionality or authorize resumption. See [the current README](../../README.md) for the retained environment and current scope.


In VS Code, **smoke tests** are lightweight end-to-end checks that validate critical user journeys after a build (for example: app launch, window/workbench readiness, basic commands, and key UI interactions), to quickly catch “is the product basically working?” regressions.

For the exact commands in that `package.json` URL, I should read the file directly and enumerate the smoke-specific scripts (names + what each runs). If you want, I can do that next and give you a precise list from `main/package.json`.

---

Great — from `microsoft/vscode`’s `package.json`, the smoke-test scripts are:

- `smoke-test`
- `smoke-test-no-compile`
- `smoke-test-web`
- `smoke-test-no-compile-web`

What they mean:

- **`smoke-test`**: runs desktop smoke tests **with compile/build prep**.
- **`smoke-test-no-compile`**: runs desktop smoke tests **without** compile step (faster when build artifacts already exist).
- **`smoke-test-web`**: runs **web** smoke tests with compile/prep.
- **`smoke-test-no-compile-web`**: runs web smoke tests without compile.

So practically, VS Code keeps both **desktop and web smoke suites**, each with **compile** and **no-compile** variants for CI vs local/dev speed workflows.


---

**Yes, you can use the same approach outside VS Code development.** I also need to correct my earlier answer. I never actually read the root `package.json`: the fetch returned unrelated `package.json` files, and it did again just now. The four script names I listed (`smoke-test`, `smoke-test-web` and so on) were unverified and may be wrong. The smoke test README says the entry point is `npm run smoketest`.

**The README shows it already supports your use case.** The smoke tests can run against an installed build rather than a source checkout:

```bash
npm run smoketest -- --build "/Applications/Visual Studio Code - Insiders.app"
```

The `--build` flag points the tests at an installed or downloaded VS Code. They still need the `test/smoke` code from a checkout at the matching release (for example `release/1.22`). So you can test a new install without building VS Code, but you do need to clone the repo and run `npm i` in `test/smoke`.

**How to build your own version.** The approach is not specific to VS Code's source:

1. **Launch the real app in an isolated environment.** Use a fresh `--user-data-dir` and `--extensions-dir`, plus a throwaway workspace folder. This keeps your own settings from affecting the result.
2. **Drive it with automation.**
   - Desktop: Playwright's Electron support (`_electron.launch({ executablePath })`). VS Code's smoke tests use Playwright for the web variant.
   - Web: Playwright against `code serve-web` or `code-server`.
3. **Check a short list of critical behaviors**, such as:
   - The window opens and the workbench renders.
   - You can open a file and type in it.
   - The command palette opens and a command runs.
   - Search, the terminal, and the settings UI work.
   - Your key extensions activate.
   - The version in the About dialog or `code --version` matches what you expect.
4. **Follow the README's pitfalls.** Don't depend on focus, wait only a couple of seconds, and avoid shared state or fixed ports.

**Lighter options if you don't need UI automation:**
- Run `code --version`, `code --list-extensions`, and `code --install-extension` in a script.
- Use `@vscode/test-electron` or `@vscode/test-cli`. These download a specific VS Code version and run extension tests inside it, which suits checking that your extensions work on a new release.

I can look at the smoke test driver code in `test/automation` to show how it launches and controls VS Code. I could also sketch a minimal Playwright script for your own post-install check.


---

**Yes, you can send a prompt to GitHub Copilot Chat and check the response this way.** VS Code's own smoke tests already do it, with one caveat: they mock the model, so they don't test the real Copilot service.

**What the existing tests do.** `test/smoke/src/areas/chat/` has `copilotCli.test.ts`, `chatSessions.test.ts` and `chatModelConfig.test.ts`. They follow this flow:

```ts
await app.workbench.quickaccess.runCommand('smoketest.openLocalChat');
await app.workbench.chat.waitForChatView();
await app.workbench.chat.sendEditorMessage('Reply with one short sentence. [scenario:...]');
await app.workbench.chat.waitForEditorResponse(1500);
const text = await app.workbench.chat.getLatestEditorResponseText();
assert.ok(text.includes('MOCKED_...'));
```

The `Chat` helper is part of the `test/automation` package.

**They don't call the real Copilot backend.**
- A `MockLlmServer` stands in for the model, with canned replies keyed by `[scenario:...]` tags in the prompt.
- The tests write settings that redirect Copilot to that mock server, such as `github.copilot.advanced.debug.overrideAuthType = "token"`.
- The point is deterministic assertions on the UI and tool-calling, not on model output.
- The `copilotCli` test is currently marked `it.skip`.
- The `smoketest.openLocalChat` and `smoketest.openCopilotCliChat` commands appear to be test-only commands. I haven't confirmed where they are defined or whether a normal install includes them.

**What this means for testing a new install.**

| Goal | Feasible? |
|---|---|
| Confirm the Chat UI opens and a prompt/response round trip works | Yes, with the mock server. This is the closest to the VS Code tests. |
| Confirm real Copilot works after an upgrade (signed in, a prompt returns a non-empty answer) | Possible, but you'd write your own automation. |
| Assert on exact real-model output | Not reliably, because responses vary. |

**Testing real Copilot.** You'd build a lighter version of the same approach:
1. Launch your installed VS Code with Playwright's Electron support, using a dedicated `--user-data-dir` and `--extensions-dir`.
2. Sign in to GitHub. This is the hard part. You can reuse a persistent profile that's already signed in, but headless or CI use is awkward.
3. Open Chat with the keyboard shortcut or the `workbench.action.chat.open` command, type a prompt, and press Enter.
4. Wait for a response element to appear, then assert it's non-empty and free of error text such as "unable to", "sign in" or "quota".
5. Check for loose properties, for example asking "Reply with the word PONG" and looking for `PONG`.

**Caveats:**
- Chat DOM selectors aren't a stable public API and may change between releases, so expect some maintenance.
- Real calls use your Copilot quota and need network access.
- Don't rely on the test-only commands. Use the standard chat commands instead.

I can sketch a Playwright script for the real-Copilot version, or look at `test/automation`'s `Chat` class to show which selectors and waits it uses.

---

Search complete: Check smoke profile support

Searched codebase for "smoke test runner options launch configuration VS Code user profile user-data-dir", 24 results

Searched codebase for "argument parsing CLI flags vscode launch args profile directory", 27 results

Searched for files matching `**/smoke*.{ts,js,py,go,java}`, 2 matches

Searched for regex `smoke.*test.*runner|smoke.*runner`, 26 results

Searched for regex `user-profile|user-data-dir|userDataDir|userProfile`, 585 results

Searched for regex `--build.*installed.*app|build.*installed.*app`, 3 results

Searched for files matching `**/launch*.{ts,js,py,go,java}`, 4 matches

Searched for regex `argv|arguments.*parse|argparse|getopt|parse.*args|command.*line.*arg`, 900 results

Searched for files matching `**/smoke-test-runner*`, no matches

Searched for text `smoke-test-runner`, 11 results

Searched for files matching `**/smoke/**/*runner*`, no matches

Searched for regex `--build.*installed.*app|build.*installed.*app`, 3 results

Searched for files matching `**/test/smoke/**`, 66 matches

Searched for regex `user-data-dir|userDataDir|user data dir|user profile`, 521 results

Searched for files matching `**/test/scenario/**`, 11 matches

Searched for regex `assertNoProfileOverrides|reject per-run arguments`, 3 results

Searched for files matching `**/test/smoke/**/*userDataDir*`, no matches

Searched for regex `getRandomUserDataDir|randomized user-data directories|isolated profile`, 22 results

Searched for files matching `**/test/**/*smoke*test*runner*`, no matches

Searched for regex `smoke-test-runner.log|smoke tests electron|Azure DevOps Flaky Smoke Tests`, 12 results

Searched for files matching `**/build/**/*smoke*test*`, 2 matches

Searched for text `--user-data-dir` (`**/test/smoke/**`), 3 results

Read , lines 1 to 260

Read , lines 250 to 340

Searched for regex `getApplication\(|--user-data-dir|userDataDir|electronArgs|profile` (`**/test/smoke/src/main.ts`), 6 results

Searched for regex `userDataDir|--user-data-dir|--extensions-dir|extraArgs` (`**/test/automation/src/**`), 20 results

Searched for regex `--profile|--user-data-dir` (`**/src/vs/platform/environment/**`), 4 results

Read , lines 260 to 455

Not against an **existing installed profile** with the standard smoke runner. It launches VS Code with a temporary `--user-data-dir` and extensions directory, then removes them after the run. That isolation prevents the tests from changing your normal profile.

You can pass a profile name to the temporary test instance:

```bash
npm run smoketest-no-compile -- --build "/Applications/Visual Studio Code.app" --electronArgs="--profile=SmokeTest"
```

That selects or creates `SmokeTest` **inside the runner’s temporary user-data directory**; it won’t use the profile or settings from your installed VS Code. Reusing an actual profile would require changing the runner, and is risky because smoke tests can alter user data.

---

Read , lines 1 to 115

Searched for regex `use-inmemory-secretstorage|useInMemorySecretStorage` (`**/src/vs/**`), 9 results

Searched for regex `Authentication|Copilot.*auth|sign in|Github Copilot` (`**/test/smoke/src/areas/chat/**`), 8 results

Read , lines 160 to 220

**Correction:** The earlier `--profile=SmokeTest` suggestion would create/use a profile inside the smoke runner’s temporary data directory; it would not inherit your Copilot sign-in. The runner also enables in-memory secret storage by default.

You can try using a **copy** of your existing VS Code user-data directory, so the tests won’t modify your normal profile. On macOS, quit VS Code first, then from the repository root:

```bash
cp -a "$HOME/Library/Application Support/Code" /tmp/vscode-smoke-copilot

npm run smoketest-no-compile -- --build "/Applications/Visual Studio Code.app" \
  --electronArgs="--user-data-dir=/tmp/vscode-smoke-copilot --use-inmemory-secretstorage=false"
```

If you use a named profile, add `--profile=YourProfileName` inside `--electronArgs`. This is a workaround, not a dedicated smoke-runner option: it relies on extra Electron arguments overriding the runner’s defaults. The runner still uses its own extensions directory, so this works only if the Copilot extension is available in the installed app. The generated arguments and in-memory secret-storage setting are in `electron.ts:24-52`; the runner’s temporary data directory is set in `main.ts:279`.

If Copilot still isn’t authenticated, the reliable route is to adjust the smoke-test harness to accept a user-data directory and disable in-memory secret storage, then compile the smoke tests. That compiles the test harness, not VS Code.

