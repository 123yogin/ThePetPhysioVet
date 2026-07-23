export const meta = {
  name: 'sprint2-wire-api',
  description: 'Sprint 2: replace the React app mock data with live wiring to the DRF /api/v1 endpoints (auth/me, dashboard stats, appointments list/create/reschedule/complete, pets list/create), while keeping the verified pixel parity intact. QA verifies functional data flow AND re-runs Playwright parity regression; loops up to 3 rounds then hands off to manual review.',
  phases: [
    { title: 'Plan' },
    { title: 'Design' },
    { title: 'Build' },
    { title: 'Verify' },
    { title: 'Review' },
    { title: 'Sign-off' },
  ],
}

const PLAN = { type: 'object', required: ['stories'], properties: {
  stories: { type: 'array', items: { type: 'object', required: ['id', 'title', 'acceptance_criteria'],
    properties: { id: { type: 'string' }, title: { type: 'string' },
      acceptance_criteria: { type: 'array', items: { type: 'string' } } } } } } }

const DESIGN = { type: 'object', required: ['api_client', 'endpoints', 'tasks'], properties: {
  api_client: { type: 'string' }, auth_flow: { type: 'string' }, dev_proxy: { type: 'string' },
  endpoints: { type: 'array', items: { type: 'string' } },
  parity_preservation: { type: 'string' },
  backend_tasks: { type: 'array', items: { type: 'string' } },
  tasks: { type: 'array', items: { type: 'string' } } } }

const BUILD = { type: 'object', required: ['summary', 'files_changed'], properties: {
  summary: { type: 'string' }, files_changed: { type: 'array', items: { type: 'string' } },
  commands_run: { type: 'array', items: { type: 'string' } }, compiles: { type: 'boolean' },
  flags: { type: 'array', items: { type: 'string' } } } }

const QA = { type: 'object', required: ['overall', 'functional_results', 'parity_results'], properties: {
  overall: { type: 'string', enum: ['PASS', 'FAIL'] },
  functional_results: { type: 'array', items: { type: 'object', properties: {
    area: { type: 'string' }, result: { type: 'string', enum: ['PASS', 'FAIL'] }, evidence: { type: 'string' } } } },
  parity_results: { type: 'array', items: { type: 'object', properties: {
    screen: { type: 'string' }, parity: { type: 'string', enum: ['PASS', 'FAIL'] } } } },
  remaining_issues: { type: 'array', items: { type: 'string' } } } }

const REVIEW = { type: 'object', required: ['decision'], properties: {
  decision: { type: 'string', enum: ['approved', 'changes_requested'] },
  feedback: { type: 'array', items: { type: 'string' } } } }

const SIGNOFF = { type: 'object', required: ['decision', 'next_scope'], properties: {
  decision: { type: 'string' }, summary: { type: 'string' }, next_scope: { type: 'string' } } }

const CTX = 'Read CLAUDE.md, docs/UI_PARITY.md, and your role file under .claude/agents/. ' +
  'Context: the React SPA (frontend/) renders 9 doctor screens with MOCK data and is ' +
  'PIXEL-IDENTICAL to Django (vet.css reused VERBATIM — keep it byte-identical). The Django ' +
  'service exposes a DRF JSON API at /api/v1 (auth login/logout/me/signup via DRF ' +
  'SessionAuthentication + CSRF; dashboard/stats; appointments list/create/detail/reschedule/' +
  'complete/share; pets list+search/create; all scoped to request.user). GOAL of Sprint 2: ' +
  'replace the React mock data with LIVE calls to /api/v1, WITHOUT breaking pixel parity. ' +
  'Learnings to honor: Playwright is installed LOCALLY in frontend (require("playwright") ' +
  'from that dir; chromium cached; do NOT use the global install). The Django parity golden ' +
  'MUST run with DEBUG=true (else vet.css 404s) and be seeded via "manage.py seed_parity". ' +
  'Viewport 1280x800. Do NOT git commit.'

// PLAN
phase('Plan')
const plan = await agent(
  `${CTX}\nAs PM, write user stories to wire each screen/domain to the live API: auth/session ` +
  `(login, logout, current user, RequireAuth redirect), dashboard stats, appointments ` +
  `(list+filter, create, reschedule, complete, share), pets (list+search, create). Each story's ` +
  `ACs must include "loads/writes real data via /api/v1" AND "pixel parity on affected screens ` +
  `is preserved (Playwright diff still PASS)". Also cover loading/error/empty states.`,
  { agentType: 'general-purpose', phase: 'Plan', schema: PLAN },
)

// DESIGN
phase('Design')
const design = await agent(
  `${CTX}\nAs Tech Lead, design Sprint 2: (a) a typed API client (fetch with credentials, ` +
  `CSRF token from the csrftoken cookie on unsafe methods) + React Query hooks per endpoint; ` +
  `(b) the auth flow against DRF SessionAuthentication (login sets session+csrftoken, me for ` +
  `bootstrap, 401 -> redirect to login); (c) how the React dev server reaches Django same-origin ` +
  `to avoid CORS/CSRF pain — PREFER a Vite dev proxy (/api -> http://127.0.0.1:8000) over ` +
  `django-cors-headers; (d) how pixel parity is preserved (data shapes must match the mock ` +
  `content the golden expects; keep markup + vet.css unchanged). Split into backend_tasks and ` +
  `frontend tasks. Stories: ${JSON.stringify(plan?.stories ?? [])}.`,
  { agentType: 'general-purpose', phase: 'Design', schema: DESIGN },
)

