https://github.com/microsoft/vscode

VS Code is tested at **multiple layers**, not just with one test suite:

1. **Unit tests (mostly in `src/vs/*/test/`)**  
   - Cover core logic in `base`, `platform`, `editor`, and `workbench`.
   - Fast, granular tests for services/utilities/components.

2. **Integration tests (`test/` and workbench-level suites)**  
   - Validate behavior across subsystems (editor + workbench + services together).
   - Catch issues that unit tests can miss (wiring/DI/contribution interactions).

3. **Extension host / API tests**  
   - VS Code API behavior is tested through dedicated extension tests (including built-in extension test areas like `extensions/vscode-api-tests`).
   - Ensures extension-facing contracts remain stable.

4. **Built-in extension tests (`extensions/*`)**  
   - First-party extensions (Git, TypeScript features, Markdown, etc.) have their own tests.
   - Confirms shipping extensions continue to work against core/editor/workbench changes.

5. **Smoke / end-to-end coverage (CI-oriented flows)**  
   - Repo-level `test/` infrastructure includes higher-level scenarios that exercise real app flows.
   - Used to validate startup, command execution, basic editing workflows, and regressions across platforms.

6. **CI validation + compile/type checks**  
   - Build/test pipelines run on PRs to prevent regressions.
   - TypeScript-heavy codebase relies on compile/type validation plus test suites for confidence.

If you want, I can map this to **exact folders/scripts** in `microsoft/vscode` (what command runs which suite and where the test entrypoints live).

---

Great question. In VS Code, **extension host tests** are about validating the behavior of the **Extension Host process** and the **VS Code extension API** as seen by real extensions.

In practice, they typically involve:

- Launching VS Code (or a test instance) with a controlled extension environment
- Running test extensions that call VS Code APIs (`vscode.*`)
- Verifying activation behavior (activation events, startup timing, lifecycle)
- Verifying API contracts (commands, workspace/fs APIs, language features, diagnostics, etc.)
- Checking extension ↔ host boundaries (IPC/message passing, process isolation, error handling)
- Ensuring regressions in core don’t break extension compatibility

For `microsoft/vscode`, this is largely represented by the **API test extension suites** (notably under `extensions/vscode-api-tests`) and supporting test infrastructure under `test/` that drives those runs.

If you want, I can next point you to the exact test entry files and runner scripts in this repo (with the specific commands used in CI/local runs).

---

Perfect — here are concrete VS Code repo files that show how **extension host/API tests** are wired.

### 1) The API test extension itself
This extension is the test package that runs inside the extension host.

- `extensions/vscode-api-tests/package.json`
  - declares test entrypoints and scripts
  - identifies it as the API tests extension

### 2) How VS Code is launched for these tests
The integration runner starts VS Code with extension test flags:

- `scripts/test-integration.bat` (Windows)
- `scripts/test-integration.sh` (Linux/macOS equivalent in repo)

The key launch args you’ll see are:

- `--extensionDevelopmentPath=.../extensions/vscode-api-tests`
- `--extensionTestsPath=.../extensions/vscode-api-tests/out/workspace-tests`
- workspace file: `extensions/vscode-api-tests/testworkspace.code-workspace`

That means: “load this test extension, then execute its compiled test bundle.”

### 3) Where the test code lives
Look under:

- `extensions/vscode-api-tests/src/`
  - `singlefolder-tests/` (many API behavior tests)
  - other scenario-specific folders/files

Typical tests exercise real `vscode` APIs (commands, workspace/editor operations, diagnostics, etc.) in a running extension host.

### 4) Dev/debug config for running these tests
In `.vscode/launch.json`, there are launch configs using the same test args so maintainers can run/debug locally.

---

If you want, next I can walk you through **one specific test file** (for example an editor/workspace API test), line-by-line, and explain exactly what it validates and how assertions are structured.

---

`test-integration.sh` is the Linux/macOS wrapper that runs VS Code’s **integration/API tests** in a predictable way.

At a high level, it does this:

1. **Sets strict shell behavior**  
   Uses safe bash options so failures stop the script early (instead of silently continuing).

2. **Resolves important paths**  
   Computes repo root / script dir so all subsequent relative paths (test workspace, test extension output, etc.) work regardless of where you invoke it from.

3. **Builds/collects launch arguments**  
   Prepares the exact CLI flags passed to the VS Code executable under test, including:
   - extension development path
   - extension tests path
   - workspace/file target for the scenario

4. **Configures test environment**  
   Exports env vars needed for stable CI-like runs (headless/isolated behavior, deterministic telemetry/cache/user-data locations, etc., depending on scenario).

5. **Invokes the integration test runner**  
   Starts VS Code (or the test harness script) with those arguments so tests execute inside the **extension host**.

6. **Propagates exit code**  
   If tests fail, the script exits non-zero so CI marks the job as failed.

---

If you want, I can give you a **line-by-line walkthrough of that exact file** with each variable/command explained and how it maps to extension host testing.

---

