export const meta = {
  name: 'sprint4-payments',
  description: 'Sprint 4: Payments & Billing (SRS §3.8) — invoices, payment modes (advance/post/package/partial), Razorpay web checkout + idempotent webhook, package session counter, receipts PDF, revenue dashboard. Build phase runs a foundation step (models/migrations + React routing/nav) then DYNAMICALLY fans out over the file-disjoint tasks the Design step defines. QA: functional + regression parity + new-screen checks; loop up to 3 rounds then manual review.',
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
    properties: { id: { type: 'string' }, title: { type: 'string' }, srs_ref: { type: 'string' },
      acceptance_criteria: { type: 'array', items: { type: 'string' } } } } } } }

// Design must carve the sprint into FILE-DISJOINT tasks so the Build fan-out can't collide.
const TASK = { type: 'object', required: ['name', 'owns_files', 'detail'], properties: {
  name: { type: 'string' },
  owns_files: { type: 'array', items: { type: 'string' } },  // files THIS task alone may edit
  detail: { type: 'string' } } }

const DESIGN = { type: 'object',
  required: ['models', 'backend_foundation', 'frontend_foundation', 'backend_tasks', 'frontend_tasks'],
  properties: {
    models: { type: 'array', items: { type: 'string' } },
    endpoints: { type: 'array', items: { type: 'string' } },
    razorpay: { type: 'string' },
    backend_foundation: { type: 'string' },   // models + migrations + settings (shared files, done first)
    frontend_foundation: { type: 'string' },  // React routing/nav + api hooks (shared files, done first)
    backend_tasks: { type: 'array', items: TASK },
    frontend_tasks: { type: 'array', items: TASK },
    design_consistency: { type: 'string' } } }

const BUILD = { type: 'object', required: ['summary', 'files_changed'], properties: {
  summary: { type: 'string' }, files_changed: { type: 'array', items: { type: 'string' } },
  commands_run: { type: 'array', items: { type: 'string' } }, compiles: { type: 'boolean' },
  tests_output: { type: 'string' }, flags: { type: 'array', items: { type: 'string' } } } }

const QA = { type: 'object', required: ['overall', 'functional_results', 'regression_parity'], properties: {
  overall: { type: 'string', enum: ['PASS', 'FAIL'] },
  functional_results: { type: 'array', items: { type: 'object', properties: {
    area: { type: 'string' }, result: { type: 'string', enum: ['PASS', 'FAIL'] }, evidence: { type: 'string' } } } },
  new_screen_checks: { type: 'array', items: { type: 'object', properties: {
    screen: { type: 'string' }, uses_vetcss: { type: 'boolean' }, no_console_errors: { type: 'boolean' } } } },
  regression_parity: { type: 'array', items: { type: 'object', properties: {
    screen: { type: 'string' }, parity: { type: 'string', enum: ['PASS', 'FAIL'] } } } },
  remaining_issues: { type: 'array', items: { type: 'string' } } } }

const REVIEW = { type: 'object', required: ['decision'], properties: {
  decision: { type: 'string', enum: ['approved', 'changes_requested'] },
  feedback: { type: 'array', items: { type: 'string' } } } }

const SIGNOFF = { type: 'object', required: ['decision', 'next_scope'], properties: {
  decision: { type: 'string' }, summary: { type: 'string' }, next_scope: { type: 'string' } } }

const CTX = 'Read CLAUDE.md, docs/UI_PARITY.md, PRODUCT_PLAN.md, and your role file under ' +
  '.claude/agents/. Current state: React SPA (frontend/) with doctor screens wired to DRF ' +
  '/api/v1 (auth session+CSRF, dashboard, appointments, pets; + diagnosis/treatment from Sprint 3), ' +
  'all pixel-identical to Django (vet.css reused VERBATIM — keep byte-identical). SPRINT 4 = ' +
  'PAYMENTS & BILLING (SRS §3.8): Invoice (itemised line items, auto sequential number, subtotal/' +
  'tax/total, payment_status Pending/Paid/PartiallyPaid/Failed, payment_mode), Payment, Package ' +
  '(total/used sessions); payment modes advance/post-treatment/package/partial; Razorpay WEB ' +
  'checkout + idempotent webhook -> invoice status; package session counter decrements on a ' +
  'Completed appointment; downloadable PDF receipts; revenue dashboard (day/week/month). Razorpay: ' +
  'use TEST keys from env or a mock in dev, idempotency key in the webhook, store NO raw card data. ' +
  'New billing screens have no Django HTML golden — build them REUSING vet.css so they look native, ' +
  'and do NOT regress the existing pixel-parity screens. Learnings: Playwright is LOCAL in ' +
  'frontend (require from there; chromium cached; not the global install); Django golden runs ' +
  'DEBUG=true (else vet.css 404s) and is seeded via "manage.py seed_parity". Viewport 1280x800. ' +
  'Do NOT git commit.'

