"""Known everyday macOS VS Code locations; no native imports or content reads."""

from pathlib import Path


def macos_protected_paths(home):
    """Explicit default Stable/Insiders/Exploration locations; metadata only."""
    home = Path(home)
    return tuple(home / relative for relative in (
        "Library/Application Support/Code", "Library/Application Support/Code - Insiders",
        "Library/Application Support/Code - Exploration", ".vscode", ".vscode-insiders",
        ".vscode-exploration",
    ))


