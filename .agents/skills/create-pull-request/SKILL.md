---
name: create-pull-request
description: Create GitHub pull requests for this repository using gh and its pull request template. Use when asked to open or create a PR; draft-only requests produce unpublished content.
---

# Create a pull request

Create the requested pull request in `jimthompson5802/ide-tester`. A request to create a PR authorizes publication; a request for a description, example, or skill authorizes only that deliverable. Creating a PR does not authorize merging it or advancing a developer gate.

## Establish the change

Read the root [AGENTS.md](../../../AGENTS.md) and the current [pull request template](../../../.github/pull_request_template.md). Load the template on every invocation rather than keeping a copy in this skill.

Run Git and `gh` commands from this checkout. Inspect the working tree, current branch, remotes, upstream, intended base branch, and the full commit and file diff against that base. Use the requested base, or determine the repository's default branch. Distinguish committed changes that will appear in the PR from uncommitted work. Read linked issues and applicable specifications for scope, acceptance criteria, evidence requirements, and developer gates.

Use `gh --version` and `gh auth status` to establish availability and authentication. If authentication is missing, ask the user to authenticate manually. Determine the remote head branch explicitly, including its owner for fork branches. Check for an existing PR for that head and base with `gh pr list --repo jimthompson5802/ide-tester --state all --head HEAD_BRANCH --base BASE_BRANCH --json number,title,state,url`. Inspect relevant matches before creating another PR. Return an existing open PR for the same work; ask before reopening or replacing closed or merged work when intent is unclear.

Complete the authorized changes and applicable checks before publishing. Commit or push only the intended work when authorized by the request and session context; use an ordinary push for a local head that must be published. Preserve unrelated work. If branch, commit contents, or target scope cannot be determined reliably, prepare the body and ask only for the missing decision.

## Fill the template

Write a concrete title and fill every template section from the actual diff and available evidence, preserving its headings and checklist items. Lead the summary with the problem and resulting behavior. Scale detail to the change.

- Link related issues. Use `Closes #NUMBER` only when the PR fulfills that issue; use a non-closing reference for partial work. If no issue applies, replace the dangling `Closes #` with an explicit explanation.
- Identify the implementation phase and deliverables from the applicable plan. For work outside a planned phase, state that with a brief reason.
- Map applicable acceptance criteria to changes and evidence, documenting exceptions or incomplete work.
- Record checks actually performed and their results. Explain unavailable or inapplicable checks. Until a harness and project tooling exist, state that runtime tests are unavailable; proposed commands are not test evidence.
- Mark checkboxes only when evidence supports them. Leave developer approval and reviewer checkboxes unchecked unless the corresponding review or approval actually occurred. Pending developer validation remains pending; opening a PR does not satisfy it.
- Describe material risks and limitations. Use repository URLs for published source references and sanitized evidence; keep credentials and personal paths out of the body.

## Publish and verify

Write the complete Markdown body with real newlines to a unique temporary UTF-8 file outside tracked project files, using a file-writing tool or safely quoted input. Pass it with `--body-file` so shell metacharacters and Markdown remain literal.

When creation is authorized and the remote head contains the intended commits, run:

```bash
gh pr create --repo jimthompson5802/ide-tester --base BASE_BRANCH --head HEAD_BRANCH --title 'Actual change title' --body-file /tmp/UNIQUE-pr-body.md
```

Replace the example arguments with the resolved branches, title, and temporary path. Add `--draft` when the user requests a draft PR; a draft PR is published on GitHub, unlike an unpublished description. Apply labels, reviewers, assignees, or milestones only when requested or required by repository instructions.

Verify the returned PR with `gh pr view PR_NUMBER --repo jimthompson5802/ide-tester --json number,title,body,url,baseRefName,headRefName,isDraft`. Confirm the title, complete template body, branches, and draft status match the prepared result. Remove only the temporary file created for this operation after successful verification.

If creation fails or its outcome is uncertain, inspect any returned URL and query for the head/base PR before retrying. Stop when authentication, permissions, or service availability prevents reliable publication or verification; retain the prepared body and report the blocker. Use the environment's approval mechanism for sandbox restrictions.

Return the PR title and URL, validation results, and any remaining gate or limitation. For a description-only request, return the prepared content and identify it as unpublished.
