export const meta = {
  name: 'sprint6-auth-hardening',
  description: 'Sprint 6: Auth hardening (SRS §3.1/§4) — JWT access + rotating refresh, RBAC, bcrypt cost>=12, audit logging; frontend token handling. HARDENED loop: Design emits an enforced API contract; Build foundation-first + dynamic file-disjoint fan-out; a CHEAP contract smoke-test gate (paths resolve + response keys match) runs BEFORE the expensive Playwright QA, with a cross-boundary integration-fixer; incremental verify (only re-test what failed) with no-progress escalation; 3-round cap then manual.',
  phases: [
    { title: 'Plan' }, { title: 'Design' }, { title: 'Build' },
    { title: 'Contract' }, { title: 'Verify' }, { title: 'Review' }, { title: 'Sign-off' },
  ],
}

const PLAN = { type: 'object', required: ['stories'], properties: {
  stories: { type: 'array', items: { type: 'object', required: ['id', 'title', 'acceptance_criteria'],
    properties: { id: { type: 'string' }, title: { type: 'string' }, srs_ref: { type: 'string' },
      acceptance_criteria: { type: 'array', items: { type: 'string' } } } } } } }

const TASK = { type: 'object', required: ['name', 'owns_files', 'detail'], properties: {
  name: { type: 'string' }, owns_files: { type: 'array', items: { type: 'string' } }, detail: { type: 'string' } } }

// Design MUST emit the enforced contract (the anti-drift source of truth).
const CONTRACT_ITEM = { type: 'object', required: ['method', 'path'], properties: {
  method: { type: 'string' }, path: { type: 'string' },
  request: { type: 'string' }, response_keys: { type: 'array', items: { type: 'string' } },
  canonical_side: { type: 'string', enum: ['backend', 'frontend'] } } }

const DESIGN = { type: 'object',
  required: ['models', 'api_contract', 'backend_foundation', 'frontend_foundation', 'backend_tasks', 'frontend_tasks'],
  properties: {
    models: { type: 'array', items: { type: 'string' } },
    api_contract: { type: 'array', items: CONTRACT_ITEM },
    backend_foundation: { type: 'string' }, frontend_foundation: { type: 'string' },
    backend_tasks: { type: 'array', items: TASK }, frontend_tasks: { type: 'array', items: TASK },
    notes: { type: 'string' } } }

const BUILD = { type: 'object', required: ['summary'], properties: {
  summary: { type: 'string' }, files_changed: { type: 'array', items: { type: 'string' } },
  compiles: { type: 'boolean' }, flags: { type: 'array', items: { type: 'string' } } } }

const CONTRACTCHECK = { type: 'object', required: ['ok'], properties: {
  ok: { type: 'boolean' },
  defects: { type: 'array', items: { type: 'object', properties: {
    kind: { type: 'string' }, frontend_ref: { type: 'string' }, backend_reality: { type: 'string' },
    canonical_side: { type: 'string' }, fix: { type: 'string' } } } } } }

const QA = { type: 'object', required: ['overall', 'functional_results', 'regression_parity'], properties: {
  overall: { type: 'string', enum: ['PASS', 'FAIL'] },
  functional_results: { type: 'array', items: { type: 'object', properties: {
    area: { type: 'string' }, result: { type: 'string', enum: ['PASS', 'FAIL'] }, evidence: { type: 'string' } } } },
  regression_parity: { type: 'array', items: { type: 'object', properties: {
    screen: { type: 'string' }, parity: { type: 'string', enum: ['PASS', 'FAIL'] }, classification: { type: 'string' } } } },
  remaining_issues: { type: 'array', items: { type: 'string' } } } }

const REVIEW = { type: 'object', required: ['decision'], properties: {
  decision: { type: 'string', enum: ['approved', 'changes_requested'] }, feedback: { type: 'array', items: { type: 'string' } } } }

const SIGNOFF = { type: 'object', required: ['decision', 'next_scope'], properties: {
  decision: { type: 'string' }, summary: { type: 'string' }, next_scope: { type: 'string' } } }

