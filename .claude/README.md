# .claude/ — Pet Physio Vet agent team & workflow

Project-specific Claude Code setup: the agent team, the skills, the settings, and the
SDLC loop workflow. Shared project context lives in `../CLAUDE.md`.

## Team (agents/)
| File | Role | Model |
|---|---|---|
| `agents/product-manager.md` | Backlog, user stories, ACs, sprint scope, sign-off | opus |
| `agents/tech-lead.md` | Technical design, task breakdown, code review, ADRs | opus |
| `agents/backend-engineer.md` | Services, APIs, DB, events, tests | sonnet |
| `agents/frontend-engineer.md` | React doctor web app (web only), tests | sonnet |
| `agents/qa-security-engineer.md` | AC verification, tests, security review | opus |

> Scope note: **web only** — the React Native mobile app is out of scope for now.

Invoke one directly: `@product-manager plan Phase 2` (or via the Agent tool by name).

## Skills (skills/)
- `sdlc-sprint` — run one full SDLC sprint through the team (interactive step list).
- `srs-traceability` — build the SRS→code→test coverage matrix and find gaps.

## Workflow (workflows/)
- `sdlc-sprint.js` — the automated loop: PM → Tech Lead → (Backend ‖ Frontend) → QA →
  Tech Lead review → PM sign-off. Run with:
  `Workflow({ name: "sdlc-sprint", args: { phase: "Phase 0" } })`
  Engineers build in isolated git worktrees so parallel work doesn't collide.

## Settings (settings.json)
Permission allowlist for common Django/Node/Terraform/git commands; `git push`,
`git commit`, `terraform apply`, `kubectl` require confirmation; reading `.env` /
secrets is denied.

## The loop
```
PM: plan  →  Tech Lead: design  →  Backend ‖ Frontend: build
   →  QA: verify ACs + security  →  Tech Lead: review  →  PM: sign-off  →  (next sprint)
```
Nothing is "done" until QA verifies its acceptance criteria and the PM signs off.
