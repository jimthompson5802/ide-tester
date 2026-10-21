"""Bounded macOS-only Phase 1 probe. No prompts, responses or credentials logged."""

import argparse
import hashlib
import json
import os
import plistlib
import subprocess
import time
import uuid
from pathlib import Path

import AppKit
import ApplicationServices as AX
import Quartz

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / ".ide-smoke/m1-00"
STATE = DATA / "session.json"
PROFILE = ROOT / "profiles/m1-00/user-data"
EXTENSIONS = ROOT / "profiles/m1-00/extensions"
CONTENTS = Path("/Applications/Visual Studio Code.app/Contents")
EXECUTABLE = CONTENTS / "MacOS" / plistlib.loads((CONTENTS / "Info.plist").read_bytes())["CFBundleExecutable"]


def attr(element, name):
    error, value = AX.AXUIElementCopyAttributeValue(element, name, None)
    return value if error == 0 else None


def apps():
    return list(AppKit.NSRunningApplication.runningApplicationsWithBundleIdentifier_(
        "com.microsoft.VSCode"
    ))


def safe_path(path):
    if not path.is_relative_to(ROOT):
        raise RuntimeError("Path outside checkout")
    for parent in [path, *path.parents]:
        if parent == ROOT:
            break
        if parent.is_symlink():
            raise RuntimeError("Symlink in artifact path")
    subprocess.run(["git", "check-ignore", "-q", str(path)], cwd=ROOT, check=True)
    if subprocess.check_output(["git", "ls-files", "--", str(path)], cwd=ROOT):
        raise RuntimeError("Tracked artifact path")


def windows(pid):
    application = AX.AXUIElementCreateApplication(pid)
    AX.AXUIElementSetMessagingTimeout(application, 3.0)
    return list(attr(application, "AXWindows") or [])


def regular_snapshot(application):
    # Geometry and one-way title fingerprints only; no personal window text saved.
    rows = []
    for window in windows(application.processIdentifier()):
        position_ok, position = AX.AXValueGetValue(attr(window, "AXPosition"), AX.kAXValueCGPointType, None)
        size_ok, size = AX.AXValueGetValue(attr(window, "AXSize"), AX.kAXValueCGSizeType, None)
        if not position_ok or not size_ok:
            raise RuntimeError("Regular window geometry unavailable")
        rows.append({
            "title_sha256": hashlib.sha256(str(attr(window, "AXTitle")).encode()).hexdigest(),
            "position": [position.x, position.y],
            "size": [size.width, size.height],
            "minimized": bool(attr(window, "AXMinimized")),
        })
    return {"pid": application.processIdentifier(), "launch_date": str(application.launchDate()),
            "windows": rows}


def owned(state, require_window=True):
    app = AppKit.NSRunningApplication.runningApplicationWithProcessIdentifier_(state["pid"])
    if app is None or app.isTerminated():
        raise RuntimeError("Owned instance absent")
    if str(app.launchDate()) != state["launch_date"]:
        raise RuntimeError("PID identity changed")
    if Path(app.executableURL().path()).resolve() != EXECUTABLE.resolve():
        raise RuntimeError("Unexpected executable")
    args = subprocess.check_output(["ps", "-p", str(state["pid"]), "-o", "command="], text=True)
    for expected in [f"--user-data-dir={PROFILE}", f"--extensions-dir={EXTENSIONS}", state["workspace"]]:
        if expected not in args:
            raise RuntimeError("Process arguments do not prove ownership")
    workspace = Path(state["workspace"])
    safe_path(workspace)
    if (workspace / "m1-00-marker.txt").read_text() != state["run_id"] + "\n":
        raise RuntimeError("Workspace marker mismatch")
    current = windows(state["pid"])
    matched = [w for w in current if state["run_id"] in str(attr(w, "AXTitle"))]
    if require_window and len(matched) != 1:
        raise RuntimeError("Expected exactly one owned workspace window")
    return app, matched


def regular_unchanged(state):
    results = []
    for before in state["regular"]:
        app = AppKit.NSRunningApplication.runningApplicationWithProcessIdentifier_(before["pid"])
        results.append(app is not None and not app.isTerminated() and regular_snapshot(app) == before)
    return bool(results) and all(results)