const CTX = 'Read CLAUDE.md, docs/UI_PARITY.md, PRODUCT_PLAN.md, and your role file under ' +
  '.claude/agents/ (follow its hardening rules). State: React SPA (frontend/) wired to DRF ' +
  '/api/v1 via SessionAuthentication + CSRF (auth login/logout/me, dashboard, appointments, ' +
  'pets, diagnosis, treatment, billing, notifications), pixel-parity kept (vet.css VERBATIM; ' +
  'dashboard baselined against frontend/parity-baseline/dashboard.png per docs/UI_PARITY.md). ' +
  'SPRINT 6 = AUTH HARDENING (SRS §3.1 + §4): JWT access (short TTL) + ROTATING refresh with ' +
  'server-side revocation, RBAC (DOCTOR role claim enforced server-side), password hashing ' +
  'bcrypt cost>=12 (PASSWORD_HASHERS; migrate/upgrade on next login), and AUDIT LOGGING of every ' +
  'create/update/delete with user id + timestamp. Frontend: attach Bearer access token, refresh ' +
  'on 401, clear on logout; keep login/logout UX + pixel parity. Learnings: Playwright is LOCAL ' +
  'in frontend; Django golden runs DEBUG=true + "manage.py seed_parity"; viewport 1280x800. ' +
  'CONTRACT DISCIPLINE: implement to the Design api_contract EXACTLY (paths + response keys); the ' +
  'side with passing tests is canonical; never break a passing test to satisfy the other side. ' +
  'Do NOT git commit.'

phase('Plan')
const plan = await agent(
  `${CTX}\nAs PM, write stories for auth hardening: JWT+refresh login flow, token refresh on ` +
  `expiry, RBAC enforcement, bcrypt>=12 hashing + upgrade path, audit logging of mutations. ACs ` +
  `must include SRS §3.1 (AC-02 JWT on login, AC-05 logout revokes) + §4 (bcrypt>=12, audit), and ` +
  `"no regression to existing parity screens".`,
  { agentType: 'general-purpose', phase: 'Plan', schema: PLAN })

phase('Design')
const design = await agent(
  `${CTX}\nAs Tech Lead, design Sprint 6 AND emit the ENFORCED api_contract (every auth endpoint: ` +
  `exact path, method, request, EXACT response keys, canonical_side) — this is the anti-drift ` +
  `source of truth both engineers implement verbatim. Also: models (RefreshToken/blocklist, ` +
  `AuditLog); backend_foundation (JWT lib + settings PASSWORD_HASHERS bcrypt>=12 + urls wiring + ` +
  `audit middleware skeleton — shared files first); frontend_foundation (token store + axios/fetch ` +
  `interceptor for Bearer + 401-refresh — shared files first); then backend_tasks[] and ` +
  `frontend_tasks[] each owning NON-OVERLAPPING files. Note where auth touches many endpoints ` +
  `(cross-cutting) so the contract is watertight. Stories: ${JSON.stringify(plan?.stories ?? [])}.`,
  { agentType: 'general-purpose', phase: 'Design', schema: DESIGN })

// BUILD — foundation first (shared files) then dynamic file-disjoint fan-out
phase('Build')
const [beFound, feFound] = await parallel([
  () => agent(`${CTX}\nAs Backend Engineer, do ONLY the BACKEND FOUNDATION: ${design.backend_foundation}. ` +
    `Implement to api_contract: ${JSON.stringify(design.api_contract)}. Models: ${JSON.stringify(design.models)}. ` +
    `Run migrations + existing tests (paste output). Touch ONLY backend/appointments/ + backend/petphysio/.`,
    { agentType: 'general-purpose', label: 'be:foundation', phase: 'Build', schema: BUILD }),
  () => agent(`${CTX}\nAs Frontend Engineer, do ONLY the FRONTEND FOUNDATION: ${design.frontend_foundation}. ` +
    `Consume api_contract EXACTLY: ${JSON.stringify(design.api_contract)}. Keep vet.css byte-identical. ` +
    `Run "npm run build". Touch ONLY frontend/.`,
    { agentType: 'general-purpose', label: 'fe:foundation', phase: 'Build', schema: BUILD }),
])
const CAP = 6
const beTasks = design.backend_tasks || [], feTasks = design.frontend_tasks || []
if (beTasks.length + feTasks.length > CAP) log(`NOTE: ${beTasks.length + feTasks.length} disjoint tasks; runtime cap queues beyond ~${CAP}.`)
const built = await parallel([
  ...beTasks.map(t => () => agent(`${CTX}\nAs Backend Engineer, implement ONLY task "${t.name}" — ${t.detail}. ` +
    `Edit ONLY: ${JSON.stringify(t.owns_files)}. Do NOT touch models.py/urls.py/settings.py or add migrations (foundation did). ` +
    `Implement to api_contract exactly: ${JSON.stringify(design.api_contract)}. Add + run tests.`,
    { agentType: 'general-purpose', label: `be:${t.name}`.slice(0, 40), phase: 'Build', schema: BUILD })),
  ...feTasks.map(t => () => agent(`${CTX}\nAs Frontend Engineer, implement ONLY task "${t.name}" — ${t.detail}. ` +
    `Edit ONLY: ${JSON.stringify(t.owns_files)}. Do NOT touch router/nav/package.json (foundation did) or vet.css. ` +
    `Consume api_contract EXACTLY: ${JSON.stringify(design.api_contract)}.`,
    { agentType: 'general-purpose', label: `fe:${t.name}`.slice(0, 40), phase: 'Build', schema: BUILD })),
])
log(`Fan-out: ${built.filter(Boolean).length}/${built.length} task agents ok`)