// BUILD (parallel, disjoint paths)
phase('Build')
const [backend, frontend] = await parallel([
  () => agent(
    `${CTX}\nAs Backend Engineer, implement ONLY under backend/appointments/ and backend/petphysio/. Make the ` +
    `API ready for the SPA: confirm/adjust serializer response shapes to match what the screens ` +
    `render, ensure CSRF + SessionAuthentication work behind a same-origin Vite proxy, and ` +
    `ensure "manage.py seed_parity" yields the exact dataset the parity golden expects. Keep all ` +
    `existing tests green (run them, paste output). Design: ${JSON.stringify(design)}.`,
    { agentType: 'general-purpose', label: 'be:wire', phase: 'Build', schema: BUILD },
  ),
  () => agent(
    `${CTX}\nAs Frontend Engineer, implement ONLY under frontend/. Add the typed API client + ` +
    `React Query hooks and REPLACE the mock data on every screen with live /api/v1 calls (auth/me ` +
    `bootstrap + RequireAuth, dashboard stats, appointments list/filter/create/reschedule/complete/` +
    `share, pets list/search/create). Add loading/error/empty states. Configure the Vite dev proxy ` +
    `(/api -> Django). Keep vet.css BYTE-IDENTICAL and the markup/classes unchanged so parity holds. ` +
    `Run "npm run build" (paste output). Design: ${JSON.stringify(design)}.`,
    { agentType: 'general-purpose', label: 'fe:wire', phase: 'Build', schema: BUILD },
  ),
])

// VERIFY loop: functional + parity regression, up to 3 rounds then manual
let qa = null, hitCap = false
const MAX_ROUNDS = 3
let round = 0
while (true) {
  round += 1
  if (round > MAX_ROUNDS) {
    hitCap = true
    log(`Reached ${MAX_ROUNDS}-round cap without full PASS — exiting for MANUAL review.`)
    break
  }
  phase('Verify')
  const prev = qa ? `Previous QA still failing: functional=${JSON.stringify(qa.functional_results?.filter(f => f.result === 'FAIL'))} parity=${JSON.stringify(qa.parity_results?.filter(p => p.parity === 'FAIL'))}. ` : ''
  if (round > 1) {
    // remediation build before re-verifying
    phase('Build')
    await parallel([
      () => agent(`${CTX}\n${prev}As Backend Engineer (fix round ${round}), fix the API-side causes ONLY under backend/appointments/petphysio. Keep tests green.`,
        { agentType: 'general-purpose', label: `be:fix${round}`, phase: 'Build', schema: BUILD }),
      () => agent(`${CTX}\n${prev}As Frontend Engineer (fix round ${round}), fix the client-side causes ONLY under frontend. Keep vet.css byte-identical.`,
        { agentType: 'general-purpose', label: `fe:fix${round}`, phase: 'Build', schema: BUILD }),
    ])
    phase('Verify')
  }
  qa = await agent(
    `${CTX}\n${prev}As QA (round ${round}), verify Sprint 2 end to end: (1) FUNCTIONAL — start ` +
    `Django (DEBUG=true, run "manage.py seed_parity" first), start the React app with its Vite ` +
    `proxy; drive real flows via the running app and assert each screen loads/writes REAL data ` +
    `through /api/v1 (login, dashboard stats, appointments list/create/reschedule/complete, pets ` +
    `list/create). (2) PARITY REGRESSION — using the LOCAL Playwright (require from frontend) at ` +
    `1280x800, re-screenshot and pixel-diff all 9 screens vs the seeded Django golden; save under ` +
    `frontend/parity-shots/s2-r${round}/. overall = PASS only if functional AND parity both pass. ` +
    `Backend: ${JSON.stringify(backend)}. Frontend: ${JSON.stringify(frontend)}.`,
    { agentType: 'general-purpose', label: `qa:r${round}`, phase: 'Verify', schema: QA },
  )
  log(`Round ${round}: overall=${qa?.overall}`)
  if (qa?.overall === 'PASS') break
}

// REVIEW
phase('Review')
const review = await agent(
  `${CTX}\nAs Tech Lead, review Sprint 2. QA: ${JSON.stringify(qa)}. Confirm: real API wiring ` +
  `(no leftover mock), auth/CSRF correct, vet.css still byte-identical, parity preserved, no ` +
  `secrets, disjoint paths respected. Approve or request changes.`,
  { agentType: 'general-purpose', phase: 'Review', schema: REVIEW },
)

// SIGN-OFF
phase('Sign-off')
const signoff = await agent(
  `As PM, sign off Sprint 2. overall=${qa?.overall}; functional=` +
  `${JSON.stringify((qa?.functional_results ?? []).map(f => ({ a: f.area, r: f.result })))}; parity=` +
  `${JSON.stringify((qa?.parity_results ?? []).map(p => ({ s: p.screen, p: p.parity })))}; review=` +
  `${review?.decision}. ${hitCap ? 'NOTE: hit the 3-round cap and exited for MANUAL review — do NOT ' +
  'auto-accept; list exactly what still fails and what a human should check. ' : ''}Accept only if ` +
  `functional AND parity all PASS and review approved; state next scope (Sprint 3 = diagnosis + ` +
  `treatment screens per SRS §3.4/§3.5).`,
  { agentType: 'general-purpose', phase: 'Sign-off', schema: SIGNOFF },
)

return {
  sprint: 'wire-api',
  rounds_run: round - (hitCap ? 1 : 0),
  hit_round_cap: hitCap,
  needs_manual_review: hitCap || qa?.overall !== 'PASS' || review?.decision !== 'approved',
  overall: qa?.overall,
  functional: (qa?.functional_results ?? []).map(f => ({ area: f.area, result: f.result })),
  parity: (qa?.parity_results ?? []).map(p => ({ screen: p.screen, parity: p.parity })),
  remaining_issues: qa?.remaining_issues ?? [],
  review: review?.decision,
  signoff,
}
