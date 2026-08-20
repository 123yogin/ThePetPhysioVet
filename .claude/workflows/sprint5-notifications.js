export const meta = {
  name: 'sprint5-notifications',
  description: 'Sprint 5: Notifications & Reminders (SRS §3.7 + §7) — doctor in-app notification feed + unread badge, event-driven notifications (appointment lifecycle, invoice, payment, diagnosis, treatment), scheduled 24h/1h/30min reminders via a cron-able management command with suppression on cancel/reschedule, SMS to owner (Twilio/MSG91) + FCM web push behind a dev mock, SMS opt-out. Foundation-first then dynamic file-disjoint fan-out; QA functional + regression parity; loop up to 3 rounds then manual.',
  phases: [
    { title: 'Plan' }, { title: 'Design' }, { title: 'Build' },
    { title: 'Verify' }, { title: 'Review' }, { title: 'Sign-off' },
  ],
}

const PLAN = { type: 'object', required: ['stories'], properties: {
  stories: { type: 'array', items: { type: 'object', required: ['id', 'title', 'acceptance_criteria'],
    properties: { id: { type: 'string' }, title: { type: 'string' }, srs_ref: { type: 'string' },
      acceptance_criteria: { type: 'array', items: { type: 'string' } } } } } } }

const TASK = { type: 'object', required: ['name', 'owns_files', 'detail'], properties: {
  name: { type: 'string' }, owns_files: { type: 'array', items: { type: 'string' } }, detail: { type: 'string' } } }

const DESIGN = { type: 'object',
  required: ['models', 'backend_foundation', 'frontend_foundation', 'backend_tasks', 'frontend_tasks'],
  properties: {
    models: { type: 'array', items: { type: 'string' } },
    endpoints: { type: 'array', items: { type: 'string' } },
    scheduler: { type: 'string' }, providers: { type: 'string' },
    backend_foundation: { type: 'string' }, frontend_foundation: { type: 'string' },
    backend_tasks: { type: 'array', items: TASK }, frontend_tasks: { type: 'array', items: TASK } } }

// Loosened (only summary required) to avoid StructuredOutput retry-cap failures seen in Sprint 4.
const BUILD = { type: 'object', required: ['summary'], properties: {
  summary: { type: 'string' }, files_changed: { type: 'array', items: { type: 'string' } },
  compiles: { type: 'boolean' }, flags: { type: 'array', items: { type: 'string' } } } }

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
  '.claude/agents/. Current state: React SPA (frontend/) wired to DRF /api/v1 (auth session+CSRF, ' +
  'dashboard, appointments, pets, diagnosis, treatment, billing), all pixel-identical to Django ' +
  '(vet.css reused VERBATIM — keep byte-identical; UI extensions live in clinical.css). SPRINT 5 = ' +
  'NOTIFICATIONS & REMINDERS (SRS §3.7 + §7), DOCTOR WEB ONLY: (a) Notification model + feed API ' +
  '(latest N, unread badge count, mark-read) shown on the dashboard; (b) event-driven notification ' +
  'creation for the §7 catalogue — appointment created/accepted/reschedule/cancelled, invoice ' +
  'generated, payment received, diagnosis uploaded, treatment plan added; (c) scheduled reminders ' +
  '24h/1h/30min before an appointment via a cron-able Django management command (e.g. ' +
  '"manage.py send_due_reminders"), firing within a window, with SUPPRESSION when the appointment is ' +
  'cancelled or rescheduled; (d) delivery channels: SMS to the owner phone (Twilio/MSG91) + FCM web ' +
  'push to the doctor — BOTH behind a provider abstraction with a DEV MOCK (no real keys; record a ' +
  'DeliveryLog) so it is testable offline; (e) SMS OPT-OUT preference. New notification UI reuses ' +
  'vet.css and must NOT regress the existing pixel-parity screens. Learnings: Playwright is LOCAL in ' +
  'frontend (require from there; chromium cached; not global); Django golden runs DEBUG=true (else ' +
  'vet.css 404s) and is seeded via "manage.py seed_parity"; viewport 1280x800. Do NOT git commit.'

phase('Plan')
const plan = await agent(
  `${CTX}\nAs PM, write stories for §3.7 reminders (24h/1h/30min, ±window, suppression on cancel/` +
  `reschedule, SMS opt-out) and §7 notification catalogue (doctor in-app feed + unread badge, ` +
  `event-driven creation) + SMS/FCM delivery via mock. ACs must include the SRS criteria and ` +
  `"reuses vet.css / no regression to existing parity screens".`,
  { agentType: 'general-purpose', phase: 'Plan', schema: PLAN })

