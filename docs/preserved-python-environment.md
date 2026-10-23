# Preserved Python environment

Read this guide before proposing changes to the retained Python environment or performing separately authorized environment work. The active tester is TypeScript under `smoke/`; its Node setup is documented in the [tester README](../smoke/README.md#non-gui-commands).

## Current state and preservation

The previous Python harness source was removed from `main`. Its repository-local `.venv/` and root environment definitions remain preserved under the [repository instructions](../AGENTS.md#preserved-resources). Keep `.venv/`, `pyproject.toml`, `uv.lock`, and `.python-version` unchanged unless their modification is separately authorized. Follow the root instructions for editor settings, profiles, and private local resources.

Root package metadata, the editable installation, and `.venv/bin/ide-smoke` may still reference the removed `src/ide_smoke/` package. Historical Python installation, build, synchronization, and CLI examples are unavailable until a replacement Python package is approved and implemented. Preserve the environment without reinstalling the project or regenerating its lock.

Use [pyproject.toml](../pyproject.toml) for dependency declarations and [uv.lock](../uv.lock) for exact resolved versions. The [Python version pin](../.python-version) selects Python 3.12. These definitions preserve the former package; they do not establish runnable harness functionality.

## Interpreter and tooling constraints

- Use the existing Homebrew uv installation to manage the repository-local environment. Do not install another uv.
- Reuse `/opt/homebrew/bin/python3.12`; disable Python downloads and keep system Python unchanged.
- Use `.venv/bin/python` explicitly for repository-local Python execution.
- Before authorized environment work, recheck host and process architecture, the resolved interpreter and patch version, and environment isolation in the actual execution context. Python 3.12.15 arm64 was historically qualified; that observation does not establish the current execution context.
- Compiler and toolchain installation is outside this workflow. Reconsider dependencies that require native source builds.

## Procedure for separately authorized dependency work

1. Inspect the current environment references, `pyproject.toml`, `uv.lock`, and `.python-version` before proposing changes. Establish the approved dependency scope and confirm the interpreter and tooling constraints above.
2. Preserve extra installed distributions with `--inexact`. Plain `uv sync` can prune preserved packages.
3. Install compatible dependency and build-backend wheels with third-party source builds and Python downloads disabled. Missing wheels are a blocked prerequisite, not permission to install a compiler or build from source.
4. Install local pure-Python source offline only after replacement source is approved and implemented and its build backend is available. Avoid dependency resolution or isolated backend downloads during that local installation.
5. Verify the authorized outcome and report the commands actually run, resolved versions, and limitations. Historical Python test results do not establish current behavior.

Report-local uv caches and qualification environments were intentionally removed. Do not assume historical offline artifacts are still available. This guide preserves constraints for future authorized work; it does not authorize installation, synchronization, package replacement, or environment recreation.

## Historical references

The [Milestone 0 setup guide](../specifications/ide-milestone0-environment-setup.md) and [final qualification record](implementation-plans/M0-05.md) retain the original setup decisions and observations. Read them for historical context, applying the current preservation rules above. Their commands and approvals do not authorize resumption. For the archived Python implementation, see the root README's [Historical Notes](../README.md#historical-notes).
