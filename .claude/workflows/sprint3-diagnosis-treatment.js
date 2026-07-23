export const meta = {
  name: 'sprint3-diagnosis-treatment',
  description: 'Sprint 3: build the doctor-facing Diagnosis (SRS §3.4) and Treatment Protocol (SRS §3.5) features — new Django models/migrations + DRF endpoints (incl. file upload) and new React screens reusing vet.css. QA verifies functional flows + design consistency + NO regression on the existing 9 pixel-parity screens; loops up to 3 rounds then manual review.',
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

const DESIGN = { type: 'object', required: ['models', 'endpoints', 'screens', 'tasks'], properties: {
  models: { type: 'array', items: { type: 'string' } },
  migrations: { type: 'string' },
  endpoints: { type: 'array', items: { type: 'string' } },
  file_upload: { type: 'string' },
  screens: { type: 'array', items: { type: 'string' } },
  design_consistency: { type: 'string' },
  backend_tasks: { type: 'array', items: { type: 'string' } },
  tasks: { type: 'array', items: { type: 'string' } } } }

const BUILD = { type: 'object', required: ['summary', 'files_changed'], properties: {
  summary: { type: 'string' }, files_changed: { type: 'array', items: { type: 'string' } },
  commands_run: { type: 'array', items: { type: 'string' } }, compiles: { type: 'boolean' },
  tests_output: { type: 'string' }, flags: { type: 'array', items: { type: 'string' } } } }

const QA = { type: 'object', required: ['overall', 'functional_results', 'regression_parity'], properties: {
  overall: { type: 'string', enum: ['PASS', 'FAIL'] },
  functional_results: { type: 'array', items: { type: 'object', properties: {
    area: { type: 'string' }, result: { type: 'string', enum: ['PASS', 'FAIL'] }, evidence: { type: 'string' } } } },
  new_screen_checks: { type: 'array', items: { type: 'object', properties: {
    screen: { type: 'string' }, uses_vetcss: { type: 'boolean' }, no_console_errors: { type: 'boolean' },
    screenshot: { type: 'string' } } } },
  regression_parity: { type: 'array', items: { type: 'object', properties: {
    screen: { type: 'string' }, parity: { type: 'string', enum: ['PASS', 'FAIL'] } } } },
  remaining_issues: { type: 'array', items: { type: 'string' } } } }

const REVIEW = { type: 'object', required: ['decision'], properties: {
  decision: { type: 'string', enum: ['approved', 'changes_requested'] },
  feedback: { type: 'array', items: { type: 'string' } } } }

const SIGNOFF = { type: 'object', required: ['decision', 'next_scope'], properties: {
  decision: { type: 'string' }, summary: { type: 'string' }, next_scope: { type: 'string' } } }

const CTX = 'Read CLAUDE.md, docs/UI_PARITY.md, PRODUCT_PLAN.md, and your role file under ' +
  '.claude/agents/. Current state: the React SPA (frontend/) has 9 doctor screens wired to a ' +
  'DRF /api/v1 (auth session+CSRF, dashboard, appointments, pets), all pixel-identical to Django ' +
  '(vet.css reused VERBATIM — keep byte-identical). SPRINT 3 adds two NEW doctor features from ' +
  'the SRS: (§3.4) DIAGNOSIS — upload diagnostic reports (X-Ray/MRI/CT/Blood/Other) with rich-text ' +
  'notes, per pet; type + 20MB size validation; list/view; delete/replace; DICOM opens in a browser ' +
  'tab (v1). (§3.5) TREATMENT PROTOCOL — structured plan (therapy types: Laser/Hydrotherapy/' +
  'Stretching/Home Exercise/Other; frequency Daily/Alternate/Weekly/Custom; duration 4wk/8wk/Custom; ' +
  'status Active/On Hold/Completed) with per-session timestamped progress notes; archive on complete. ' +
  'These screens are NEW (no Django HTML golden), so there is NO pixel target for them — instead ' +
  'build them to REUSE the vet.css design system (glass cards, tokens, classes) so they look native, ' +
  'and integrate into the existing app shell/nav. Files: uploads go to Django MEDIA (local disk) for ' +
  'now — OCI Object Storage is a later phase. Learnings: Playwright is LOCAL in frontend ' +
  '(require from there; chromium cached; not the global install); Django golden runs with DEBUG=true ' +
  '(else vet.css 404s) and is seeded via "manage.py seed_parity". Viewport 1280x800. Do NOT git commit.'

// PLAN
phase('Plan')
const plan = await agent(
  `${CTX}\nAs PM, write user stories for Diagnosis (§3.4) and Treatment (§3.5) — doctor web only. ` +
  `Cover: upload report (type+size validation), list/view reports, delete/replace, DICOM-in-tab; ` +
  `create treatment plan (therapies/frequency/duration/status), add per-session progress notes, ` +
  `archive on complete. Each story's ACs must include "reuses vet.css design system (looks native)" ` +
  `and "does not regress the existing 9 pixel-parity screens".`,
  { agentType: 'general-purpose', phase: 'Plan', schema: PLAN },
)

// DESIGN
phase('Design')
const design = await agent(
  `${CTX}\nAs Tech Lead, design Sprint 3: (a) Django models Diagnosis(pet, report_type, file, ` +
  `notes, uploaded_at, doctor) and TreatmentPlan(pet, therapies JSON, frequency, start/end, status) ` +
  `+ ProgressNote(plan, session_no, notes, created_at) with migrations; (b) DRF /api/v1 endpoints ` +
  `incl. multipart file upload (20MB + type validation), list/create/delete/replace, treatment ` +
  `plan + progress-note endpoints, all scoped to request.user; (c) React screens reusing vet.css ` +
  `(where they live in the pet detail / nav), rich-text notes, upload UI, DICOM-in-tab; ` +
  `(d) how to keep the existing 9 screens' parity intact. Split backend_tasks and frontend tasks. ` +
  `Stories: ${JSON.stringify(plan?.stories ?? [])}.`,
  { agentType: 'general-purpose', phase: 'Design', schema: DESIGN },
)

// BUILD (parallel, disjoint paths)
phase('Build')
const [backend, frontend] = await parallel([
  () => agent(
    `${CTX}\nAs Backend Engineer, implement ONLY under backend/appointments/ and backend/petphysio/. Add the ` +
    `Diagnosis, TreatmentPlan, ProgressNote models + migrations, and DRF endpoints (multipart ` +
    `upload with 20MB + report-type/format validation; list/create/delete/replace; treatment plan ` +
    `+ progress notes), scoped to request.user. Keep existing endpoints/tests green and add new ` +
    `tests (run all, paste output). Run migrations. Design: ${JSON.stringify(design)}.`,
    { agentType: 'general-purpose', label: 'be:build', phase: 'Build', schema: BUILD },
  ),
  () => agent(
    `${CTX}\nAs Frontend Engineer, implement ONLY under frontend/. Build the Diagnosis and ` +
    `Treatment React screens REUSING vet.css classes/tokens (glass cards etc.) so they look native, ` +
    `wired to the new /api/v1 endpoints (upload with progress + validation messages, list/view, ` +
    `delete/replace, DICOM-in-tab; treatment plan form + progress-note timeline). Integrate into the ` +
    `app shell/nav. Keep vet.css BYTE-IDENTICAL and do not alter the existing 9 screens' markup. Run ` +
    `"npm run build" (paste output). Design: ${JSON.stringify(design)}.`,
    { agentType: 'general-purpose', label: 'fe:build', phase: 'Build', schema: BUILD },
  ),
])

// VERIFY loop (cap 3 then manual): functional + new-screen checks + regression parity
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
      () => agent(`${CTX}\n${prev}As Backend Engineer (fix round ${round}), fix API-side causes ONLY under backend/appointments/petphysio. Keep tests green.`,
        { agentType: 'general-purpose', label: `be:fix${round}`, phase: 'Build', schema: BUILD }),
      () => agent(`${CTX}\n${prev}As Frontend Engineer (fix round ${round}), fix client-side causes ONLY under frontend. Keep vet.css byte-identical; don't regress the 9 existing screens.`,
        { agentType: 'general-purpose', label: `fe:fix${round}`, phase: 'Build', schema: BUILD }),
    ])
  }
  phase('Verify')
  qa = await agent(
    `${CTX}\nAs QA (round ${round}), verify Sprint 3: (1) FUNCTIONAL — start Django (DEBUG=true, ` +
    `"manage.py seed_parity" first), start React with its Vite proxy; exercise via the running app: ` +
    `upload each report type (and reject >20MB / wrong type), list/view/delete/replace a report, ` +
    `DICOM-opens-in-tab, create a treatment plan, add progress notes, archive on complete — assert ` +
    `each works against /api/v1 with real data. (2) NEW-SCREEN CHECKS — screenshot the new diagnosis ` +
    `& treatment screens (save under frontend/parity-shots/s3-r${round}/), confirm each reuses ` +
    `vet.css (glass cards/tokens present) and has no console errors. (3) REGRESSION — using the LOCAL ` +
    `Playwright at 1280x800, re-diff the existing 9 screens vs the seeded Django golden; they must ` +
    `still PASS. overall=PASS only if functional PASS AND regression all PASS AND new screens use ` +
    `vet.css with no console errors. Backend: ${JSON.stringify(backend)}. Frontend: ${JSON.stringify(frontend)}.`,
    { agentType: 'general-purpose', label: `qa:r${round}`, phase: 'Verify', schema: QA },
  )
  log(`Round ${round}: overall=${qa?.overall}`)
  if (qa?.overall === 'PASS') break
}

