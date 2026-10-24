---
name: create-github-issue
description: Create GitHub issues for this repository using gh, including user story issues with acceptance criteria sourced from project specifications. Use when asked to file or create issues; drafting alone does not publish them.
---

# Create a GitHub issue

Create the requested issue in `jimthompson5802/ide-tester` using the GitHub CLI. A request to create an issue authorizes publication; a request for a draft, example, or skill only authorizes that deliverable.

## Establish scope and source

Read the repository root [AGENTS.md](../../../AGENTS.md) for repository-wide instructions. Read the specification relevant to the requested issue. Preserve story identifiers, dependencies, scope boundaries, acceptance criteria, and developer gates from that source. Reference the specification in the issue using a repository URL; keep local absolute paths out of published content.

For user stories and feature requests, read the current [user story template](../../../.github/ISSUE_TEMPLATE/user_story.md) on every invocation, including drafts. It is authoritative for structure, required information, and metadata defaults. Stop and report the problem if it is missing or unreadable.

Fill the template using the user's request and relevant specifications:

- Retain every heading and field in template order. Replace prompts and placeholders with sourced content. Use “Not specified” for unknown information and “Not applicable” where a field does not apply. Ask only for missing information that materially affects scope or acceptance.
- Preserve acceptance criteria as unchecked Markdown checkboxes without forcing Given/When/Then wording. Keep implementation tasks distinct from acceptance criteria. Preserve dependencies, required evidence, and developer gates; do not invent phases, deliverables, tests, or completed results.
- Use Implementation Phase's Developer Validation field for the approval checkpoint. Use Validation Approach's Developer Validation field for the manual verification steps.
- Exclude YAML frontmatter from the body. Apply nonempty metadata defaults unless the user explicitly overrides them. For existing stories, put the story identifier first instead of the template title prefix. Template name and about describe the template rather than issue metadata.

Use a concrete title describing the outcome. For other issue types, describe the problem or requested outcome, scope, and verification expectations; the user story template is not required.

Leave labels, assignees, projects, and milestones unset unless supplied by the user, applicable template defaults, or repository instructions. Creating an issue does not authorize implementation or advancing a milestone gate.

## Prepare and publish

1. Run commands from the checkout. Verify `gh` availability and authentication with `gh --version` and `gh auth status`. If authentication is missing, report the prerequisite and ask the user to authenticate manually; never collect credentials.
2. Search for an existing issue with the story identifier or distinctive title before publishing, including closed issues:

   ```bash
   gh issue list --repo jimthompson5802/ide-tester --state all --search 'M0-03 in:title' --json number,title,state,url
   ```

   Replace the example search with the requested issue's identifier or terms. Also list recent issues without `--search`, because newly created issues may not appear in search results yet:

   ```bash
   gh issue list --repo jimthompson5802/ide-tester --state all --limit 100 --json number,title,body,state,url,createdAt
   ```

   Inspect relevant matches from both sources. If the same work is already tracked, return that issue's URL instead of creating a duplicate unless the user requested a separate issue.
3. Prepare the complete title and Markdown description before publication. Check user story and feature bodies against the current template and their requirements against the sources. Write the description with real newlines to a unique temporary UTF-8 file outside tracked project files using a file-writing tool or safely quoted input. Pass its path through `--body-file` so Markdown, backticks, and shell metacharacters remain literal.
4. Before publishing, inspect installed CLI capabilities and verify that requested metadata (including template defaults) is supported and available in the target repository. Use `gh label list` for labels and `gh api` for metadata unavailable through other CLI commands, including supported issue types. Apply only confirmed metadata. Report unavailable defaults, such as a `Feature` type when the repository has no issue types configured, rather than discovering this through a creation attempt. If metadata lookup fails, resolve that prerequisite before publishing.
5. When creation is authorized, record the attempt's start time and publish once with an explicit repository target. For example, after writing the actual body to the temporary path:

   ```bash
   gh issue create --repo jimthompson5802/ide-tester --title 'M0-03: Install Python 3.12 and create the checkout-local environment' --body-file /tmp/ide-tester-issue-body.md
   ```

   Use the actual title and unique temporary file path. Apply the confirmed metadata. If sandbox permissions block the operation, use the environment's approval mechanism; reconcile any uncertain attempt as described below before repeating creation.
6. Verify the returned issue using `gh issue view ISSUE_NUMBER --repo jimthompson5802/ide-tester --json number,title,body,url`. Check that the title and description, including all acceptance criteria and applicable template sections, match the prepared content. Verify resolved metadata too, using `gh api` for fields unavailable in `gh issue view` if needed. Remove only the temporary file created for this operation.

### Reconcile failed or uncertain creation

A nonzero exit can occur after GitHub has created the issue, for example while applying metadata. Treat every failed creation as potentially published.

1. Inspect any returned issue number or URL directly. Fetch the recent issue list above without `--search` and compare exact titles and prepared bodies; inspect relevant candidates individually. Paginate with `gh api` if necessary to cover the entire attempt window. An empty search result does not establish that creation failed.
2. If a matching issue exists, reuse it and repair only missing or incorrect authorized metadata on that issue. Verify it normally; do not create another issue. If multiple matches exist, report them and stop publication rather than guessing which to retain.
3. If the result remains uncertain, stop and report the uncertainty, retaining the prepared body for recovery. Authentication, permission, service, or incomplete-listing failures are blockers, not evidence that no issue exists.
4. Retry creation only after reliable direct inspection establishes that no matching issue was created and the original failure has been resolved. If the failure may still have an in-flight server operation, keep the result uncertain and stop. Reconcile any failed retry through this same procedure.

## Completion

Return the created or existing issue's title and URL. For a draft-only request, return the title and description and identify it as unpublished. Report any verification limitation explicitly; never claim publication solely because the command was attempted.
