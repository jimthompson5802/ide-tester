# Coding standards

These standards apply to TypeScript implementation and tests under `smoke/`, including the helper extension. They formalize the current tester's conventions and establish clearer readability and typing requirements for future changes. They do not apply retroactively to retained historical Python designs.

Existing code is not uniformly compliant, particularly in explicit return types and test error typing. TypeScript sources have a shared Prettier formatting baseline. Apply these standards to new code and code changed for the approved task. Keep unrelated formatting and refactoring in separately scoped changes.

## Language and modules

- Use strict TypeScript and native Node ESM. Treat [tester compiler settings](tsconfig.json) and [helper compiler settings](helper/tsconfig.json) as the authoritative compilation configuration.
- Prefix Node built-in imports with `node:`. Use `.js` extensions in relative TypeScript imports to match compiled ESM resolution.
- Use type-only imports for symbols used only as types; inline `type` imports are acceptable.
- Edit TypeScript sources. Treat `dist/` and `helper/dist/` as generated output.

## Formatting and naming

- Use four-space indentation, single-quoted strings, semicolons, and trailing commas in multiline structures. Use template literals for interpolation.
- Put each statement and interface member on its own line. Expand control flow and long expressions when multiple actions, conditions, or nested alternatives obscure the sequence.
- Use `camelCase` for variables, functions, and methods; `PascalCase` for types and classes; and descriptive kebab-case module filenames. Name test files `<module>.test.ts`.
- Name operations by their observable purpose. Use names such as `requireAbsent` for precondition checks and `verifySavedFile` for evidence checks.
- Write comments to explain constraints, ownership, compatibility decisions, and non-obvious behavior. Keep comments consistent with the implementation.

## Types and contracts

- Represent finite states and outcomes with literal unions. Reuse an existing domain type when its meaning matches; keep unrelated concepts separate.
- Use `unknown` for untrusted values and caught errors, then narrow before accessing properties. Validate external JSON and filesystem data at the boundary; a type assertion does not validate runtime input.
- Give exported functions and public methods explicit return types. Allow inference for local implementation details where it remains clear.
- Justify type assertions and non-null assertions with a nearby checked invariant. Prefer narrowing when it makes that invariant explicit.
- Use small interfaces or function parameters for external dependencies that tests need to replace. Add abstractions for current requirements, following the repository's YAGNI rule.

## Responsibilities and boundaries