phase('Design')
const design = await agent(
  `${CTX}\nAs Tech Lead, design Sprint 5 AND split the build into FILE-DISJOINT tasks. Provide: ` +
  `models (Notification, NotificationPref, DeviceToken, DeliveryLog); backend_foundation = shared-file ` +
  `work FIRST and alone (models + migrations + settings + urls wiring + the provider/notification ` +
  `service abstraction with dev mock); frontend_foundation = shared React work first (nav badge + ` +
  `routes + shared notification hooks); then backend_tasks[] and frontend_tasks[] each owning ` +
  `NON-OVERLAPPING files (e.g. backend: feed API, event hooks/signals, reminder management command, ` +
  `sms adapter, fcm adapter, opt-out endpoint; frontend: notification feed/dropdown, notification ` +
  `settings/opt-out page). NO two tasks share a file. Stories: ${JSON.stringify(plan?.stories ?? [])}.`,
  { agentType: 'general-purpose', phase: 'Design', schema: DESIGN })

phase('Build')
log('Build: foundation first, then dynamic file-disjoint fan-out')
const [beFound, feFound] = await parallel([
  () => agent(
    `${CTX}\nAs Backend Engineer, do ONLY the BACKEND FOUNDATION (shared files, before fan-out): ` +
    `${design.backend_foundation}. Create the notification models + migrations, wire urls/settings, ` +
    `and the provider/notification-service abstraction with a DEV MOCK. Run migrations + existing ` +
    `tests (paste output). Touch ONLY backend/appointments/ + backend/petphysio/. Models: ${JSON.stringify(design.models)}.`,
    { agentType: 'general-purpose', label: 'be:foundation', phase: 'Build', schema: BUILD }),
  () => agent(
    `${CTX}\nAs Frontend Engineer, do ONLY the FRONTEND FOUNDATION (shared files): ` +
    `${design.frontend_foundation}. Add the nav unread badge, notification routes, and shared ` +
    `notification hooks/types, reusing vet.css (byte-identical; extensions in clinical.css). Run ` +
    `"npm run build". Touch ONLY frontend/.`,
    { agentType: 'general-purpose', label: 'fe:foundation', phase: 'Build', schema: BUILD }),
])

const CAP = 6
const beTasks = design.backend_tasks || []
const feTasks = design.frontend_tasks || []
if (beTasks.length + feTasks.length > CAP)
  log(`NOTE: ${beTasks.length + feTasks.length} disjoint tasks defined; runtime cap queues beyond ~${CAP} concurrent.`)
const built = await parallel([
  ...beTasks.map(t => () => agent(
    `${CTX}\nModels: ${JSON.stringify(design.models)}\nAs Backend Engineer, implement ONLY task ` +
    `"${t.name}" — ${t.detail}. Edit ONLY these files (yours alone): ${JSON.stringify(t.owns_files)}. ` +
    `Do NOT add migrations or edit models.py/urls.py/settings.py (foundation did that). Add + run ` +
    `tests for your piece. Foundation: ${JSON.stringify(beFound)}.`,
    { agentType: 'general-purpose', label: `be:${t.name}`.slice(0, 40), phase: 'Build', schema: BUILD })),
  ...feTasks.map(t => () => agent(
    `${CTX}\nAs Frontend Engineer, implement ONLY task "${t.name}" — ${t.detail}. Edit ONLY these ` +
    `files: ${JSON.stringify(t.owns_files)}. Do NOT edit router/nav/package.json (foundation did that) ` +
    `or vet.css. Reuse vet.css classes so it looks native. Foundation: ${JSON.stringify(feFound)}.`,
    { agentType: 'general-purpose', label: `fe:${t.name}`.slice(0, 40), phase: 'Build', schema: BUILD })),
])
log(`Fan-out: ${built.filter(Boolean).length}/${built.length} task agents ok`)

let qa = null, hitCap = false
const MAX_ROUNDS = 3
let round = 0

// Verify-prompt builder. `scope` selects FULL vs INCREMENTAL to avoid redundant rework:
// round 1 tests everything; later rounds re-test ONLY what failed and carry prior passes forward.
const FULL = 'SCOPE = FULL: test ALL functional areas AND regression on ALL 9 screens.'
const verifyPrompt = (rnd, scope) =>
  `${CTX}\nAs QA (round ${rnd}), verify Sprint 5. ${scope}\nProcedure: start Django (DEBUG=true, ` +
  `"manage.py seed_parity" first) + React via Vite proxy. FUNCTIONAL areas: notification feed (latest ` +
  `N + unread badge + mark-read); each §7 event creates the right notification; "manage.py ` +
  `send_due_reminders" fires 24h/1h/30min + SUPPRESSES after cancel/reschedule; SMS+FCM via the mock ` +
  `provider write a DeliveryLog; SMS opt-out honored. NEW-SCREEN CHECKS: screenshot notification UI ` +
  `under frontend/parity-shots/s5-r${rnd}/, confirm vet.css reuse + no console errors. REGRESSION: ` +
  `local Playwright at 1280x800 vs the seeded golden. Your returned functional_results + ` +
  `regression_parity MUST list ALL items (re-tested ones with fresh results; out-of-scope ones copied ` +
  `forward). overall=PASS only if EVERY functional area AND EVERY regression screen is PASS. ` +
  `Foundation ok: ${JSON.stringify({ be: !!beFound, fe: !!feFound, tasks: built.filter(Boolean).length })}.`

