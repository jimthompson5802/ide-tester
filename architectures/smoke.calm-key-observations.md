# Smoke architecture discovery

⚠️ This is an initial discovery of potential CALM nodes and relationships based on static analysis of the codebase by an LLM. It may contain inaccuracies or omissions. Please review and validate each item before using it in your CALM architecture model.

Model: [smoke.calm.json](smoke.calm.json), CALM schema 1.2.

The model incorporates developer-directed revisions to the initial discovery: explicit MacOs Desktop and Internet ecosystems, the external Github Copilot service, renamed smoke test results, and revised connections. These modeling choices do not constitute additional runtime verification.

Scanned the following top-level subdirectories for the CALM nodes and relationships:

- src/: all TypeScript application source.
- helper/: extension implementation, manifest, and compiler configuration.
- tests/: all test source, as corroborating evidence rather than deployed nodes.

Root package manifests, lockfile, TypeScript configuration, and npm configuration were also inspected. Generated output and installed dependencies are excluded from application discovery. Documentation supplies scope and acceptance status, not primary node evidence.

## Nodes

| unique-id | node-type | name | description |
| --- | --- | --- | --- |
| internet | ecosystem | Internet | Groups external services accessed over the Internet. |
| github-copilot | service | Github Copilot | Provides the remote Copilot Chat backend used by real-backend smoke tests. |
| macos-desktop | ecosystem | MacOs Desktop | Groups the smoke tester, dedicated VS Code application, workspace, profile, and smoke test results. |
| developer | actor | Developer | Invokes smoke commands and manually signs into the real Chat profile. |
| smoke-tester | service | Smoke tester CLI | Runs Playwright suites, hosts the in-process mock API, and records results. |
| vscode | system | Dedicated VS Code application | Runs the editor, bundled Copilot Chat, and development helper extension. |
| workspace | data-asset | Disposable workspace | Holds editing fixtures and temporary exports of the active test Chat. |
| profile | data-asset | Dedicated profile and state | Holds isolated settings, global storage, extensions, renderer logs, and backend state. |
| smoke-test-results | data-asset | Smoke test results | Retains results, resource ownership records, and mock-mode failure diagnostics. |

## Relationships

| unique-id | relationship-type | source → destination | description |
| --- | --- | --- | --- |
| internet-composition | composed-of | internet → github-copilot | Contains the external Github Copilot service. |
| macos-desktop-composition | composed-of | macos-desktop → smoke-tester, vscode, workspace, profile, smoke-test-results | Contains the local smoke tester, dedicated VS Code application, workspace, profile, and smoke test results. |
| vscode-to-github-copilot | connects | vscode → github-copilot | test chat interface |
| developer-to-smoke-tester | interacts | developer → smoke-tester | Invokes suite, foundation, and real-profile setup commands. |
| developer-to-vscode | interacts | developer → vscode | Signs in manually and closes the dedicated setup window. |
| smoke-tester-to-vscode | connects | smoke-tester → vscode | Launches, drives, observes, and shuts down the owned application. |
| smoke-tester-to-workspace | connects | smoke-tester → workspace | Creates fixtures, verifies saved bytes, and reads then deletes Chat exports. |
| vscode-to-workspace | connects | vscode → workspace | Opens, edits, saves, reopens, and exports test-owned files. |
| smoke-tester-to-profile | connects | smoke-tester → profile | Prepares or checks settings and ownership and reads renderer logs. |
| vscode-to-profile | connects | vscode → profile | Uses dedicated profile directories and writes session logs. |
| smoke-tester-to-smoke-test-results | connects | smoke-tester → smoke-test-results | Writes results and ownership records and captures mock-mode failure diagnostics. |

## Key observations

