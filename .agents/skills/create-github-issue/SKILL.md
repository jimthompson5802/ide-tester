---
name: create-github-issue
description: Create GitHub issues for this repository using gh, including user story issues with acceptance criteria sourced from project specifications. Use when asked to file or create issues; drafting alone does not publish them.
---

# Create a GitHub issue

Create the requested issue in `jimthompson5802/ide-tester` using the GitHub CLI. A request to create an issue authorizes publication; a request for a draft, example, or skill only authorizes that deliverable.

## Establish scope and source

Read the repository root [AGENTS.md](../../../AGENTS.md) for repository-wide instructions. Read the specification relevant to the requested issue. Preserve story identifiers, dependencies, scope boundaries, acceptance criteria, and developer gates from that source. Reference the specification in the issue using a repository URL; keep local absolute paths out of published content.

Use a concrete title describing the outcome and a description stating the requested outcome and scope. For an existing user story, prefix the title with its identifier. Include the user story and observable acceptance criteria as unchecked Markdown checkboxes in the description. Keep implementation tasks distinct from acceptance criteria. Include dependencies and required validation evidence where the source defines them. For other issue types, describe the problem or requested outcome and the relevant scope and verification expectations.

Ask only for material information that cannot be inferred from the request or repository. Leave unspecified labels, assignees, projects, and milestones unset. Creating an issue does not authorize implementing it or advancing a milestone gate.

## Prepare and publish

1. Run commands from the checkout. Verify `gh` availability and authentication with `gh --version` and `gh auth status`. If authentication is missing, report the prerequisite and ask the user to authenticate manually; never collect credentials.
2. Search for an existing issue with the story identifier or distinctive title before publishing, including closed issues:

   ```bash
   gh issue list --repo jimthompson5802/ide-tester --state all --search 'M0-03 in:title' --json number,title,state,url
   ```

   Replace the example search with the requested issue's identifier or terms. Inspect relevant matches. If the same work is already tracked, return that issue's URL instead of creating a duplicate unless the user requested a separate issue.
3. Prepare the complete title and Markdown description before publication. Use the example below as a format guide; preserve source acceptance criteria rather than inventing completed results. Write the description with real newlines to a unique temporary UTF-8 file outside tracked project files using a file-writing tool or safely quoted input. Pass its path through `--body-file` so Markdown, backticks, and shell metacharacters remain literal.
4. When creation is authorized, publish with an explicit repository target. For example, after writing the actual body to the temporary path:

   ```bash
   gh issue create --repo jimthompson5802/ide-tester --title 'M0-03: Install Python 3.12 and create the checkout-local environment' --body-file /tmp/ide-tester-issue-body.md
   ```

   Use the actual title and unique temporary file path. Apply only metadata requested by the user or established by repository instructions. If sandbox permissions block the operation, use the environment's approval mechanism.
5. Verify the returned issue using `gh issue view ISSUE_NUMBER --repo jimthompson5802/ide-tester --json number,title,body,url`. Check that the title and description, including all user story acceptance criteria, match the prepared content. Remove only the temporary file created for this operation.

If publication fails or its outcome is uncertain, inspect any returned URL and search for the issue before retrying. Stop when authentication, permissions, or service availability prevents reliable verification; report the blocker and retain the prepared content for recovery. Avoid blind retries that could publish duplicates.

## Example user story issue

**Title:** `M0-03: Install Python 3.12 and create the checkout-local environment`

**Description:**

```markdown
As a developer, I want an isolated Python 3.12 environment in this checkout so that later feasibility work can use a known interpreter without changing system Python.

Scope: Complete Phase 3 of https://github.com/jimthompson5802/ide-tester/blob/main/specifications/ide-milestone0-implementation-plan.md using uv-managed prebuilt Python. Project initialization and harness dependencies belong to Milestone 1.

Dependency: M0-02 (standalone uv) is complete.

Acceptance criteria:

- [ ] .venv/bin/python reports Python 3.12; evidence records the exact patch version and uv-managed prebuilt provenance.
- [ ] Interpreter assertions confirm virtual-environment isolation and that sys.prefix resolves to this checkout's .venv.
- [ ] .python-version contains 3.12; it and .venv/ remain ignored and untracked.
- [ ] Existing environment conflicts are resolved without silently overwriting unrelated state; system Python remains unchanged.
- [ ] No harness or automation packages, project metadata, or lockfile are introduced; setup uses neither uv sync nor native source builds.

Validation evidence: Record the interpreter version, assertion results, and Git ignore/tracked-file checks. Keep personal paths and raw local evidence out of the issue.
```

## Completion

Return the created or existing issue's title and URL. For a draft-only request, return the title and description and identify it as unpublished. Report any verification limitation explicitly; never claim publication solely because the command was attempted.
