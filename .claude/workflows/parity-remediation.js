export const meta = {
  name: 'parity-remediation',
  description: 'Sprint 1.1: fix the 3 failing parity screens (deterministic seeded fixtures + suppress autofocus rings), re-run Playwright pixel-diff on all 9 planned screens, loop until QA is fully PASS (max 2 rounds), then Tech Lead review + PM sign-off. Keeps vet.css verbatim.',
  phases: [
    { title: 'Plan' },
    { title: 'Build' },
    { title: 'Parity' },
    { title: 'Review' },
    { title: 'Sign-off' },
  ],
}

const PLAN = {
  type: 'object', required: ['approach', 'tasks'],
  properties: {
    approach: { type: 'string' },
    fixture_strategy: { type: 'string' },
    tasks: { type: 'array', items: { type: 'string' } },
  },
}
const BUILD = {
  type: 'object', required: ['summary', 'files_changed'],
  properties: {
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    commands_run: { type: 'array', items: { type: 'string' } },
    compiles: { type: 'boolean' },
    flags: { type: 'array', items: { type: 'string' } },
  },
}
const QA = {
  type: 'object', required: ['overall', 'screen_results'],
  properties: {
    overall: { type: 'string', enum: ['PASS', 'FAIL'] },
    screen_results: { type: 'array', items: { type: 'object',
      required: ['screen', 'parity'],
      properties: {
        screen: { type: 'string' },
        parity: { type: 'string', enum: ['PASS', 'FAIL'] },
        diff_summary: { type: 'string' },
      } } },
    remaining_issues: { type: 'array', items: { type: 'string' } },
  },
}
const REVIEW = {
  type: 'object', required: ['decision'],
  properties: { decision: { type: 'string', enum: ['approved', 'changes_requested'] },
    feedback: { type: 'array', items: { type: 'string' } } },
}
const SIGNOFF = {
  type: 'object', required: ['decision', 'next_scope'],
  properties: { decision: { type: 'string' }, summary: { type: 'string' },
    next_scope: { type: 'string' } },
}

const SCREENS = ['app_base (shell, its own diff case)', 'login', 'signup', 'dashboard',
  'appointments', 'create', 'reschedule', 'patients', 'pet_form']

const CTX = 'Read CLAUDE.md, docs/UI_PARITY.md, and your role file under .claude/agents/. ' +
  'Context: Sprint 1 built a React SPA (frontend/) that reuses backend/appointments/static/vet.css ' +
  'VERBATIM (byte-identical — keep it that way) plus a DRF API under /api/v1. Playwright parity ' +
  'passed on 6/9 screens; FAILED on login, dashboard, reschedule. ROOT CAUSES: (1) React mock ' +
  'data has a different ROW COUNT than the seeded Django data (breaks dashboard/backend/appointments/' +
  'reschedule); (2) autofocus rings on login/signup inputs add pixel noise. Viewport is 1280x800. ' +
  'Playwright chromium is installed globally — use NODE_PATH="$(npm root -g)". Do NOT git commit.'

// PLAN
phase('Plan')
const plan = await agent(
  `${CTX}\nAs Tech Lead, produce the remediation plan: (a) a DETERMINISTIC seed — a Django ` +
  `management command (e.g. manage.py seed_parity) that creates a fixed dataset, AND matching ` +
  `React fixture data that mirrors it ROW-FOR-ROW so screenshots align; (b) suppress autofocus ` +
  `(and any caret/focus-ring) during parity capture without changing real UX — e.g. a parity ` +
  `flag/route or Playwright injecting CSS to neutralize :focus rings on both sides equally; ` +
  `(c) ensure app_base shell is diffed as its OWN case. Split into backend and frontend tasks.`,
  { agentType: 'general-purpose', phase: 'Plan', schema: PLAN },
)