- Ecosystem boundaries: MacOs Desktop contains the tester, VS Code, disposable workspace, dedicated profile, and smoke test results. Internet contains Github Copilot outside the desktop boundary. The developer actor is outside both ecosystems. Composition expresses logical grouping, not an additional runtime process.
- Deployment boundaries: the Node CLI and launched VS Code application are separate runtime boundaries. The HTTP mock runs inside the CLI process. Playwright, suite modules, and reporting modules are libraries, not independently deployed services. VS Code is one application boundary including its renderer and extension-host processes; the helper loads through extensionDevelopmentPath.
- Storage boundaries: workspace, profile, and smoke test results are file-backed assets, not services. The renamed results asset retains its physical reports/smoke/<run-id> path. Mock initialization uses node:sqlite to seed User/globalStorage/state.vscdb; the embedded database is included in profile storage.
- Authentication and trust: mock mode uses synthetic credentials and explicit loopback endpoint overrides. Real mode requires a marked persistent profile, rejects Copilot overrides, filters inherited environment variables, and leaves authentication manual. No private profile contents were read during discovery.
- External dependencies: Node, Playwright, TypeScript, installed VS Code, and bundled Copilot Chat. App resolution invokes /usr/bin/plutil as a local utility, not a service. Executable preflight requires macOS arm64, Node 26.3.1, VS Code 1.135.0, and Copilot Chat 0.63.0.
- Real Chat delegates authentication and model-service calls to installed VS Code/Copilot code outside smoke/. The developer-directed Github Copilot service represents that external dependency, reached by vscode-to-github-copilot with description "test chat interface". No concrete remote endpoint or direct real-service API client is implemented in smoke/; the model does not resolve Copilot's internal services.
- Connection direction: smoke-tester → vscode represents launching, driving, observing, and shutting down the owned application. The reverse vscode → smoke-tester relationship has been removed from the model. The mock API remains documented on the tester interface; its loopback traffic is not represented by a separate relationship in this revised view.
- Endpoints: the mock listens on HTTP 127.0.0.1 at an ephemeral port. GET routes supply models, policy, and tokens; POST routes supply model sessions and streamed completions. Endpoint details are on the tester interface; relationship protocol fields are omitted.
- Lifecycle: an exclusive report reservation and resource ownership markers constrain cleanup. Successful disposable resources are removed after shutdown; failed or uncertain resources are retained. The real profile persists. Chat exports are removed from the disposable workspace after verification.
- Diagnostics: result.json/result.txt and ownership records go to reports. Mock failures may include screenshots and traces. Real runs disable screenshots/traces and use test-conversation evidence; reports remain separate from private persistent profile data.
- Potential sub-architectures: VS Code renderer, extension-host, Copilot internals, and remote services merit discovery against their own executable sources. Internal tester modules do not warrant separate deployment nodes.
- Static discovery does not establish runtime correctness, GUI behavior, authentication readiness, remote reachability, or acceptance of pending implementation gates. No GUI or authentication actions were performed.

## Primary source evidence

- Developer and CLI: [cli.ts](../smoke/src/cli.ts), [qualify.ts](../smoke/src/qualify.ts), [setup-real-chat.ts](../smoke/src/setup-real-chat.ts), [package.json](../smoke/package.json).
- Application lifecycle and mock routing: [runner.ts](../smoke/src/runner.ts), [mock.ts](../smoke/src/mock.ts), [profile.ts](../smoke/src/profile.ts).
- IDE interaction and helper: [workbench.ts](../smoke/src/workbench.ts), [extension.ts](../smoke/helper/extension.ts), [helper manifest](../smoke/helper/package.json).
- Files and session evidence: [editing.ts](../smoke/src/editing.ts), [files.ts](../smoke/src/files.ts), [session.ts](../smoke/src/session.ts), [chat.ts](../smoke/src/chat.ts), [turn.ts](../smoke/src/turn.ts).
- Storage, profiles, reporting, and compatibility: [resources.ts](../smoke/src/resources.ts), [real-profile.ts](../smoke/src/real-profile.ts), [report.ts](../smoke/src/report.ts), [app.ts](../smoke/src/app.ts), [arguments.ts](../smoke/src/arguments.ts).

## Validation

Passed installed CALM CLI strict validation, both architecture-only checks and explicit validation against its bundled release/1.2/meta/calm.json schema: hasErrors=false and hasWarnings=false, with no JSON Schema or Spectral findings. The remote schema URL was blocked by the existing CLI host allowlist; the bundled official schema allowed offline validation without configuration changes. Relative Markdown links were checked and resolve. Runtime tests are outside this documentation-only discovery.

After the architecture revisions, `calm validate -a architectures/smoke.calm.json` passed with hasErrors=false and hasWarnings=false. The observations were checked against the revised model's node and relationship tables, and relative links were rechecked. The earlier explicit bundled-schema validation above records the initial discovery; it was not repeated for this documentation update.