// CONTRACT GATE — cheap, deterministic, BEFORE the expensive browser QA.
// Catches path/key drift in seconds; an integration-fixer (both sides) repairs it.
phase('Contract')
const runContractCheck = () => agent(
  `${CTX}\nRun the CHEAP CONTRACT SMOKE-TEST (no browser). Start Django (DEBUG=true, ` +
  `"manage.py seed_parity"). (1) grep frontend/src for every api("/...")/fetch path and assert ` +
  `NONE returns 404 against the running backend. (2) For each list/detail endpoint, confirm the ` +
  `response JSON keys match what the frontend reads (per the api_contract: ${JSON.stringify(design.api_contract)}). ` +
  `Report ok=true only if all paths resolve AND all keys match; otherwise list each defect with ` +
  `frontend_ref, backend_reality, canonical_side (the side with passing tests wins), and the fix.`,
  { agentType: 'general-purpose', label: 'contract-check', phase: 'Contract', schema: CONTRACTCHECK })

let contract = await runContractCheck()
let cRound = 0
while (!contract?.ok && cRound < 2) {
  cRound++
  log(`Contract defects found — cross-boundary integration fix (attempt ${cRound})`)
  await agent(
    `${CTX}\nYou are the CROSS-BOUNDARY INTEGRATION FIXER — you MAY edit BOTH backend/appointments/petphysio ` +
    `AND frontend to align the two sides to the canonical contract. Fix ONLY these contract ` +
    `defects, changing the NON-canonical side (never break a passing test): ${JSON.stringify(contract.defects)}. ` +
    `Keep vet.css byte-identical. Run backend tests + npm build.`,
    { agentType: 'general-purpose', label: `integration-fix${cRound}`, phase: 'Contract', schema: BUILD })
  contract = await runContractCheck()
}
log(`Contract gate: ${contract?.ok ? 'PASS' : 'STILL FAILING (will surface in Verify)'}`)

// VERIFY — incremental (only re-test failures) + final full sweep; no-progress escalation.
let qa = null, hitCap = false, prevSig = null
const MAX_ROUNDS = 3
const FULL = 'SCOPE = FULL: ALL functional areas + regression on ALL parity screens.'
const sig = (q) => JSON.stringify({
  f: (q?.functional_results || []).filter(x => x.result === 'FAIL').map(x => x.area).sort(),
  r: (q?.regression_parity || []).filter(x => x.parity === 'FAIL').map(x => x.screen).sort() })
const verifyPrompt = (rnd, scope) =>
  `${CTX}\nAs QA (round ${rnd}), verify Sprint 6. ${scope}\nRun contract smoke-test first, then: ` +
  `FUNCTIONAL — login returns a JWT access token (AC-02); wrong creds 401; token refresh works + ` +
  `rotates; logout revokes the refresh (AC-05, within 5s); RBAC blocks non-doctor; password hash ` +
  `is bcrypt cost>=12; a create/update/delete writes an AuditLog with user id + timestamp. ` +
  `REGRESSION — local Playwright 1280x800 vs golden (dashboard vs its React baseline); classify ` +
  `each diff intended-feature vs true-regression. Return ALL items (re-tested fresh; out-of-scope ` +
  `carried forward). overall=PASS only if every functional area PASSes AND no TRUE regression.`
