"""Read-only M1-00 prerequisite probe; never prompts or sends GUI actions.

Run with the checkout's .venv/bin/python. Output excludes window titles,
process arguments, UI content and credentials. Exit 2 means blocked prerequisites.
"""

import importlib.metadata
import json
import platform
import site
import sys
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[3]
    if sys.platform != "darwin":
        print(json.dumps({"outcome": "BLOCKED", "reason": "macOS required"}))
        return 2
    if Path(sys.prefix).resolve() != (root / ".venv").resolve():
        print(json.dumps({"outcome": "BLOCKED", "reason": "checkout .venv required"}))
        return 2

    # Keep macOS-only imports inside the host-specific execution path.
    import AppKit
    import ApplicationServices as AX

    trusted = bool(AX.AXIsProcessTrusted())
    workspace = AppKit.NSWorkspace.sharedWorkspace()
    session_visible = workspace.frontmostApplication() is not None
    regular_count = len(
        AppKit.NSRunningApplication.runningApplicationsWithBundleIdentifier_(
            "com.microsoft.VSCode"
        )
    )
    blockers = []
    if not trusted:
        blockers.append("Accessibility trust unavailable to this process")
    if not session_visible:
        blockers.append("graphical session not visible to this process")
    if regular_count == 0:
        blockers.append("regular VS Code application not visible for coexistence check")

    dependencies = []
    for distribution in sorted(
        importlib.metadata.distributions(), key=lambda item: item.metadata["Name"]
    ):
        dependencies.append({
            "name": distribution.metadata["Name"],
            "version": distribution.version,
            "wheel_tags": [
                line.removeprefix("Tag: ")
                for line in (distribution.read_text("WHEEL") or "").splitlines()
                if line.startswith("Tag: ")
            ],
        })
    print(json.dumps({
        "outcome": "BLOCKED" if blockers else "PREREQUISITES_OBSERVED",
        "blockers": blockers,
        "python": platform.python_version(),
        "architecture": platform.machine(),
        "checkout_environment": True,
        "user_site_enabled": site.ENABLE_USER_SITE,
        "accessibility_trusted_no_prompt": trusted,
        "gui_session_visible": session_visible,
        "vscode_application_count": regular_count,
        "dependencies": dependencies,
        "limitations": [
            "Application count does not establish window coexistence or ownership",
            "Sandbox results may differ from the authorized host context",
            "Permission check does not identify the macOS consent attribution",
            "Desktop reservation and manual setup readiness require developer confirmation",
        ],
    }, indent=2))
    return 2 if blockers else 0


if __name__ == "__main__":
    raise SystemExit(main())
