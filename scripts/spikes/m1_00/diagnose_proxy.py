"""Diagnose Monaco's AX input proxy; expose only synthetic-content comparisons."""

import json
import time

import discover as d


def wait(predicate, seconds=3):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.1)
    return False


def nodes(state):
    _, windows = d.owned(state)
    return list(d.tree(windows[0]))


def input_element(state):
    matches = [e for e, _, _ in nodes(state) if d.attr(e, "AXRole") == "AXTextArea"]
    if len(matches) != 1:
        raise RuntimeError("Unique input required")
    return matches[0]


def focus(state):
    d.activate(state)
    element = input_element(state)
    d.AX.AXUIElementPerformAction(element, "AXPress")
    d.AX.AXUIElementSetAttributeValue(element, "AXFocused", True)
    if not wait(lambda: bool(d.attr(element, "AXFocused"))):
        raise RuntimeError("Input focus unverified")
    return element


def main():
    state = json.loads(d.STATE.read_text())
    d.owned(state)
    settings = d.PROFILE / "User/settings.json"
    d.safe_path(settings)
    if settings.exists():
        raise RuntimeError("Expected restored absent settings file")
    record = {"submitted": False}
    try:
        settings.write_text(json.dumps({"editor.accessibilitySupport": "on"}) + "\n")
        record["screen_reader_indicator"] = wait(lambda: any(
            "Screen Reader Optimized" in str(d.attr(e, "AXDescription") or "") or
            "Screen Reader Optimized" in str(d.attr(e, "AXTitle") or "")
            for e, _, _ in nodes(state)), 5)
        element = focus(state)
        value = str(d.attr(element, "AXValue") or "")
        # No arbitrary text is exposed or erased. Only our exact known markers qualify.
        residue = value.replace("m100", "").replace("M1-00 setup probe; do not submit", "").strip()
        record["revealed_input"] = {"length": len(value), "exact_m100": value == "m100",
                                    "only_known_synthetic_markers": not residue,
                                    "whitespace_codepoints": [ord(c) for c in value if c.isspace()]}
        if value and residue:
            raise RuntimeError("Unexpected existing content; preserve for developer")
        if value.strip():
            d.key(state, 0, d.Quartz.kCGEventFlagMaskCommand)
            record["selection_verified"] = wait(lambda: d.attr(element, "AXSelectedText") == value)
            if not record["selection_verified"]:
                raise RuntimeError("Cannot verify selection; no Delete sent")
            d.key(state, 51)
            record["clear_verified_in_screen_reader_mode"] = wait(lambda: d.attr(element, "AXValue") == "")
            if not record["clear_verified_in_screen_reader_mode"]:
                raise RuntimeError("Cannot verify actual clear")

        # Change observation configuration, then deliver the same four physical keys.
        settings.write_text(json.dumps({"editor.accessibilitySupport": "off"}) + "\n")
        record["screen_reader_indicator_gone"] = wait(lambda: not any(
            "Screen Reader Optimized" in str(d.attr(e, "AXDescription") or "") or
            "Screen Reader Optimized" in str(d.attr(e, "AXTitle") or "")
            for e, _, _ in nodes(state)), 5)
        element = focus(state)
        for code in [46, 18, 29, 29]:
            d.key(state, code)
        record["off_mode_value_exact"] = wait(lambda: d.attr(element, "AXValue") == "m100", 1)
        record["off_mode_value_length"] = len(str(d.attr(element, "AXValue") or ""))
        # Do not type or delete between these observations: only the setting changes.
        settings.write_text(json.dumps({"editor.accessibilitySupport": "on"}) + "\n")
        record["on_mode_same_text_after_trim"] = wait(lambda: str(d.attr(input_element(state), "AXValue") or "").strip() == "m100", 5)
        element = focus(state)
        value = str(d.attr(element, "AXValue") or "")
        record["on_mode_value_length"] = len(value)
        record["on_mode_whitespace_codepoints"] = [ord(c) for c in value if c.isspace()]
        if value.strip() == "m100":
            d.key(state, 0, d.Quartz.kCGEventFlagMaskCommand)
            record["final_selection_verified"] = wait(lambda: str(d.attr(element, "AXSelectedText") or "").strip() == "m100")
            if not record["final_selection_verified"]:
                raise RuntimeError("Cannot verify final selection")
            d.key(state, 51)
            record["final_clear_verified"] = wait(lambda: not str(d.attr(element, "AXValue") or "").strip())
        else:
            raise RuntimeError("Differential input check unresolved; preserve content")
    finally:
        settings.unlink(missing_ok=True)
        record["test_settings_restored"] = not settings.exists()
        record["regular_unchanged"] = d.regular_unchanged(state)
        (d.DATA / "input-proxy-diagnosis.json").write_text(json.dumps(record, indent=2) + "\n")
        print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
