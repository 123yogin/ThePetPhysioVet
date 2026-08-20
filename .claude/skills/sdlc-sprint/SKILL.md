---
name: sdlc-sprint
description: Run one full SDLC sprint for Pet Physio Vet using the agent team (PM → Tech Lead → Backend ‖ Frontend → QA → Tech Lead review → PM sign-off). Use when the user wants to plan and execute a sprint, advance the roadmap, or "run the team" on a scope. Optionally pass the target phase or a story list as args.
---

# SDLC Sprint — Pet Physio Vet

This skill runs the team through one iteration of the software development lifecycle.
It orchestrates the five agents in `.claude/agents/` in the fixed order below.

## Before you start
1. Read `CLAUDE.md` and `PRODUCT_PLAN.md` for current phase and rules.
2. Determine the sprint scope from the user's args (a phase like "Phase 0" or "Phase 2",
   or an explicit story list). If unclear, ask which phase to run.

## The loop (one sprint)
1. **Plan** — invoke `product-manager`: produce the prioritized user stories with
   acceptance criteria (traced to SRS AC-xx) for this sprint's scope.
2. **Design** — invoke `tech-lead`: for each story, produce the technical design +
   backend/frontend task breakdown.
3. **Build** — invoke `backend-engineer` and `frontend-engineer` (React web) in parallel
   on their tasks. Each returns files changed, ACs covered, and test output.
4. **Test** — invoke `qa-security-engineer`: verify every AC (PASS/FAIL with evidence),
   run suites, run the security review, return a ranked defect list.
5. **Review** — invoke `tech-lead`: review the integrated diff; `approved` or
   `changes_requested`. If changes requested, loop back to step 3 for those stories
   (max 2 rework rounds, then escalate to the user).
6. **Sign-off** — invoke `product-manager`: accept/reject each story against its ACs and
   state the next sprint's scope.

## Preferred execution
For the automated, parallel version, run the workflow instead:
`Workflow({ name: "sdlc-sprint", args: { phase: "<phase>", stories: [...] } })`
(script at `.claude/workflows/sdlc-sprint.js`). Use this skill's step list when running
the loop interactively / one agent at a time.

## Output of a sprint
- Backlog + stories in `docs/backlog/`
- Designs/ADRs in `docs/adr/`
- Code + tests in the relevant service/client
- A sprint report: stories accepted/rejected, ACs met, open defects, next scope.

## Rules
- Do not skip QA or sign-off. A story is "done" only when its ACs are verified.
- Enforce every CLAUDE.md non-negotiable (secrets, data ownership, authZ, idempotency).
- Report the sprint result to the user before starting the next one.
