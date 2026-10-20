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

   Replace the example search with the requested issue's identifier or terms. Inspect relevant matches. If the same work is already tracked, return that issue's URL instead of creating a duplicate unless the user requested a separate issue.
3. Prepare the complete title and Markdown description before publication. Check user story and feature bodies against the current template and their requirements against the sources. Write the description with real newlines to a unique temporary UTF-8 file outside tracked project files using a file-writing tool or safely quoted input. Pass its path through `--body-file` so Markdown, backticks, and shell metacharacters remain literal.
4. When creation is authorized, publish with an explicit repository target. For example, after writing the actual body to the temporary path:

   ```bash
   gh issue create --repo jimthompson5802/ide-tester --title 'M0-03: Install Python 3.12 and create the checkout-local environment' --body-file /tmp/ide-tester-issue-body.md
   ```

   Use the actual title and unique temporary file path. Apply the resolved metadata, including applicable template defaults. Inspect installed CLI capabilities when needed; use `gh api` for metadata such as issue type if `gh issue create` cannot set it. Report any default that cannot be applied rather than silently omitting it. If sandbox permissions block the operation, use the environment's approval mechanism.
5. Verify the returned issue using `gh issue view ISSUE_NUMBER --repo jimthompson5802/ide-tester --json number,title,body,url`. Check that the title and description, including all acceptance criteria and applicable template sections, match the prepared content. Verify resolved metadata too, using `gh api` for fields unavailable in `gh issue view` if needed. Remove only the temporary file created for this operation.

If publication fails or its outcome is uncertain, inspect any returned URL and search for the issue before retrying. Stop when authentication, permissions, or service availability prevents reliable verification; report the blocker and retain the prepared content for recovery. Avoid blind retries that could publish duplicates.

## Completion

Return the created or existing issue's title and URL. For a draft-only request, return the title and description and identify it as unpublished. Report any verification limitation explicitly; never claim publication solely because the command was attempted.
