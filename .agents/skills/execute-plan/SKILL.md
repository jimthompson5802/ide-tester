---
name: execute-plan
description: Execute a supplied Markdown implementation plan, check off tasks only after completion and verification, and stop at every phase boundary for developer validation. Use for plan execution or resumption, rather than plan drafting.
---

# Execute a plan

Accept a Markdown plan path, for example `$execute-plan docs/implementation-plans/M1-02.md`. Execute the authorized phase and maintain the supplied file as the progress record. Invoking this skill to create or edit the skill itself does not authorize execution of any implementation plan.

## Establish the execution boundary

1. Read the supplied plan and the repository [AGENTS.md](../../../AGENTS.md) and [README.md](../../../README.md). Follow relevant pointers to source requirements, dependencies, evidence, and developer gates. If no plan is identified, ask for its path; do not choose a story to implement on the developer's behalf.
2. Inspect existing implementation, task status, execution evidence, and recorded developer decisions. Preserve earlier results and distinguish observed behavior from design targets. Identify the next incomplete task and whether its prerequisites and phase gate have been satisfied.
3. Treat an instruction to execute the plan as authorization for its next eligible phase, subject to existing gates and scope. Plan approval alone is not execution authorization. Honor explicit prior authorization and validation without asking again. If an earlier phase awaits developer validation, stop at that gate before starting dependent work.
4. If the plan lacks identifiable phases, treat its tasks as one phase with a final developer checkpoint. Resolve material conflicts or missing verification criteria before dependent work; continue independent investigation within scope where useful.

## Execute and record verified progress

- Work through task dependencies within the authorized phase. Preserve task identifiers, acceptance criteria, exclusions, and phase boundaries. Do not expand scope or advance to a later story or milestone.
- Keep progress in the supplied Markdown file. Use `- [ ]` for incomplete tasks and `- [x]` only after the task's outcome and required verification are established. Convert executable task entries to checkboxes when needed while preserving their identifiers and meaning; do not convert reference material into tasks.
- Verify observable outcomes using the plan's checks and applicable acceptance criteria. Record the actual command or manual check, result, and relevant evidence path beside the task or in a linked execution-results section. Summarize evidence without committing secrets or unrelated content.
- Leave partial, failed, blocked, and unverified tasks unchecked. Record their status, reason, and remaining verification. A successful code edit or passing unrelated tests does not establish task completion. A task requiring developer verification remains unchecked until that verification is received.
- Update the plan after each completed and verified task. On resumption, use recorded evidence and inspect relevant changes; rerun checks when subsequent changes could invalidate that evidence. If evidence becomes invalid, reopen the affected task and explain why.
- Follow the repository's [four-unsuccessful-fix-round rule](../../../AGENTS.md), including its required report and prohibition on a fifth round or workaround pending developer guidance. Stop dependent work when evidence invalidates the approach or requires a scope or acceptance-criteria change; document the proposed revision for developer validation.

## Stop for developer validation

At the end of **every phase, including the final phase**, save progress and stop. Complete the phase's authorized work and verification before requesting validation; if blocked, report the incomplete work instead of declaring the phase complete.

Present the plan link, completed tasks, checks actually performed and their results, evidence paths, deviations, blockers, and remaining limitations. Record the phase as `implementation verified; developer validation pending` when its technical completion criteria pass. Keep its developer-validation checkbox unchecked and do not describe it as developer accepted.

Request explicit developer validation and explain that this skill and the plan's phase checkpoint require the stop. Do not begin the next phase while waiting. Silence or elapsed time is not validation. A general instruction to execute all phases does not waive these checkpoints; honor validation already explicitly given for the applicable gate.

When validation arrives, record the developer's decision and date in the plan and check off the validation item if accepted. Continue only when the next phase is authorized; a validation-only response does not authorize a separately gated phase. After final validation, record the plan's accepted status without starting another plan or milestone.