// REVIEW
phase('Review')
const review = await agent(
  `${CTX}\nAs Tech Lead, review Sprint 3. QA: ${JSON.stringify(qa)}. Confirm: models/migrations sound, ` +
  `upload validation (20MB+type) enforced server-side, endpoints scoped to user, new screens reuse ` +
  `vet.css (byte-identical) and match the design system, existing 9 screens not regressed, no secrets. ` +
  `Approve or request changes.`,
  { agentType: 'general-purpose', phase: 'Review', schema: REVIEW },
)

// SIGN-OFF
phase('Sign-off')
const signoff = await agent(
  `As PM, sign off Sprint 3. overall=${qa?.overall}; functional=` +
  `${JSON.stringify((qa?.functional_results ?? []).map(f => ({ a: f.area, r: f.result })))}; regression=` +
  `${JSON.stringify((qa?.regression_parity ?? []).map(p => ({ s: p.screen, p: p.parity })))}; review=` +
  `${review?.decision}. ${hitCap ? 'NOTE: hit the 3-round cap and exited for MANUAL review — do NOT ' +
  'auto-accept; list exactly what still fails. ' : ''}Accept only if functional AND regression all PASS, ` +
  `new screens use vet.css cleanly, and review approved; state next scope (Sprint 4 = Payments/Billing ` +
  `SRS §3.8, or Owner responsive-web access).`,
  { agentType: 'general-purpose', phase: 'Sign-off', schema: SIGNOFF },
)

return {
  sprint: 'diagnosis-treatment',
  rounds_run: round - (hitCap ? 1 : 0),
  hit_round_cap: hitCap,
  needs_manual_review: hitCap || qa?.overall !== 'PASS' || review?.decision !== 'approved',
  overall: qa?.overall,
  functional: (qa?.functional_results ?? []).map(f => ({ area: f.area, result: f.result })),
  new_screens: (qa?.new_screen_checks ?? []).map(n => ({ screen: n.screen, uses_vetcss: n.uses_vetcss })),
  regression: (qa?.regression_parity ?? []).map(p => ({ screen: p.screen, parity: p.parity })),
  remaining_issues: qa?.remaining_issues ?? [],
  review: review?.decision,
  signoff,
}