// PLAN
phase('Plan')
const plan = await agent(
  `${CTX}\nAs PM, write user stories for Payments & Billing (§3.8), doctor web only: generate ` +
  `itemised invoice, the four payment modes, Razorpay web checkout + webhook status update, ` +
  `package session counter decrement on Completed appointment, PDF receipts, revenue dashboard ` +
  `(day/week/month). Each story's ACs must include the SRS §3.8 criteria and "reuses vet.css / no ` +
  `regression to existing parity screens".`,
  { agentType: 'general-purpose', phase: 'Plan', schema: PLAN },
)

// DESIGN — must carve FILE-DISJOINT tasks so the Build fan-out is safe
phase('Design')
const design = await agent(
  `${CTX}\nAs Tech Lead, design Sprint 4 AND split the build into FILE-DISJOINT tasks for a dynamic ` +
  `parallel fan-out. Provide: (a) models (Invoice/Payment/Package); (b) backend_foundation = the ` +
  `SHARED-file work that must happen FIRST and alone (models + migrations + settings/urls wiring + ` +
  `Razorpay config) — because parallel agents cannot each edit models.py/urls.py/migrations; ` +
  `(c) frontend_foundation = the shared React work first (register routes + nav entries + shared API ` +
  `hooks); (d) backend_tasks[] and frontend_tasks[] — each an INDEPENDENT piece that owns a ` +
  `NON-OVERLAPPING set of files (list them in owns_files), e.g. backend: invoice endpoints, ` +
  `payment+webhook (idempotent), receipt-PDF service, revenue-dashboard endpoint; frontend: invoice ` +
  `list/create page, checkout page, receipts page, revenue widgets — each its own component file. ` +
  `NO two tasks may list the same file. Stories: ${JSON.stringify(plan?.stories ?? [])}.`,
  { agentType: 'general-purpose', phase: 'Design', schema: DESIGN },
)

// BUILD — foundation first (shared files), THEN dynamic file-disjoint fan-out (capped)
phase('Build')
log('Build: foundation (shared files) first, then dynamic fan-out over disjoint tasks')
const [beFound, feFound] = await parallel([
  () => agent(
    `${CTX}\nAs Backend Engineer, do ONLY the BACKEND FOUNDATION (shared files, must land before ` +
    `the fan-out): ${design.backend_foundation}. Create the Invoice/Payment/Package models + ` +
    `migrations, wire urls/settings + Razorpay config. Run migrations + existing tests (paste ` +
    `output). Touch ONLY backend/appointments/ + backend/petphysio/. Design: ${JSON.stringify(design.models)}.`,
    { agentType: 'general-purpose', label: 'be:foundation', phase: 'Build', schema: BUILD },
  ),
  () => agent(
    `${CTX}\nAs Frontend Engineer, do ONLY the FRONTEND FOUNDATION (shared files): ` +
    `${design.frontend_foundation}. Register the new billing routes + nav entries and shared API ` +
    `hooks/types, reusing vet.css. Keep vet.css byte-identical; do NOT alter existing screens' ` +
    `markup. Run "npm run build". Touch ONLY frontend/.`,
    { agentType: 'general-purpose', label: 'fe:foundation', phase: 'Build', schema: BUILD },
  ),
])

// Dynamic fan-out: one agent per file-disjoint task the Design defined, capped for the machine.
const CAP = 6
const beTasks = design.backend_tasks || []
const feTasks = design.frontend_tasks || []
if (beTasks.length + feTasks.length > CAP) {
  log(`NOTE: ${beTasks.length + feTasks.length} disjoint tasks defined; capping concurrent spawn at ${CAP} (rest queue via the runtime cap).`)
}
const built = await parallel([
  ...beTasks.map((t, i) => () => agent(
    `${CTX}\n${JSON.stringify(design.models)}\nAs Backend Engineer, implement ONLY this task: ` +
    `"${t.name}" — ${t.detail}. You may edit ONLY these files (they are yours; no other agent ` +
    `touches them): ${JSON.stringify(t.owns_files)}. Do NOT add migrations (foundation did that) ` +
    `and do NOT edit models.py/urls.py/settings.py. Import the models the foundation created. Add ` +
    `tests for your piece and run them (paste output). Foundation result: ${JSON.stringify(beFound)}.`,
    { agentType: 'general-purpose', label: `be:${t.name}`.slice(0, 40), phase: 'Build', schema: BUILD },
  )),
  ...feTasks.map((t, i) => () => agent(
    `${CTX}\nAs Frontend Engineer, implement ONLY this task: "${t.name}" — ${t.detail}. You may ` +
    `edit ONLY these files: ${JSON.stringify(t.owns_files)} (no other agent touches them). Do NOT ` +
    `edit the router/nav/package.json (foundation did that) or vet.css. Reuse vet.css classes so it ` +
    `looks native. Foundation result: ${JSON.stringify(feFound)}.`,
    { agentType: 'general-purpose', label: `fe:${t.name}`.slice(0, 40), phase: 'Build', schema: BUILD },
  )),
])
log(`Fan-out complete: ${built.filter(Boolean).length}/${built.length} task agents succeeded`)