Follow the [module responsibility map](AGENTS.md#project-structure):

- Keep argument parsing and validation separate from execution.
- Keep suite orchestration separate from UI interaction mechanics, profile lifecycle, verification, and reporting.
- Keep selectors and Playwright interaction mechanics in the workbench layer. Express scenario intent through focused operations that can be exercised with test doubles.
- Keep filesystem, Git, and response verification independently testable without a running IDE or live Copilot service.
- Export only the contracts callers need. Keep the helper extension limited to its approved command responsibilities.

## Async work and external operations

- Await operations whose completion affects correctness or cleanup. Handle failures from intentionally detached work explicitly.
- Bound UI waits, polling, network activity, and subprocess execution with appropriate timeouts. Prefer observable readiness checks over fixed sleeps.
- Treat a timeout as a failed wait, not confirmation that the underlying operation stopped. Establish owned shutdown before releasing or deleting resources.
- Use argument arrays for subprocesses, with explicit working directories and controlled environments where isolation requires them. Keep user data out of executable shell text.

## Errors and evidence

- Distinguish functional failures, blocked prerequisites, and harness errors. Classify a known unmet prerequisite as blocked, an observed behavior mismatch as a functional failure, and a tester or observation-contract failure as a harness error. Classify timeouts from available evidence rather than assuming a product failure.
- Catch errors where recovery, outcome classification, or useful context is possible. Preserve the originating failure and completed evidence when adding context.
- Report cleanup and reporting failures separately so they remain visible alongside the original result. A pass requires the applicable behavior and cleanup checks to succeed.
- Include the operation stage and sanitized evidence needed to diagnose a failure. Follow the [repository privacy rules](../AGENTS.md#safety-and-authorization) and [tester secret-storage policy](AGENTS.md#secret-storage); apply existing backend-specific diagnostic restrictions.

## UI actions and independent verification

- Scope actions to the tester-owned application and workspace. Require unambiguous UI targets and verify the resulting state.
- Verify editor saves against exact expected disk bytes. Verify Git results through independent repository evidence as well as the required visible UI evidence.
- Associate Chat evidence with the current session and turn, and require a fresh, complete response. Preserve the distinction between mocked responses and real service behavior.
- Keep extension-host/API checks, mocked workbench tests, and real GUI qualification distinct in test names and reports. Non-GUI success alone does not establish real IDE behavior.

## Resource ownership and cleanup

- Verify ownership and path identity before destructive filesystem operations. Constrain deletion to explicitly owned disposable resources.
- Follow the established lifecycle for persistent profiles and owned processes. Retain resources when ownership or shutdown is uncertain and use the documented recovery procedure.
- Keep persistent profile changes within their approved settings and state contracts. Consult [tester instructions](AGENTS.md) before changing profile handling, launch isolation, or cleanup.
- Use disposable test fixtures and register their cleanup promptly. Include safety checks for refused cleanup and preserved resources when changing ownership behavior.

## Tests and validation

Follow the [repository validation rules](../AGENTS.md#validation), including TDD, manual checks when automation is unsuitable, and the four-unsuccessful-fix-round limit.

- Use `node:test` and strict Node assertions for non-GUI tests. Name tests by the observable behavior and relevant condition.
- Test public behavior and meaningful failure paths. Assert outcomes, evidence, and safety effects; assert operation order where it is part of the scenario contract.
- Keep test doubles focused on external boundaries. Exercise real local filesystem and Git behavior in disposable fixtures when those effects are the subject of the test.
- Compile before running non-GUI tests because the test command executes compiled JavaScript. Use the [documented commands and prerequisites](AGENTS.md#commands).
- Report checks actually performed and their limits. GUI checks require the separate authorization and environment conditions in the repository instructions.

## Dependencies, compatibility, and documentation

- Prefer Node built-ins and existing dependencies. Add dependencies, tooling, or platform support only for approved requirements.
- Keep dependency declarations and lockfiles consistent. Treat [package.json](package.json) as the command and engine source of truth; follow the [setup and compatibility guidance](README.md) when changing supported versions.
- Keep usage documentation consistent with verified behavior. Distinguish design targets, historical observations, and current qualification.
- Check relative links after documentation changes. Documentation-only changes require documentation checks, not runtime tests.

## Adoption and review

Use compiler checks, relevant tests, and code review to enforce these standards. Review changed code for readable layout, sound boundary validation, meaningful verification, and safe resource handling. Compiler and test success do not establish compliance with every rule.

ESLint and Prettier provide local automated checks:

```sh
npm --prefix smoke run lint
npm --prefix smoke run format:check
npm --prefix smoke run format
```

`lint` checks tester sources, tests, and the helper extension using the recommended ESLint/TypeScript rules, type-only imports, unused variables, and floating promises. It fails on warnings. Node test-registration calls are exempt from floating-promise checks because the test runner owns their completion. Constant loop conditions are allowed for bounded polling; deadlines remain a review responsibility. Setup's existing cleanup-error propagation has a documented local exception to `no-unsafe-finally`.

`format:check` checks TypeScript sources and tooling JSON/MJS files; `format` rewrites those files. Generated output, dependencies, and the lockfile are excluded. Markdown is outside the formatting command's scope. Configuration lives in [eslint.config.mjs](eslint.config.mjs), [.prettierrc.json](.prettierrc.json), and [.prettierignore](.prettierignore).

Explicit `any` is currently allowed to accommodate existing external data and test doubles. Explicit return types, naming, resource ownership, deadline adequacy, and evidence quality still require review. Prefer `unknown` and narrowing for new code as specified above. Broad typing cleanup or stricter enforcement is a separate scoped change. These commands are local checks; no CI workflow or Git hook is added. Repository authorization, preservation rules, and developer validation gates remain defined in [AGENTS.md](../AGENTS.md) and the applicable implementation plan.