while (true) {
  round += 1
  if (round > MAX_ROUNDS) { hitCap = true; log(`Reached ${MAX_ROUNDS}-round cap — exiting for MANUAL review.`); break }
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
  // INCREMENTAL scope on rounds 2+: only re-test what failed last round; carry prior passes forward.
  const failF = qa ? (qa.functional_results || []).filter(f => f.result === 'FAIL').map(f => f.area) : []
  const failS = qa ? (qa.regression_parity || []).filter(p => p.parity === 'FAIL').map(p => p.screen) : []
  const scope = round === 1 ? FULL
    : `SCOPE = INCREMENTAL: re-test ONLY what failed last round — functional areas ${JSON.stringify(failF)} ` +
      `and regression screens ${JSON.stringify(failS)}. Do NOT re-run items that already passed; copy their ` +
      `prior result forward from: ${JSON.stringify({ functional: qa.functional_results || [], regression: qa.regression_parity || [] })}.`
  qa = await agent(verifyPrompt(round, scope), { agentType: 'general-purpose', label: `qa:r${round}`, phase: 'Verify', schema: QA })
  log(`Round ${round} (${round === 1 ? 'full' : 'incremental'}): overall=${qa?.overall}`)
  if (qa?.overall === 'PASS') {
    if (round === 1) break  // full pass on round 1 → done
    // Incremental pass on a later round → ONE final FULL sweep to catch fix-induced regressions.
    phase('Verify')
    log('Incremental round passed — running one final FULL sweep to catch any new regressions')
    const sweep = await agent(verifyPrompt(round, FULL), { agentType: 'general-purpose', label: `qa:sweep${round}`, phase: 'Verify', schema: QA })
    if (sweep?.overall === 'PASS') { qa = sweep; break }
    qa = sweep  // sweep exposed new breakage → loop again, targeting the sweep's fails
    log('Final full sweep found new regressions — looping to fix them')
  }
}

phase('Review')
const review = await agent(
  `${CTX}\nAs Tech Lead, review Sprint 5. QA: ${JSON.stringify(qa)}. Confirm: reminder windows + ` +
  `suppression correct, opt-out honored, providers mocked (no real keys/secrets), notification UI ` +
  `reuses vet.css (byte-identical), existing screens not regressed. Approve or request changes.`,
  { agentType: 'general-purpose', phase: 'Review', schema: REVIEW })

phase('Sign-off')
const signoff = await agent(
  `As PM, sign off Sprint 5. overall=${qa?.overall}; functional=` +
  `${JSON.stringify((qa?.functional_results ?? []).map(f => ({ a: f.area, r: f.result })))}; regression=` +
  `${JSON.stringify((qa?.regression_parity ?? []).map(p => ({ s: p.screen, p: p.parity })))}; review=` +
  `${review?.decision}. ${hitCap ? 'NOTE: hit the 3-round cap — MANUAL review; list what still fails. ' : ''}` +
  `Accept only if functional AND regression all PASS, UI clean, review approved; state next scope ` +
  `(Sprint 6 = Auth hardening: JWT+refresh, RBAC, bcrypt≥12, audit logging).`,
  { agentType: 'general-purpose', phase: 'Sign-off', schema: SIGNOFF })

return {
  sprint: 'notifications',
  fanout: { backend_tasks: (design?.backend_tasks || []).length, frontend_tasks: (design?.frontend_tasks || []).length,
            task_agents_ok: built.filter(Boolean).length, task_agents_total: built.length },
  rounds_run: round - (hitCap ? 1 : 0), hit_round_cap: hitCap,
  needs_manual_review: hitCap || qa?.overall !== 'PASS' || review?.decision !== 'approved',
  overall: qa?.overall,
  functional: (qa?.functional_results ?? []).map(f => ({ area: f.area, result: f.result })),
  regression: (qa?.regression_parity ?? []).map(p => ({ screen: p.screen, parity: p.parity })),
  remaining_issues: qa?.remaining_issues ?? [], review: review?.decision, signoff,
}