def activate(state):
    app, selected = owned(state)
    AX.AXUIElementPerformAction(selected[0], "AXRaise")
    if not app.activateWithOptions_(AppKit.NSApplicationActivateIgnoringOtherApps):
        raise RuntimeError("Owned app activation failed")
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        front = AppKit.NSWorkspace.sharedWorkspace().frontmostApplication()
        if front is not None and front.processIdentifier() == state["pid"]:
            return
        time.sleep(0.1)
    raise RuntimeError("Owned app not frontmost")


def key(state, code, flags=0):
    for down in [True, False]:
        owned(state)
        front = AppKit.NSWorkspace.sharedWorkspace().frontmostApplication()
        if front is None or front.processIdentifier() != state["pid"]:
            raise RuntimeError("Focus changed; no further keys sent")
        event = Quartz.CGEventCreateKeyboardEvent(None, code, down)
        Quartz.CGEventSetFlags(event, flags)
        Quartz.CGEventPost(Quartz.kCGSessionEventTap, event)


def palette_input(state):
    activate(state)
    key(state, 35, Quartz.kCGEventFlagMaskCommand | Quartz.kCGEventFlagMaskShift)
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        _, selected = owned(state)
        matches = [e for e, _, _ in tree(selected[0]) if attr(e, "AXRole") == "AXTextField"]
        if len(matches) == 1:
            return matches[0]
        time.sleep(0.1)
    raise RuntimeError("Palette text field not observed")


def launch():
    if STATE.exists():
        raise RuntimeError("Session record exists; inspect or close it first")
    regular = [regular_snapshot(app) for app in apps()]
    if not regular or not any(item["windows"] for item in regular):
        raise RuntimeError("Regular VS Code window required")
    run_id = "m1-00-" + uuid.uuid4().hex[:10]
    workspace = ROOT / "workspaces/m1-00" / run_id
    for path in [DATA, PROFILE, EXTENSIONS, workspace]:
        safe_path(path)
        path.mkdir(parents=True, exist_ok=True)
    (workspace / "m1-00-marker.txt").write_text(run_id + "\n")
    args = [str(EXECUTABLE), f"--user-data-dir={PROFILE}", f"--extensions-dir={EXTENSIONS}",
            "--new-window", "--skip-welcome", "--skip-release-notes", str(workspace)]
    # Deliberately discard Electron output: it may include account/service details.
    process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               start_new_session=True)
    deadline = time.monotonic() + 35
    state = {"run_id": run_id, "pid": process.pid, "workspace": str(workspace), "regular": regular}
    while time.monotonic() < deadline:
        app = AppKit.NSRunningApplication.runningApplicationWithProcessIdentifier_(process.pid)
        if app is not None:
            state["launch_date"] = str(app.launchDate())
            STATE.write_text(json.dumps(state, indent=2) + "\n")
            try:
                owned(state)
                print(json.dumps({"launched": True, "pid": process.pid, "run_id": run_id,
                                  "regular_unchanged": regular_unchanged(state)}), flush=True)
                # Keep the executor session alive while other probe invocations inspect
                # the app; executor teardown can otherwise end a newly launched child.
                while process.poll() is None:
                    time.sleep(0.5)
                return
            except RuntimeError:
                pass
        if process.poll() is not None:
            break
        time.sleep(0.3)
    raise RuntimeError("Launch/window correlation unresolved; preserve session record and inspect")


# Only known non-sensitive UI labels are emitted; values and unknown labels omitted.
SAFE_LABELS = {
    "Chat", "Toggle Chat", "Open Chat", "New Chat", "Copilot", "GitHub Copilot",
    "Sign in", "Sign in to GitHub", "Sign in to use Copilot", "Get Started",
    "Ask", "Agent", "Edit", "Auto", "Welcome", "Explorer", "Accounts",
    "Send", "Cancel", "Stop", "Trust", "Yes, I trust the authors", "Restricted Mode",
    "Do you trust the authors of the files in this folder?", "Manage", "Close",
    "Chat: Open Chat (Ask)", "Open Chat (Ask)",
}
SAFE_FRAGMENTS = ["Sign in", "GitHub", "Copilot", "Chat", "Agent", "Ask", "Trust",
                  "model", "Model", "Continue", "Send", "Cancel", "Stop", "Auto"]


