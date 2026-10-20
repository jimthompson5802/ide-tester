---
name: generate-milestone-user-stories
description: Generate or refine a milestone user-story Markdown backlog from this repository's harness proposal, following the Milestone 1 model and preparing stories for create-github-issue. Use for milestone backlog generation; detailed story implementation plans and GitHub publication are separate work.
---

# Generate milestone user stories

Turn one milestone's high-level outcomes into a reviewable Markdown backlog. This workflow writes documentation only. It does not publish issues, implement stories, install dependencies, or authorize passing implementation gates.

## Select the milestone and gather sources

Accept a required milestone argument in natural language or as `milestone=2`. Normalize `2`, `M2`, and `Milestone 2` to milestone 2. Ask for clarification if the argument is missing, ambiguous, or does not identify a milestone in the current proposal; do not infer one from the active milestone.

Example invocation:

```text
$generate-milestone-user-stories milestone=2
```

Read these sources from the checkout:

- [AGENTS.md](../../../AGENTS.md) and [README.md](../../../README.md) for constraints and delivery status.
- [Harness proposal](../../../specifications/ide-copilot-smoke-harness-proposal.md), especially the selected milestone, contract rules, scope boundaries, and exit gate. This defines milestone scope.
- [Milestone 1 backlog](../../../specifications/ide-copilot-milestone1-user-stories.md) as the output structure and level-of-detail model, rather than a list of stories to copy.
- Any existing backlog for the selected milestone and relevant setup guides, implementation plans, or recorded developer decisions. Inspect implementation artifacts when they exist to distinguish delivered capabilities from remaining work.
- [create-github-issue](../create-github-issue/SKILL.md) and the current [user story issue template](../../../.github/ISSUE_TEMPLATE/user_story.md) for the downstream information requirements. Do not invoke issue publication.

Use repository facts before asking factual questions. Separate verified findings, proposed behavior, assumptions, and unresolved decisions. Do not carry outdated details from the Milestone 1 example into another milestone. If sources materially conflict, show the conflicting references and ask the developer to resolve them before finalizing the affected scope or acceptance criteria.

Future milestones may be planned before earlier milestones are complete. Record their implementation and approval prerequisites explicitly; backlog generation neither satisfies nor waives them.

## Resolve consequential decisions

Grill the developer about decisions that materially affect scope, story boundaries, dependencies, acceptance, or evidence. Examples include supported host versions, IDE editions, unattended-run thresholds, and unresolved automation feasibility. Do not silently turn recommendations into agreed requirements.

Ask in rounds: number all currently answerable, independent questions, give a recommended answer for each, and phrase each so that “yes” accepts the recommendation. Wait for answers before asking dependent questions or finalizing affected content. Investigate available facts independently while answers are pending.

Technical unknowns that require implementation evidence belong in bounded feasibility stories with a question, evidence, go/no-go criteria, and a developer gate; they need not be guessed during backlog generation. Other consequential decisions must be resolved with the developer. If discussion changes or clarifies requirements, summarize the agreed decisions and obtain confirmation of shared understanding before finalizing. Honor confirmation already given for the same decisions. An interim saved document must be labeled draft and identify unresolved decisions.

## Design issue-sized stories

Cover every selected milestone outcome and exit criterion with the smallest useful set of independently reviewable stories. Reuse established capabilities through dependencies rather than recreating earlier milestones. Include regression evidence on previously supported combinations where the proposal requires it. Apply repository YAGNI and platform boundaries.

Each story must carry enough local context to become one GitHub issue:

- A stable `M<N>-<two-digit-sequence>` identifier and concrete outcome title. For new backlogs, begin at `00`; follow established numbering when refining an existing backlog.
- Priority, prerequisites, and explicit story or prior-milestone dependencies, including required approvals.
- An “As a …, I want …, so that …” statement and a short description where needed.
- In-scope deliverables and exclusions; distinguish inherited milestone constraints from story-specific boundaries.
- Observable acceptance criteria as unchecked Markdown checkboxes, kept distinct from implementation tasks.
- Validation approach: automated checks where meaningful, manual developer verification where necessary, and required evidence. Describe expected observations rather than merely listing commands. Label checks that must be introduced as proposed.
- A developer gate stating the evidence to review, approval required, and work that depends on it. Identify the containing slice and its exit criteria so issue creation can preserve the checkpoint.

Use relative references to shared sections for additional context, but keep story-specific criteria, dependencies, evidence, and approval requirements explicit. Include enough information to populate the current issue template. When no detailed implementation phase has been defined, say so and name the suggested slice separately; do not invent phases just to fill a template field. Use “Not applicable” with a reason where a validation category does not apply.

Keep implementation slices at backlog level. Detailed task checklists, exact edits, and per-story technical implementation phases belong to [plan-user-story](../plan-user-story/SKILL.md) when separately requested.

## Save the backlog

Default output: `specifications/ide-copilot-milestone<N>-user-stories.md` at the repository root. Write links relative to that document, not relative to this skill.

Follow the Milestone 1 document's overall shape, adapting content to the selected milestone:

1. Title and metadata: draft/review status, linked source, target IDE/platform combinations, execution/authentication context where applicable, and exclusions.
2. Milestone objective, measurable success criteria, and applicable logical test outcomes.
3. Delivery strategy, relevant constraints, feasibility-first ordering where justified, and developer checkpoints.
4. Numbered user stories with the fields above.
5. Dependencies and suggested implementation slices, with demonstrations and required approvals. Include a dependency diagram when it clarifies the ordering.
6. Proposed repository layout or affected components, grounded in current structure and clearly marked as proposed where necessary. Avoid speculative future modules.
7. Cross-cutting definition of done.
8. Known uncertainties and decisions, with resolution points and conditional downstream work.
9. Instructions for a future implementation agent and a suggested first prompt scoped to the first eligible story or prerequisite. Preserve implementation authorization boundaries and reference the repository's failure-limit rule rather than inventing another retry policy.

When refining an existing backlog, preserve IDs, recorded results, validation status, and developer decisions. Allocate unused IDs to new stories without renumbering existing ones. Do not silently delete established stories or weaken agreed criteria; call out proposed scope changes for developer resolution. Preserve historical evidence and distinguish it from future acceptance requirements. Do not rewrite other milestone backlogs, the proposal, or README merely to make this generation internally consistent; surface conflicts for resolution.

## Validate and hand off

Before completion, check:

- Every milestone outcome and exit criterion maps to stories and observable evidence, without importing later-milestone work.
- IDs are unique, dependency references resolve, ordering has no cycles, and cross-milestone prerequisites are explicit.
- Each story can populate the current issue template without inventing scope, acceptance criteria, validation, or approvals.
- Proposed commands/APIs/packages are not presented as verified; no work or developer approval is claimed without recorded evidence.
- Local Markdown links resolve and the backlog is consistent with the proposal, README, and applicable repository constraints. Report unresolved conflicts rather than silently changing their sources.

Return the saved file link, briefly describe the story coverage and checks actually performed, and identify remaining decisions or prerequisites. State that harness runtime tests are unavailable while project tooling remains unimplemented. Hand off to `create-github-issue` only upon a separate request to create issues; preserve story IDs, criteria, evidence, and gates during that handoff.
