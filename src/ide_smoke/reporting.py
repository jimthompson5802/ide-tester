"""Allowlisted structured events and atomic minimal JSON summaries."""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from ide_smoke.results import Result


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


class EvidenceError(Exception):
    """Evidence could not be persisted; never includes underlying exception text."""


class Reporter:
    def __init__(self, root: Path):
        self.run_id = uuid.uuid4().hex
        self.started_at = timestamp()
        self.directory = root / self.run_id
        self.summary_path = self.directory / "summary.json"
        try:
            self.directory.mkdir(parents=True, exist_ok=False)
        except OSError:
            raise EvidenceError from None

    def event(self, name: str, *, result: Result | None = None, test_id: str | None = None):
        # Callers provide fixed event names and test IDs; no arbitrary payloads.
        record = {"run_id": self.run_id, "timestamp": timestamp(), "event": name,
                  "test_id": test_id, "result": None if result is None else result.as_dict()}
        try:
            with (self.directory / "events.jsonl").open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(record, allow_nan=False) + "\n")
        except OSError:
            raise EvidenceError from None

    def workspace_manifest(self, manifest):
        from ide_smoke.workspace import WorkspaceManifest
        if not isinstance(manifest, WorkspaceManifest):
            raise EvidenceError
        temporary = self.directory / "workspace.tmp"
        try:
            temporary.write_text(json.dumps(manifest.as_dict(), indent=2, allow_nan=False) + "\n", encoding="utf-8")
            os.replace(temporary, self.directory / "workspace.json")
        except OSError:
            raise EvidenceError from None

    def finalize(self, summary: dict):
        temporary = self.directory / "summary.tmp"
        try:
            temporary.write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n", encoding="utf-8")
            os.replace(temporary, self.summary_path)
        except OSError:
            raise EvidenceError from None