// VERIFY loop (cap 3 then manual)
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
  if (round > 1) {
    const prev = `Previous QA fails: functional=${JSON.stringify((qa.functional_results||[]).filter(f=>f.result==='FAIL'))} regression=${JSON.stringify((qa.regression_parity||[]).filter(p=>p.parity==='FAIL'))} issues=${JSON.stringify(qa.remaining_issues||[])}. `
    phase('Build')
    await parallel([
      () => agent(`${CTX}\n${prev}As Backend Engineer (fix round ${round}), fix API-side causes ONLY under backend/appointments/petphysio. Keep tests + migrations green.`,
        { agentType: 'general-purpose', label: `be:fix${round}`, phase: 'Build', schema: BUILD }),
      () => agent(`${CTX}\n${prev}As Frontend Engineer (fix round ${round}), fix client-side causes ONLY under frontend. Keep vet.css byte-identical; don't regress existing screens.`,
        { agentType: 'general-purpose', label: `fe:fix${round}`, phase: 'Build', schema: BUILD }),
    ])
  }
  phase('Verify')
  qa = await agent(
    `${CTX}\nAs QA (round ${round}), verify Sprint 4: (1) FUNCTIONAL — start Django (DEBUG=true, ` +
    `"manage.py seed_parity" first) + React via Vite proxy; exercise: create itemised invoice, each ` +
    `payment mode, Razorpay TEST/mock checkout + webhook updating invoice status (assert idempotency ` +
    `on duplicate webhook), package counter decrement on a Completed appointment, download a PDF ` +
    `receipt, revenue dashboard day/week/month totals. (2) NEW-SCREEN CHECKS — screenshot billing ` +
    `screens under frontend/parity-shots/s4-r${round}/, confirm vet.css reuse + no console errors. ` +
    `(3) REGRESSION — local Playwright at 1280x800, re-diff the existing parity screens vs the seeded ` +
    `golden; must still PASS. overall=PASS only if functional PASS AND regression all PASS AND new ` +
    `screens clean. Foundation+tasks: ${JSON.stringify({ beFound, feFound, built: built.filter(Boolean).length })}.`,
    { agentType: 'general-purpose', label: `qa:r${round}`, phase: 'Verify', schema: QA },
  )
  log(`Round ${round}: overall=${qa?.overall}`)
  if (qa?.overall === 'PASS') break
}

// REVIEW
phase('Review')
const review = await agent(
  `${CTX}\nAs Tech Lead, review Sprint 4. QA: ${JSON.stringify(qa)}. Confirm: models/migrations sound, ` +
  `webhook idempotent + no raw card data (PCI), package counter correct, endpoints scoped to user, ` +
  `billing screens reuse vet.css (byte-identical), existing screens not regressed, no secrets. ` +
  `Approve or request changes.`,
  { agentType: 'general-purpose', phase: 'Review', schema: REVIEW },
)

// SIGN-OFF
phase('Sign-off')
const signoff = await agent(
  `As PM, sign off Sprint 4. overall=${qa?.overall}; functional=` +
  `${JSON.stringify((qa?.functional_results ?? []).map(f => ({ a: f.area, r: f.result })))}; regression=` +
  `${JSON.stringify((qa?.regression_parity ?? []).map(p => ({ s: p.screen, p: p.parity })))}; review=` +
  `${review?.decision}. ${hitCap ? 'NOTE: hit the 3-round cap and exited for MANUAL review — do NOT ' +
  'auto-accept; list what still fails. ' : ''}Accept only if functional AND regression all PASS, ` +
  `billing screens clean, and review approved; state next scope (Sprint 5 = Notifications & Reminders ` +
  `SRS §3.7/§7).`,
  { agentType: 'general-purpose', phase: 'Sign-off', schema: SIGNOFF },
)

return {
  sprint: 'payments',
  fanout: { backend_tasks: (design?.backend_tasks || []).length, frontend_tasks: (design?.frontend_tasks || []).length,
            task_agents_ok: built.filter(Boolean).length, task_agents_total: built.length },
  rounds_run: round - (hitCap ? 1 : 0),
  hit_round_cap: hitCap,
  needs_manual_review: hitCap || qa?.overall !== 'PASS' || review?.decision !== 'approved',
  overall: qa?.overall,
  functional: (qa?.functional_results ?? []).map(f => ({ area: f.area, result: f.result })),
  regression: (qa?.regression_parity ?? []).map(p => ({ screen: p.screen, parity: p.parity })),
  remaining_issues: qa?.remaining_issues ?? [],
  review: review?.decision,
  signoff,
}