let round = 0
while (true) {
  round += 1
  if (round > MAX_ROUNDS) { hitCap = true; log(`3-round cap — exit to MANUAL review.`); break }
  if (round > 1) {
    const curSig = sig(qa)
    const noProgress = curSig === prevSig
    const crossBoundary = (qa.remaining_issues || []).some(s => /contract|mismatch|404|key|path|token|401/i.test(s))
    phase('Build')
    if (noProgress || crossBoundary) {
      log(`Fix round ${round}: ${noProgress ? 'NO PROGRESS vs last round' : 'cross-boundary'} → single INTEGRATION fixer (both sides)`)
      await agent(`${CTX}\nCROSS-BOUNDARY INTEGRATION FIXER (may edit BOTH sides). The previous ` +
        `fix approach did not work; align both sides to the canonical contract and fix the ROOT ` +
        `cause of: functional=${JSON.stringify((qa.functional_results||[]).filter(f=>f.result==='FAIL'))} ` +
        `regression=${JSON.stringify((qa.regression_parity||[]).filter(p=>p.parity==='FAIL'))} ` +
        `issues=${JSON.stringify(qa.remaining_issues||[])}. Keep vet.css byte-identical; keep tests green.`,
        { agentType: 'general-purpose', label: `integration-fix-r${round}`, phase: 'Build', schema: BUILD })
    } else {
      const prev = `Prev fails: func=${JSON.stringify((qa.functional_results||[]).filter(f=>f.result==='FAIL'))} regr=${JSON.stringify((qa.regression_parity||[]).filter(p=>p.parity==='FAIL'))}. `
      await parallel([
        () => agent(`${CTX}\n${prev}As Backend Engineer (fix ${round}), fix API-side ONLY under backend/appointments/petphysio. Keep tests+migrations green.`,
          { agentType: 'general-purpose', label: `be:fix${round}`, phase: 'Build', schema: BUILD }),
        () => agent(`${CTX}\n${prev}As Frontend Engineer (fix ${round}), fix client-side ONLY under frontend. vet.css byte-identical.`,
          { agentType: 'general-purpose', label: `fe:fix${round}`, phase: 'Build', schema: BUILD }),
      ])
    }
  }
  phase('Verify')
  const failF = qa ? (qa.functional_results || []).filter(f => f.result === 'FAIL').map(f => f.area) : []
  const failS = qa ? (qa.regression_parity || []).filter(p => p.parity === 'FAIL').map(p => p.screen) : []
  const scope = round === 1 ? FULL
    : `SCOPE = INCREMENTAL: re-test ONLY last round's fails — functional ${JSON.stringify(failF)}, screens ${JSON.stringify(failS)}; carry other results forward from ${JSON.stringify({ functional: qa.functional_results || [], regression: qa.regression_parity || [] })}.`
  prevSig = sig(qa)
  qa = await agent(verifyPrompt(round, scope), { agentType: 'general-purpose', label: `qa:r${round}`, phase: 'Verify', schema: QA })
  log(`Round ${round} (${round === 1 ? 'full' : 'incremental'}): overall=${qa?.overall}`)
  if (qa?.overall === 'PASS') {
    if (round === 1) break
    phase('Verify'); log('Incremental pass → final FULL sweep')
    const sweep = await agent(verifyPrompt(round, FULL), { agentType: 'general-purpose', label: `qa:sweep${round}`, phase: 'Verify', schema: QA })
    if (sweep?.overall === 'PASS') { qa = sweep; break }
    qa = sweep; log('Final sweep found new fails — looping')
  }
}

phase('Review')
const review = await agent(`${CTX}\nAs Tech Lead, review Sprint 6. QA: ${JSON.stringify(qa)}. Confirm: JWT+rotating ` +
  `refresh + revocation, RBAC server-side, bcrypt>=12, audit logging, contract honored (no drift), ` +
  `vet.css byte-identical, no true regression, no secrets. Approve or request changes.`,
  { agentType: 'general-purpose', phase: 'Review', schema: REVIEW })

phase('Sign-off')
const signoff = await agent(`As PM, sign off Sprint 6. overall=${qa?.overall}; functional=` +
  `${JSON.stringify((qa?.functional_results ?? []).map(f => ({ a: f.area, r: f.result })))}; regression=` +
  `${JSON.stringify((qa?.regression_parity ?? []).map(p => ({ s: p.screen, p: p.parity })))}; review=${review?.decision}. ` +
  `${hitCap ? 'NOTE: hit 3-round cap — MANUAL review; list what still fails. ' : ''}Accept only if functional all PASS, ` +
  `no true regression, review approved; next scope (Sprint 7 = Dashboard completeness + Queries §3.2/§3.9).`,
  { agentType: 'general-purpose', phase: 'Sign-off', schema: SIGNOFF })

return {
  sprint: 'auth-hardening',
  fanout: { backend_tasks: (design?.backend_tasks || []).length, frontend_tasks: (design?.frontend_tasks || []).length, task_agents_ok: built.filter(Boolean).length, task_agents_total: built.length },
  contract_gate: { passed: !!contract?.ok, fix_attempts: cRound },
  rounds_run: round - (hitCap ? 1 : 0), hit_round_cap: hitCap,
  needs_manual_review: hitCap || qa?.overall !== 'PASS' || review?.decision !== 'approved',
  overall: qa?.overall,
  functional: (qa?.functional_results ?? []).map(f => ({ area: f.area, result: f.result })),
  regression: (qa?.regression_parity ?? []).map(p => ({ screen: p.screen, parity: p.parity })),
  remaining_issues: qa?.remaining_issues ?? [], review: review?.decision, signoff,
}