def tree(window):
    queue = [(window, "0", 0)]
    count = 0
    while queue and count < 1400:
        element, path, depth = queue.pop(0)
        count += 1
        yield element, path, depth
        if depth < 45:
            children = list(attr(element, "AXChildren") or [])
            queue.extend((child, f"{path}.{i}", depth + 1) for i, child in enumerate(children[:160]))


def inspect(state):
    app, selected = owned(state)
    rows = []
    for element, path, depth in tree(selected[0]):
        role = str(attr(element, "AXRole") or "")
        labels = {}
        for key in ["AXTitle", "AXDescription", "AXHelp", "AXIdentifier", "AXRoleDescription"]:
            value = str(attr(element, key) or "")
            if value in SAFE_LABELS:
                labels[key] = value
            elif value:
                labels[key] = {"length": len(value), "sha256": hashlib.sha256(value.encode()).hexdigest(),
                               "recognized_fragments": [part for part in SAFE_FRAGMENTS if part in value]}
        error, actions = AX.AXUIElementCopyActionNames(element, None)
        rows.append({"path": path, "depth": depth, "role": role, "labels": labels,
                     "actions": list(actions) if error == 0 else [],
                     "enabled": bool(attr(element, "AXEnabled"))})
    result = {"pid": state["pid"], "owned_workspace_window": True,
              "regular_unchanged": regular_unchanged(state), "nodes": rows,
              "node_limit": 1400, "depth_limit": 45}
    (DATA / f"{state['run_id']}-tree.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


def close(state):
    app, _ = owned(state, require_window=False)
    if not app.terminate():
        raise RuntimeError("Owned app refused termination; no force kill attempted")
    deadline = time.monotonic() + 15
    def exited():
        try:
            os.kill(state["pid"], 0)
            return False
        except ProcessLookupError:
            return True

    while not exited() and time.monotonic() < deadline:
        time.sleep(0.2)
    result = {"owned_app_exited": exited(),
              "regular_unchanged": regular_unchanged(state), "profile_preserved": PROFILE.is_dir()}
    (DATA / f"{state['run_id']}-cleanup.json").write_text(json.dumps(result, indent=2) + "\n")
    if not result["owned_app_exited"]:
        raise RuntimeError("Owned app shutdown timeout; state preserved")
    STATE.rename(DATA / f"{state['run_id']}-session.json")
    print(json.dumps(result))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["launch", "inspect", "enable-accessibility", "open-chat", "press", "focus-input", "input-probe", "input-keys", "palette", "palette-key", "open-ask", "close"])
    parser.add_argument("--role")
    parser.add_argument("--attribute", choices=["AXTitle", "AXDescription"])
    parser.add_argument("--sha256")
    parser.add_argument("--action", choices=["AXPress", "AXCancel"], default="AXPress")
    arguments = parser.parse_args()
    command = arguments.command
    if not AX.AXIsProcessTrusted():
        raise SystemExit("BLOCKED: Accessibility trust unavailable")
    if command == "launch":
        launch()
    else:
        state = json.loads(STATE.read_text())
        if command == "enable-accessibility":
            owned(state)
            application = AX.AXUIElementCreateApplication(state["pid"])
            error = AX.AXUIElementSetAttributeValue(application, "AXManualAccessibility", True)
            print(json.dumps({"AXManualAccessibility_set_error": error}))
            if error:
                raise RuntimeError("Cannot enable owned Electron Accessibility tree")
        elif command == "open-chat":
            app, selected = owned(state)
            matches = [element for element, _, _ in tree(selected[0])
                       if attr(element, "AXRole") == "AXButton" and attr(element, "AXTitle") == "Toggle Chat"]
            if len(matches) != 1:
                raise RuntimeError("Toggle Chat title selector is not unique")
            owned(state)
            error = AX.AXUIElementPerformAction(matches[0], "AXPress")
            print(json.dumps({"Toggle_Chat_matches": len(matches), "AXPress_error": error}))
            if error:
                raise RuntimeError("Chat toggle action failed")
        elif command == "palette-key":
            palette_input(state)
            print(json.dumps({"palette_keys_sent_with_owned_frontmost_checks": True}))
            inspect(state)
        elif command == "open-ask":
            field = palette_input(state)
            expected = ">Chat: Open Chat (Ask)"
            error = AX.AXUIElementSetAttributeValue(field, "AXValue", expected)
            deadline = time.monotonic() + 3
            matched = False
            while time.monotonic() < deadline:
                _, selected = owned(state)
                matched = any("Open Chat (Ask)" in str(attr(e, name) or "")
                              for e, _, _ in tree(selected[0]) for name in ["AXTitle", "AXDescription", "AXValue"])
                if attr(field, "AXValue") == expected and matched:
                    break
                time.sleep(0.1)
            else:
                inspect(state)
                raise RuntimeError("Ask command input/result not observed; no Enter sent")
            key(state, 36)
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                _, selected = owned(state)
                if any(attr(e, "AXRole") == "AXPopUpButton" and "Ask" in str(attr(e, "AXDescription") or "")
                       for e, _, _ in tree(selected[0])):
                    print(json.dumps({"open_ask_command_observed": True, "Ask_mode_observed": True}))
                    inspect(state)
                    break
                time.sleep(0.1)
            else:
                inspect(state)
                raise RuntimeError("Ask mode not observed after command")
        elif command == "palette":
            app, _ = owned(state)
            bar = attr(AX.AXUIElementCreateApplication(state["pid"]), "AXMenuBar")
            matches = [element for element, _, _ in tree(bar)
                       if attr(element, "AXRole") == "AXMenuItem" and
                       attr(element, "AXTitle") == "Command Palette…"]
            if len(matches) != 1:
                raise RuntimeError("Native Command Palette menu selector is not unique")
            owned(state)
            error = AX.AXUIElementPerformAction(matches[0], "AXPress")
            print(json.dumps({"native_palette_menu_matches": 1, "AXPress_error": error}))
            if error:
                raise RuntimeError("Native Command Palette action failed")
        elif command == "input-keys":
            activate(state)
            _, selected = owned(state)
            if not any("Screen Reader Optimized" in str(attr(e, attribute) or "")
                       for e, _, _ in tree(selected[0]) for attribute in ["AXTitle", "AXDescription"]):
                raise RuntimeError("BLOCKED: input readback requires verified screen-reader mode; use editor.accessibilitySupport=on in the test profile")
            matches = [e for e, _, _ in tree(selected[0]) if attr(e, "AXRole") == "AXTextArea"]
            if len(matches) != 1 or attr(matches[0], "AXValue") not in [None, "", "\n"]:
                raise RuntimeError("Unique empty Chat input required")
            element = matches[0]
            AX.AXUIElementPerformAction(element, "AXPress")
            AX.AXUIElementSetAttributeValue(element, "AXFocused", True)
            deadline = time.monotonic() + 3
            while not attr(element, "AXFocused") and time.monotonic() < deadline:
                time.sleep(0.1)
            if not attr(element, "AXFocused"):
                raise RuntimeError("Input focus unverified; no text keys sent")
            synthetic = "m100"
            try:
                for code in [46, 18, 29, 29]:
                    if not attr(element, "AXFocused"):
                        raise RuntimeError("Input focus changed; no further text keys sent")
                    key(state, code)
                deadline = time.monotonic() + 3
                while attr(element, "AXValue") != synthetic and time.monotonic() < deadline:
                    time.sleep(0.1)
                key(state, 0, Quartz.kCGEventFlagMaskCommand)
                deadline = time.monotonic() + 3
                while attr(element, "AXSelectedText") != synthetic and time.monotonic() < deadline:
                    time.sleep(0.1)
                value = attr(element, "AXValue")
                selected_text = attr(element, "AXSelectedText")
                observed = value == synthetic or selected_text == synthetic
                observed_lengths = {"value_length": len(str(value or "")),
                                    "selected_text_length": len(str(selected_text or "")),
                                    "value_exact": value == synthetic, "selected_text_exact": selected_text == synthetic}
            finally:
                owned(state)
                if not attr(element, "AXFocused"):
                    raise RuntimeError("Input lost focus; preserve unsent text for manual cleanup")
                key(state, 0, Quartz.kCGEventFlagMaskCommand)
                key(state, 51)
                deadline = time.monotonic() + 3
                while attr(element, "AXValue") not in ["", "\n"] and time.monotonic() < deadline:
                    time.sleep(0.1)
            result = {"unique_input": True, "focus_verified": True, "synthetic_value_observed": observed,
                      "input_empty_after": attr(element, "AXValue") in ["", "\n"], "submitted": False,
                      "regular_unchanged": regular_unchanged(state), "observed_lengths": observed_lengths}
            (DATA / f"{state['run_id']}-input-physical-keys-{time.time_ns()}.json").write_text(json.dumps(result, indent=2) + "\n")
            print(json.dumps(result))
            if not observed or not result["input_empty_after"]:
                raise RuntimeError("Keyboard input observation/clear check failed")
        elif command == "input-probe":
            activate(state)
            _, selected = owned(state)
            matches = [element for element, _, _ in tree(selected[0]) if attr(element, "AXRole") == "AXTextArea"]
            if len(matches) != 1:
                raise RuntimeError("Chat input selector is not unique")
            element = matches[0]
            original = attr(element, "AXValue")
            if original not in [None, ""]:
                raise RuntimeError("Input not empty; preserve existing content")
            error, settable = AX.AXUIElementIsAttributeSettable(element, "AXValue", None)
            if error or not settable:
                raise RuntimeError("Chat input value not settable")
            observed = False
            clear_error = None
            try:
                owned(state)
                error = AX.AXUIElementSetAttributeValue(element, "AXValue", "M1-00 setup probe; do not submit")
                deadline = time.monotonic() + 3
                while error == 0 and time.monotonic() < deadline:
                    if attr(element, "AXValue") == "M1-00 setup probe; do not submit":
                        observed = True
                        break
                    time.sleep(0.1)
            finally:
                owned(state)
                clear_error = AX.AXUIElementSetAttributeValue(element, "AXValue", "")
                deadline = time.monotonic() + 3
                while attr(element, "AXValue") != "" and time.monotonic() < deadline:
                    time.sleep(0.1)
            result = {"unique_input": True, "value_set_error": error, "synthetic_value_observed": observed,
                      "clear_error": clear_error, "input_empty_after": attr(element, "AXValue") == "",
                      "submitted": False, "regular_unchanged": regular_unchanged(state)}
            (DATA / f"{state['run_id']}-input-probe.json").write_text(json.dumps(result, indent=2) + "\n")
            print(json.dumps(result))
            if not observed or clear_error or not result["input_empty_after"]:
                raise RuntimeError("Input observation/clear check did not pass")
        elif command in ["press", "focus-input"]:
            app, selected = owned(state)
            if command == "focus-input":
                matches = [element for element, _, _ in tree(selected[0]) if attr(element, "AXRole") == "AXTextArea"]
            else:
                if not all([arguments.role, arguments.attribute, arguments.sha256]):
                    raise RuntimeError("press requires an observed role/attribute/hash selector")
                matches = [element for element, _, _ in tree(selected[0])
                           if attr(element, "AXRole") == arguments.role and
                           hashlib.sha256(str(attr(element, arguments.attribute) or "").encode()).hexdigest() == arguments.sha256]
            if len(matches) != 1:
                raise RuntimeError("Action selector is not unique")
            owned(state)
            error = (AX.AXUIElementSetAttributeValue(matches[0], "AXFocused", True) if command == "focus-input"
                     else AX.AXUIElementPerformAction(matches[0], arguments.action))
            print(json.dumps({"command": command, "matches": len(matches), "AX_error": error,
                              "focused_after": bool(attr(matches[0], "AXFocused")) if command == "focus-input" else None}))
            if error:
                raise RuntimeError("Owned semantic action failed")
            if command == "focus-input" and not attr(matches[0], "AXFocused"):
                raise RuntimeError("Focus action accepted but focus outcome unverified")
        else:
            {"inspect": inspect, "close": close}[command](state)


if __name__ == "__main__":
    main()
