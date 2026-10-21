---
name: plan-user-story
description: Develop a technical implementation plan for a user story when requested, with concrete tasks, verification, and developer validation gates. Produces a saved plan; story creation, general brainstorming, and implementation are separate work.
---

# Plan a user story

Produce a repository-grounded technical plan that another implementation session can execute and verify. This skill authorizes planning only: investigate read-only and write the plan, without implementing the story, installing dependencies, setting up environments, or changing external issues. Approval of the plan does not authorize implementation; that requires a separate developer instruction.

## Establish the story and current state

1. Read the repository root [AGENTS.md](../../../AGENTS.md) and [README.md](../../../README.md). Follow their context pointers for the story's specifications, dependencies, evidence requirements, and developer gates.
2. Accept story text, a local file reference, or a GitHub issue reference. Retrieve GitHub issues with `gh` from this checkout, following repository GitHub instructions. Preserve the source identifier, acceptance criteria, exclusions, dependencies, and approval boundaries. If the source is inaccessible, report the blocker and request the missing story content rather than reconstructing it.
3. Inspect relevant code, configuration, dependencies, tests, and existing plans. Record verified facts separately from assumptions and unresolved decisions. In this repository, proposed layouts, APIs, schemas, and CLI examples remain design targets until implementation establishes them. Identify checks that actually exist and checks the story must introduce.
4. Resolve material ambiguities with the developer before finalizing: conflicting requirements, unclear observable outcomes, missing acceptance criteria, scope decisions, or choices that change the implementation approach. First look up facts available in the repository. Continue independent investigation while awaiting answers; mark any saved interim plan as a draft with its blockers.

This step is complete when the story's boundaries and acceptance criteria are understood and material decisions are resolved or explicitly assigned to a bounded feasibility phase.

## Design phases and tasks

Use one phase for a small story. Add phases when complexity, risk, dependencies, or the need for developer feedback justifies separate, independently verifiable outcomes. Preserve existing story slices and milestone gates; planning a story does not authorize unrelated work or advancing a gate.

When an approach is unproven, begin with a bounded investigation or feasibility phase. Specify the question to answer, scope of investigation, required evidence, completion criteria, and developer checkpoint. Keep downstream work conditional on its findings. Plan later phases only to the level the evidence supports, and require refinement and developer validation before dependent implementation begins.

For each phase, provide:

- An outcome and prerequisites, including dependencies on earlier phases or external prerequisites.
- Ordered tasks with stable identifiers and Markdown checkboxes, such as `- [ ] P1-T01: ...`. Start new tasks unchecked. Instruct the implementing agent to change a task to `- [x]` only after its work is complete and its required verification passes, recording the result and evidence in the plan. Keep partial, blocked, failed, or unverified tasks unchecked. When revising an existing plan, preserve completion states supported by recorded evidence.
- Specific file operations for each task: identify repository-relative paths to create, modify, or delete and describe the intended change in each file. For read-only tasks, identify the files or resources to inspect and the evidence to record. Mark new paths as proposed; if investigation must determine a path, make that investigation an explicit prerequisite and refine the dependent task before implementation. Do not substitute vague component names for identifiable files.
- For each software-writing task, describe what the software must do: relevant inputs, resulting behavior or outputs, and applicable failure handling. Identify the class, method, or function to add or change where appropriate. Distinguish existing symbols from proposed names, and describe responsibilities clearly when names are not yet settled. Give enough detail to implement and verify the behavior while leaving routine internal choices to the implementing agent; do not invent unsupported APIs or prescribe line-by-line edits.
- Task dependencies and verification tied to the stated outcome and file changes. Each task must have an assessable completion condition.
- Meaningful automated tests where appropriate, and manual checks or diagnostic evidence where automation is unsuitable. Specify observable expected results, not merely commands to run. Distinguish existing commands from checks to create. Avoid tests that simply mirror implementation details or unnecessary tests for low-impact, reversible edits.
- Explicit phase completion criteria and a separate unchecked developer validation item. Only check off developer validation after the developer explicitly provides it; completed implementation tasks do not establish phase acceptance.

Map every source acceptance criterion to task identifiers and verification evidence. Preserve its meaning; technical tasks supplement acceptance criteria rather than replace them. Flag criteria that cannot yet be verified, the reason, and what would unblock verification.

## Encode implementation checkpoints

Each phase must instruct the future implementing agent to stop at its end and present completed tasks, checks actually performed and their results, relevant diagnostic paths, deviations, and remaining limitations. Require explicit developer validation before beginning the next phase. Silence is not approval; honor prior approval only when it explicitly covers the applicable gate. The final phase also ends with a developer checkpoint.

Require the implementing agent to stop and request guidance when new evidence invalidates the approach, changes acceptance criteria, or expands authorized scope. Revise the affected plan and obtain developer validation before continuing dependent work. Routine implementation decisions within the approved scope can proceed.

Carry forward the four-unsuccessful-fix-round stopping rule by referencing the repository's [AGENTS.md](../../../AGENTS.md) as the source of truth, rather than defining a separate retry policy. The generated plan must direct the implementing agent to follow that rule, including its required developer report and prohibition on further rounds or workarounds pending guidance. Use a link relative to the generated plan's location.

## Save and review the plan

Save Markdown to `docs/implementation-plans/<story-id-or-short-slug>.md`, using a repository-relative filename. Inspect existing plans first; update the matching plan when appropriate, preserving recorded evidence and developer decisions. Keep links relative to the saved file or use the source issue URL.

Use a structure that includes:

1. Story identifier, title, source reference, and planning status. For supplied text with no durable reference, include the story text and acceptance criteria in the plan.
2. Scope, exclusions, dependencies, current-state findings with source references, assumptions, and unresolved prerequisites.
3. Technical approach and its rationale, with enough context for a separate implementation session.
4. Phases, concrete tasks, verification, completion criteria, and explicit developer checkpoints.
5. Acceptance-criterion mapping to tasks and evidence.
6. Implementation controls: scope-change handling, the repository failure-limit reference, and the distinction between plan approval and implementation authorization.

Before completion, check every acceptance criterion is accounted for, phase ordering is feasible, every task has a checkbox, specific file operations, and an assessable outcome, and software-writing tasks describe expected behavior and relevant symbols. Confirm conditional work is identified and every phase has its stop-and-validate instruction and separate developer validation checkbox. Verify local links and consistency with affected specifications and README. Report only validation actually performed; runtime tests remain unavailable until project tooling exists.

Return a link to the saved plan, briefly describe its phases and any blockers, and request developer review. Revise within planning scope as requested. Finish without starting implementation.
