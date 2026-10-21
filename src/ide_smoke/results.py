"""Public outcomes and controlled diagnostic reasons for foundation runs."""

from dataclasses import dataclass
from enum import Enum

TEST_IDS = ("T01", "T02", "T03", "T04", "T05")


class Outcome(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    BLOCKED = "BLOCKED"
    ERROR = "HARNESS ERROR"
    SKIP = "SKIP"


class Reason(Enum):
    WORKSPACE_CREATED = ("workspace_created", "The owned fixture workspace was initialized.")
    WORKSPACE_REMOVED = ("workspace_removed", "The owned workspace was removed.")
    WORKSPACE_RETAINED = ("workspace_retained", "The workspace candidate was preserved for inspection.")
    WORKSPACE_UNSAFE = ("workspace_unsafe", "Workspace prerequisites are unsafe.")
    WORKSPACE_UNKNOWN = ("workspace_unavailable", "Workspace setup or inspection could not be completed.")
    WORKSPACE_EVIDENCE = ("workspace_manifest_failed", "Workspace metadata could not be saved.")
    PASSED = ("assertion_passed", "The observable assertion passed.")
    MISMATCH = ("content_mismatch", "Observed content did not match the required assertion.")
    PREREQUISITE = ("prerequisite_missing", "A required prerequisite is unavailable; establish it before retrying.")
    UNIMPLEMENTED = ("operations_unimplemented", "IDE operations are not implemented; no product assertions can run yet.")
    INCOMPLETE = ("suite_incomplete", "All five required assertions must execute and pass before a run can succeed.")
    UNEXPECTED = ("unexpected_exception", "Execution could not be assessed reliably; review the harness implementation.")
    TIMEOUT = ("unexplained_timeout", "An operation timed out; its cause is unknown. Review automation before retrying.")
    INTERRUPTED = ("interrupted", "The run was interrupted; retry when ready.")
    CLEANUP_OK = ("cleanup_succeeded", "Registered foundation resources were released.")
    CLEANUP_FAILED = ("cleanup_failed", "Required cleanup failed; inspect owned resources before retrying.")
    CONFIG_MISSING = ("config_missing", "Configuration is missing; copy config/harness.example.yaml to config/harness.local.yaml, edit it, or select --config PATH.")
    CONFIG_UNREADABLE = ("config_unreadable", "Configuration cannot be read; check the file path and read permissions.")
    CONFIG_SYNTAX = ("config_yaml_invalid", "Configuration must be valid safe YAML; correct its syntax or unsupported tags.")
    CONFIG_MAPPING = ("config_mapping_required", "This configuration section must be a mapping with string keys.")
    CONFIG_DUPLICATE = ("config_duplicate_key", "Configuration contains duplicate keys; keep each key only once.")
    CONFIG_UNKNOWN = ("config_unsupported_key", "This section contains an unsupported key; use only the documented example schema.")
    CONFIG_REQUIRED = ("config_required_key", "A required configuration key is missing; add it using the example schema.")
    CONFIG_TYPE = ("config_invalid_type", "This configuration value has the wrong type; use the documented example schema.")
    CONFIG_PLATFORM = ("config_unsupported_platform", "Only harness.platform: macos is supported in this milestone.")
    CONFIG_MODE = ("config_parallel_unsupported", "Set harness.execution_mode to sequential; parallel runs are unsupported.")
    CONFIG_TIMEOUT = ("config_invalid_timeout", "Set this timeout to finite numeric seconds greater than zero; booleans are invalid.")
    CONFIG_PATH = ("config_invalid_path", "Provide a nonempty path without NUL characters and with a resolvable home directory.")
    EXECUTABLE_MISSING = ("executable_missing", "The configured executable is absent; correct its path or PATH entry.")
    EXECUTABLE_KIND = ("executable_not_file", "The configured executable is not a regular file; select the IDE executable.")
    PROFILE_MISSING = ("profile_missing", "A dedicated profile resource is absent; establish the directories and dedication marker manually using docs/vscode-test-profile-setup.md.")
    PROFILE_KIND = ("profile_not_directory", "The configured profile is not a directory; select a dedicated profile directory.")
    PROFILE_SAFE = ("profile_safe", "The dedicated profile paths and marker passed read-only safety validation; GUI readiness is unassessed.")
    PROFILE_PATH_INVALID = ("profile_path_invalid", "Select a dedicated profile path without parent traversal.")
    PROFILE_SYMLINK = ("profile_symlink", "Select real dedicated directories and a marker without symlink components.")
    PROFILE_PROTECTED_OVERLAP = ("profile_protected_overlap", "Select a dedicated profile separated from home roots, everyday IDE data, installation, and workspace paths.")
    PROFILE_CHECKOUT_OVERLAP = ("profile_checkout_overlap", "Select a profile outside the checkout or strictly beneath its profiles directory.")
    PROFILE_WRONG_KIND = ("profile_wrong_kind", "Create real dedicated root/child directories and a regular dedication marker manually.")
    PROFILE_RESOURCE_OVERLAP = ("profile_resource_overlap", "Select distinct dedicated profile resources; aliases between them are unsafe.")
    PROFILE_MARKER_INVALID = ("profile_marker_invalid", "Review the dedication marker manually using docs/vscode-test-profile-setup.md; do not overwrite an existing marker automatically.")
    PROFILE_INSPECTION_UNKNOWN = ("profile_inspection_unknown", "Profile safety could not be determined; resolve filesystem access or inspection errors before retrying.")
    AVAILABILITY = ("availability_unknown", "Resource availability could not be determined; check path access and permissions.")
    RUN_BUSY = ("active_run_conflict", "Another ide-smoke run is active; wait for it to finish before retrying.")
    PLATFORM = ("host_unsupported", "This implementation supports a macOS host only.")
    GUARD_FAILED = ("guard_unavailable", "The desktop lock could not be acquired; check access to ~/.ide-smoke/desktop-run.lock.")
    EVENT_FAILED = ("event_write_failed", "Structured event logging failed; check reports directory access and free space.")
    SUMMARY_FAILED = ("summary_write_failed", "The run summary could not be saved; check reports directory access and free space.")

    @property
    def code(self) -> str:
        return self.value[0]

    @property
    def message(self) -> str:
        return self.value[1]


@dataclass(frozen=True)
class Result:
    outcome: Outcome
    reason: Reason
    key: str | None = None
    path: str | None = None
    duration_seconds: float | None = None
    origin: "Result | None" = None

    def as_dict(self) -> dict:
        return {
            "outcome": self.outcome.value, "reason": self.reason.code,
            "message": self.reason.message, "key": self.key, "path": self.path,
            "duration_seconds": self.duration_seconds,
            "origin": None if self.origin is None else {
                "outcome": self.origin.outcome.value, "reason": self.origin.reason.code,
            },
        }


def skipped(origin: Result) -> Result:
    return Result(Outcome.SKIP, origin.reason, origin=origin)


def aggregate(tests: list[Result], issues: list[Result], cleanup: Result) -> Result:
    candidates = [*issues, *tests, cleanup]
    for severity in (Outcome.ERROR, Outcome.FAIL, Outcome.BLOCKED):
        for result in candidates:
            if result.outcome == severity:
                return result
    if len(tests) == len(TEST_IDS) and all(t.outcome == Outcome.PASS for t in tests):
        return Result(Outcome.PASS, Reason.PASSED)
    return Result(Outcome.ERROR, Reason.INCOMPLETE)


def exit_code(result: Result, *, interrupted: bool = False, config_error: bool = False,
              cleanup_failed: bool = False, evidence_failed: bool = False) -> int:
    if cleanup_failed or evidence_failed:
        return 4
    if interrupted:
        return 130
    if config_error:
        return 2
    return {Outcome.PASS: 0, Outcome.FAIL: 1, Outcome.BLOCKED: 3,
            Outcome.ERROR: 4, Outcome.SKIP: 4}[result.outcome]
