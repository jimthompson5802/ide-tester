"""Check the retained M1-00 exchange offline; performs no GUI actions.

This checks recorded comparisons, not raw response text or generation completion.
The ignored local artifacts are required; this is not a general response verifier.
"""

import json
from pathlib import Path


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    data = Path(__file__).resolve().parents[3] / ".ide-smoke/m1-00"
    run = "m1-00-54f29fddaa"
    observation = data / f"{run}-response-observation-1792542366463964000.json"
    record = json.loads(observation.read_text())
    tree = json.loads((data / f"{run}-tree.json").read_text())
    require(record["run_id"] == run and record["submitted"] is True,
            "Submission evidence missing")
    require(tree["owned_workspace_window"] is True, "Owned tree evidence missing")
    prior = {n["path"] for n in record["baseline"]
             if "interactive-response" in n.get("classes", [])}
    # Use the final recorded change sample, without searching for a preferred answer.
    sample = record["samples"][-1]
    require(0 <= sample["elapsed_seconds"] <= 60, "Observation outside bound")
    responses = [n for n in sample["nodes"]
                 if "interactive-response" in n.get("classes", [])
                 and n["path"] not in prior]
    require(len(responses) == 1, "Expected one new assistant container")
    # In this saved tree, child 1 is the response body, separate from toolbar/footer.
    body = responses[0]["path"] + ".1"
    subtree = [n for n in tree["nodes"]
               if n["path"] == body or n["path"].startswith(body + ".")]
    require({(n["path"], n["role"]) for n in subtree}
            == {(body, "AXGroup"), (body + ".0", "AXStaticText")},
            "Saved body must contain exactly one text leaf")
    leaves = [n for n in sample["nodes"] if n["path"] == body + ".0"]
    require(len(leaves) == 1, "Response body comparison missing")
    leaf = leaves[0]
    require(leaf["role"] == "AXStaticText" and leaf["value_length"] == 5
            and leaf["value_equals_marker"] is True,
            "Recorded whole-body whitespace-only READY comparison did not pass")
    print(json.dumps({"evidence": observation.name, "submitted": True,
                      "assistant_response_observed": True,
                      "response_strip_equals_READY": True,
                      "sample_elapsed_seconds": sample["elapsed_seconds"],
                      "regular_unchanged": record["regular_unchanged"],
                      "basis": "saved host observations; no new GUI request",
                      "completion_qualified": False}))


if __name__ == "__main__":
    main()