let qa = null, lastBuild = null
let hitCap = false
// Try up to MAX_ROUNDS parity rounds. If it's still not fully GREEN after that,
// STOP the loop and hand off for MANUAL review rather than looping further.
const MAX_ROUNDS = 3
let round = 0
while (true) {
  round += 1
  if (round > MAX_ROUNDS) {
    hitCap = true
    log(`Reached the ${MAX_ROUNDS}-round cap without full PASS — exiting loop for MANUAL review.`)
    break
  }
  phase('Build')
  log(`Remediation round ${round}: build fixes`)
  const prev = qa ? `Previous QA still failing: ${JSON.stringify(qa.screen_results.filter(s => s.parity === 'FAIL'))}. ` : ''
  const [backend, frontend] = await parallel([
    () => agent(
      `${CTX}\n${prev}As Backend Engineer (round ${round}), implement ONLY under backend/appointments/ ` +
      `and backend/petphysio/. Add the deterministic seed (manage.py seed_parity or a fixture) creating a ` +
      `FIXED, known dataset (doctor + pets + appointments) so the dashboard/backend/appointments/reschedule ` +
      `pages render identical rows every run. Keep endpoints/tests green (run them). Plan: ` +
      `${JSON.stringify(plan)}.`,
      { agentType: 'general-purpose', label: `be:r${round}`, phase: 'Build', schema: BUILD },
    ),
    () => agent(
      `${CTX}\n${prev}As Frontend Engineer (round ${round}), implement ONLY under frontend/. ` +
      `Make the React mock/fixture data mirror the Django seed ROW-FOR-ROW for dashboard, ` +
      `appointments, and reschedule. Neutralize autofocus/focus-ring differences for parity ` +
      `capture WITHOUT breaking real UX. Do NOT edit vet.css (keep byte-identical). Run ` +
      `"npm run build" to confirm it compiles. Plan: ${JSON.stringify(plan)}.`,
      { agentType: 'general-purpose', label: `fe:r${round}`, phase: 'Build', schema: BUILD },
    ),
  ])
  lastBuild = { backend, frontend }

  phase('Parity')
  qa = await agent(
    `${CTX}\nAs QA (round ${round}), run the deterministic parity check: seed Django ` +
    `(manage.py seed_parity), start Django runserver, build+preview the React app, then use ` +
    `Playwright — it is installed LOCALLY at frontend/node_modules (chromium cached). Run ` +
    `your capture script FROM the frontend directory with ` +
    "`const { chromium } = require('playwright')`. Do NOT use the global install or NODE_PATH " +
    `(that path is broken and wastes time). Screenshot at 1280x800 and pixel-diff ALL NINE ` +
    `planned screens: ` +
    `${JSON.stringify(SCREENS)} (app_base as its OWN case; do NOT include 'share'). Save shots ` +
    `under frontend/parity-shots/round${round}/. Report per-screen PASS/FAIL + remaining ` +
    `issues. Backend: ${JSON.stringify(backend)}. Frontend: ${JSON.stringify(frontend)}.`,
    { agentType: 'general-purpose', label: `qa:r${round}`, phase: 'Parity', schema: QA },
  )
  log(`Round ${round} parity: ${qa?.overall}`)
  if (qa?.overall === 'PASS') break
}

// REVIEW
phase('Review')
const review = await agent(
  `${CTX}\nAs Tech Lead, review the remediation. QA: ${JSON.stringify(qa)}. Build: ` +
  `${JSON.stringify(lastBuild)}. Confirm vet.css still byte-identical, focus-ring fix doesn't ` +
  `harm real UX, and the seed is deterministic. Approve or request changes.`,
  { agentType: 'general-purpose', phase: 'Review', schema: REVIEW },
)

// SIGN-OFF
phase('Sign-off')
const signoff = await agent(
  `As PM, sign off Sprint 1.1. Parity overall: ${qa?.overall}. Per-screen: ` +
  `${JSON.stringify((qa?.screen_results ?? []).map(s => ({ s: s.screen, p: s.parity })))}. ` +
  `Review: ${review?.decision}. ${hitCap ? 'NOTE: the loop hit its 3-round cap and exited ' +
  'for MANUAL review — do NOT auto-accept; summarize exactly which screens still fail and what ' +
  'a human should check/fix next. ' : ''}Accept only if ALL nine screens PASS and review ` +
  `approved; otherwise reject and state the next scope (Sprint 2 = wire React to /api/v1).`,
  { agentType: 'general-purpose', phase: 'Sign-off', schema: SIGNOFF },
)

return {
  sprint: 'parity-remediation',
  rounds_run: round - (hitCap ? 1 : 0),
  hit_round_cap: hitCap,
  needs_manual_review: hitCap || qa?.overall !== 'PASS' || review?.decision !== 'approved',
  parity_overall: qa?.overall,
  parity_by_screen: (qa?.screen_results ?? []).map(s => ({ screen: s.screen, parity: s.parity })),
  remaining_issues: qa?.remaining_issues ?? [],
  review: review?.decision,
  signoff,
}
