"""Phase 1 macOS discovery: one synthetic request and bounded redacted observations.

This records candidate UI signals, without deciding freshness or completion.
It is not the Phase 2 demonstration or an authentication-reuse check.
"""

import argparse
import hashlib
import json
import time

import discover as d


def snapshot(state):
    _, windows = d.owned(state)
    rows = []
    for element, path, _ in d.tree(windows[0]):
        role = str(d.attr(element, "AXRole") or "")
        labels = [str(d.attr(element, name) or "")
                  for name in ["AXTitle", "AXDescription", "AXHelp"]]
        value = str(d.attr(element, "AXValue") or "")
        classes = [name for name in list(d.attr(element, "AXDOMClassList") or [])
                   if name in {"interactive-request", "interactive-response", "chat-response-loading",
                               "chat-response-completed-at", "chat-footer-details"}]
        identifier = str(d.attr(element, "AXDOMIdentifier") or "")
        signals = [word for word in ["Stop", "Cancel", "Error", "error", "Canceled",
                                     "cancelled", "Thinking", "Generating", "Copy",
                                     "Good response", "Bad response", "Retry", "Send"]
                   if any(word in label for label in labels)]
        if role in ["AXRow", "AXList", "AXListItem", "AXTextArea"] or signals or classes or identifier or value.strip() == "READY":
            rows.append({"path": path, "role": role, "signals": signals,
                         "label_hashes": [hashlib.sha256(label.encode()).hexdigest()
                                          for label in labels if label],
                         "value_length": len(value), "value_equals_marker": value.strip() == "READY",
                         "label_equals_marker": any(label.strip() == "READY" for label in labels),
                         "classes": classes,
                         "dom_identifier_hash": hashlib.sha256(identifier.encode()).hexdigest() if identifier else None,
                         "position_in_set": d.attr(element, "AXARIAPosInSet"),
                         "element_busy": bool(d.attr(element, "AXElementBusy")),
                         "enabled": bool(d.attr(element, "AXEnabled"))})
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cancel", action="store_true", help="Phase 2: cancel a harmless long request while loading")
    arguments = parser.parse_args()
    if not d.AX.AXIsProcessTrusted():
        raise RuntimeError("BLOCKED: Accessibility trust required")
    state = json.loads(d.STATE.read_text())
    if not d.regular_unchanged(state):
        raise RuntimeError("BLOCKED: regular-window baseline changed; review before further GUI actions")
    d.activate(state)
    _, windows = d.owned(state)
    nodes = list(d.tree(windows[0]))
    if not any("Screen Reader Optimized" in str(d.attr(e, a) or "")
               for e, _, _ in nodes for a in ["AXTitle", "AXDescription"]):
        raise RuntimeError("BLOCKED: verified screen-reader mode required")
    if not any(str(d.attr(e, "AXDescription") or "").endswith(" - Ask")
               for e, _, _ in nodes if d.attr(e, "AXRole") == "AXPopUpButton"):
        raise RuntimeError("BLOCKED: Ask mode required")
    fields = [e for e, _, _ in nodes if d.attr(e, "AXRole") == "AXTextArea"]
    if len(fields) != 1 or d.attr(fields[0], "AXValue") not in ["", "\n"]:
        raise RuntimeError("Unique empty input required; preserve existing content")
    field = fields[0]
    d.AX.AXUIElementPerformAction(field, "AXPress")
    d.AX.AXUIElementSetAttributeValue(field, "AXFocused", True)
    if not d.attr(field, "AXFocused"):
        raise RuntimeError("Input focus unverified")
    record = {"run_id": state["run_id"], "purpose": "Phase 2 cancellation challenge" if arguments.cancel else "Phase 1 candidate-signal discovery",
              "submitted": False, "baseline": snapshot(state), "samples": []}
    output = d.DATA / f"{state['run_id']}-response-observation-{time.time_ns()}.json"
    d.safe_path(output)
    try:
        # Use keyboard input, independently read back before sending Enter.
        prompt = ("Write the numbers from 1 to 5000, one number per line. Do not use tools."
                  if arguments.cancel else "Reply with exactly the word READY.")
        for char in prompt:
            if not d.attr(field, "AXFocused"):
                raise RuntimeError("Input focus changed; preserve unsent text")
            d.owned(state)
            front = d.AppKit.NSWorkspace.sharedWorkspace().frontmostApplication()
            if front is None or front.processIdentifier() != state["pid"]:
                raise RuntimeError("Owned instance no longer frontmost")
            for down in [True, False]:
                event = d.Quartz.CGEventCreateKeyboardEvent(None, 0, down)
                d.Quartz.CGEventKeyboardSetUnicodeString(event, 1, char)
                d.Quartz.CGEventPost(d.Quartz.kCGSessionEventTap, event)
        deadline = time.monotonic() + 3
        while d.attr(field, "AXValue") != prompt and time.monotonic() < deadline:
            time.sleep(0.1)
        if d.attr(field, "AXValue") != prompt:
            raise RuntimeError("Synthetic input readback mismatch; no Enter sent")
        d.key(state, 36)
        record["submitted"] = True
        print(json.dumps({"synthetic_discovery_request_submitted": True}), flush=True)
        started = time.monotonic()
        previous = None
        record["cancel_action_sent"] = False
        while time.monotonic() - started < 25:
            rows = snapshot(state)
            if rows != previous:
                record["samples"].append({"elapsed_seconds": round(time.monotonic() - started, 3),
                                          "nodes": rows})
                previous = rows
            if arguments.cancel and not record["cancel_action_sent"] and time.monotonic() - started >= 2:
                _, windows = d.owned(state)
                elements = list(d.tree(windows[0]))
                loading = [e for e, _, _ in elements
                           if "chat-response-loading" in list(d.attr(e, "AXDOMClassList") or [])]
                controls = [e for e, _, _ in elements if d.attr(e, "AXRole") == "AXButton"
                            and str(d.attr(e, "AXDescription") or "").startswith("Cancel")]
                if loading and len(controls) == 1:
                    d.owned(state)
                    record["cancel_action_error"] = d.AX.AXUIElementPerformAction(controls[0], "AXPress")
                    record["cancel_action_sent"] = record["cancel_action_error"] == 0
                    record["cancel_elapsed_seconds"] = round(time.monotonic() - started, 3)
                    print(json.dumps({"cancel_action_sent": record["cancel_action_sent"]}), flush=True)
                    if record["cancel_action_error"]:
                        raise RuntimeError("Cancellation AX action failed; no automatic retry")
            time.sleep(0.15)
        d.inspect(state, quiet=True)
    finally:
        record["regular_unchanged"] = d.regular_unchanged(state)
        output.write_text(json.dumps(record, indent=2) + "\n")
        print(json.dumps({"submitted": record["submitted"],
                          "changed_samples": len(record["samples"]),
                          "cancel_action_sent": record.get("cancel_action_sent", False),
                          "regular_unchanged": record["regular_unchanged"],
                          "evidence": output.name,
                          "completion_classification": "not implemented"}), flush=True)


if __name__ == "__main__":
    main()