The script launches a real VS Code (Electron) instance per suite, loads a test extension into it, and the extension runs Mocha inside the extension host. Some long lines in the file came back truncated (marked `[...]`), so I've noted below where I'm inferring.

## 1. Which VS Code binary is launched (lines 161-172)

```bash name=scripts/test-integration.sh url=https://github.com/microsoft/vscode/blob/d919583d5195fe12272642a2331ce27477f7aad8/scripts/test-integration.sh#L161-L172
if [ -z "$INTEGRATION_TEST_ELECTRON_PATH" ]
then
	INTEGRATION_TEST_ELECTRON_PATH="./scripts/code.sh"
	echo "Running integration tests out of sources."
else
	export VSCODE_CLI=1
	export ELECTRON_ENABLE_LOGGING=1
	echo "Running integration tests with '$INTEGRATION_TEST_ELECTRON_PATH' as build."
fi
```

- **Locally**, it runs `./scripts/code.sh`, which starts VS Code from your source checkout.
- **In CI**, `INTEGRATION_TEST_ELECTRON_PATH` points at a built product, so the tests run against the real build.

## 2. Isolation (lines 148-159)

- `VSCODEUSERDATADIR=$(mktemp -d)` creates a throwaway user-data directory, so the test instance never touches your real settings or extensions.
- The script seeds that directory with a `settings.json` that turns off OS notifications.
- Crash reports go to `.build/crashes` and logs go to `.build/logs/integration-tests`.
- The directory is deleted at the end (line 339).

## 3. The launch command (lines 235-245)

The API tests line is truncated in my fetch. The visible part is:

```bash
"$INTEGRATION_TEST_ELECTRON_PATH" \
  $ROOT/extensions/vscode-api-tests/testWorkspace \
  --enable-proposed-api=vscode.vscode-api-tests \
  --extensionDevelopmentPath=$ROOT/extensions/vscode-api-tests \
  --extensionTestsPath=... \
  $API_TESTS_EXTRA_ARGS
```

The Git suite (line 279) is fully visible and follows the same pattern:

```bash
"$INTEGRATION_TEST_ELECTRON_PATH" $(mktemp -d) \
  --extensionDevelopmentPath=$ROOT/extensions/git \
  --extensionTestsPath=$ROOT/extensions/git/out/test \
  $API_TESTS_EXTRA_ARGS
```

Each argument does one job:

| Argument | Purpose |
|---|---|
| First positional argument (folder or `.code-workspace`) | The workspace the test window opens. Git gets an empty temp folder. |
| `--extensionDevelopmentPath` | Loads that extension from source into the extension host, as if it were being developed. |
| `--extensionTestsPath` | Tells VS Code this is a test run. After startup, the host loads the module at this path and runs it as the test runner. |
| `--enable-proposed-api=...` | Lets the test extension use proposed (unstable) APIs. |
| `$API_TESTS_EXTRA_ARGS` | Makes the run deterministic: `--disable-telemetry`, `--disable-experiments`, `--skip-welcome`, `--skip-release-notes`, `--no-cached-data`, plus the crash and log paths. The line is truncated, so there are more flags I can't see. |

## 4. How tests run once the instance is up

`--extensionTestsPath` is the key flag. The sequence is:

1. Electron starts the main process and opens a window with the test workspace.
2. The extension host process starts and loads the extension from `--extensionDevelopmentPath`.
3. The host sees `--extensionTestsPath` and `require`s that module, which exports a `run()` function.
4. `run()` sets up Mocha, finds the compiled test files (for example `extensions/git/out/test`), and runs them.
5. Tests `import * as vscode from 'vscode'`, so they call the real API against the live app.
6. When `run()` finishes, the window closes and VS Code exits with the result, so a failed test gives a non-zero exit code.

This part is inferred from how VS Code's extension test mechanism works. I haven't yet read the runner module itself.

`--grep` is passed to Mocha through the `MOCHA_GREP` environment variable (line 223) and the `--grep` flag.

## 5. Other suite styles in the script

- **Node integration tests (lines 198-207):** `./scripts/test.sh --runGlob "**/*.integrationTest.js"` runs these with no window, in a Node/Electron test runner.
- **`npm run test-extension -- -l <name>`:** Used for colorize, markdown, ipynb, git-base and others. It's a helper that does the same launch with the extension name filled in.
- **CSS, HTML and JSON (lines 321-334):** `scripts/node-electron.sh test/index.js` runs these as plain Electron-as-Node scripts, with no workbench window.

## 6. Failure reporting (lines 13-31)

`start_suite` records the current suite name. Because of `set -e`, the first failing suite stops the script. The `EXIT` trap then prints `Integration tests failed in '<suite>' with exit code N`. On GitHub Actions it also emits an `::error` annotation.

## Useful commands

```bash
scripts/test-integration.sh --suite api-folder
scripts/test-integration.sh --suite git --grep "some test"
scripts/test-integration.sh --help
```

To see the other half, I can open the test runner module that `--extensionTestsPath` points to in `extensions/vscode-api-tests` and show how it configures Mocha. I can also pull the full untruncated launch lines.

