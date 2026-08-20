export const meta = {
  name: 'sprint7-dashboard-queries',
  description: 'Sprint 7: Dashboard completeness (SRS §3.2 — real active-treatments / pending-payments / today+monthly-revenue tiles now that billing exists) + Owner↔Doctor Queries (SRS §3.9 — append-only threads, up to 5 image attachments, doctor reply, audit-retained). HARDENED loop: enforced contract; foundation + dynamic fan-out; contract smoke-test gate + integration-fixer; incremental verify with no-progress escalation; and NOW a review-fix loop — review:changes_requested auto-routes the feedback to the integration-fixer and re-reviews instead of stalling. 3-round cap then manual.',
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
const CONTRACT_ITEM = { type: 'object', required: ['method', 'path'], properties: {
  method: { type: 'string' }, path: { type: 'string' }, request: { type: 'string' },
  response_keys: { type: 'array', items: { type: 'string' } }, canonical_side: { type: 'string' } } }
const DESIGN = { type: 'object', required: ['models', 'api_contract', 'backend_foundation', 'frontend_foundation', 'backend_tasks', 'frontend_tasks'],
  properties: { models: { type: 'array', items: { type: 'string' } }, api_contract: { type: 'array', items: CONTRACT_ITEM },
    backend_foundation: { type: 'string' }, frontend_foundation: { type: 'string' },
    backend_tasks: { type: 'array', items: TASK }, frontend_tasks: { type: 'array', items: TASK }, notes: { type: 'string' } } }
const BUILD = { type: 'object', required: ['summary'], properties: {
  summary: { type: 'string' }, files_changed: { type: 'array', items: { type: 'string' } }, compiles: { type: 'boolean' }, flags: { type: 'array', items: { type: 'string' } } } }
const CONTRACTCHECK = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' },
  defects: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string' }, frontend_ref: { type: 'string' }, backend_reality: { type: 'string' }, canonical_side: { type: 'string' }, fix: { type: 'string' } } } } } }
const QA = { type: 'object', required: ['overall', 'functional_results', 'regression_parity'], properties: {
  overall: { type: 'string', enum: ['PASS', 'FAIL'] },
  functional_results: { type: 'array', items: { type: 'object', properties: { area: { type: 'string' }, result: { type: 'string', enum: ['PASS', 'FAIL'] }, evidence: { type: 'string' } } } },
  regression_parity: { type: 'array', items: { type: 'object', properties: { screen: { type: 'string' }, parity: { type: 'string', enum: ['PASS', 'FAIL'] } } } },
  remaining_issues: { type: 'array', items: { type: 'string' } } } }
const REVIEW = { type: 'object', required: ['decision'], properties: { decision: { type: 'string', enum: ['approved', 'changes_requested'] }, feedback: { type: 'array', items: { type: 'string' } } } }
const SIGNOFF = { type: 'object', required: ['decision', 'next_scope'], properties: { decision: { type: 'string' }, summary: { type: 'string' }, next_scope: { type: 'string' } } }

const CTX = 'Read CLAUDE.md, docs/UI_PARITY.md, PRODUCT_PLAN.md, and your role file under .claude/agents/ ' +
  '(follow the hardening rules). State: React SPA (frontend/) on DRF /api/v1 with JWT+session auth, ' +
  'pixel-parity kept (vet.css VERBATIM & byte-identical across both copies; dashboard baselined against ' +
  'frontend/parity-baseline/dashboard.png). SPRINT 7 has two parts: (A) DASHBOARD COMPLETENESS (SRS §3.2) ' +
  '— wire the dashboard stat tiles to REAL data now that billing/treatment exist: active-treatments count, ' +
  'pending-payments sum, today-revenue, monthly-revenue (replace any placeholder). (B) OWNER↔DOCTOR QUERIES ' +
  '(SRS §3.9) — a Query thread per pet: messages with up to 5 image attachments (JPEG/PNG, 5MB each), doctor ' +
  'reply, APPEND-ONLY (no deletes — audit trail), stored in the pet history; doctor-side inbox + thread UI ' +
  '(owner-side is deferred). New query screens reuse vet.css; do NOT regress existing parity screens ' +
  '(dashboard tile VALUES may change but layout/markup must stay parity-stable — if tile text changes pixels, ' +
  'treat like the feed: baseline against the committed React reference, do not fake data). CONTRACT DISCIPLINE: ' +
  'implement the Design api_contract EXACTLY; tested side is canonical; never break a passing test. Learnings: ' +
  'Playwright LOCAL in frontend; Django golden DEBUG=true + seed_parity; viewport 1280x800. Do NOT git commit.'

phase('Plan')
const plan = await agent(`${CTX}\nAs PM, write stories for (A) dashboard real-data tiles (§3.2 widgets: active ` +
  `treatments, pending payments ₹, today revenue, monthly revenue) and (B) queries (§3.9: send message + up to 5 ` +
  `images, doctor reply, append-only/no-delete audit, thread in pet history, doctor inbox+thread UI). ACs include ` +
  `the §3.2/§3.9 criteria + "no regression to existing parity screens".`,
  { agentType: 'general-purpose', phase: 'Plan', schema: PLAN })

phase('Design')
const design = await agent(`${CTX}\nAs Tech Lead, design Sprint 7 AND emit the enforced api_contract (dashboard ` +
  `stats endpoint shape; query list/thread/create/reply endpoints incl. multipart image upload — exact paths + ` +
  `response keys + canonical_side). Models: Query/QueryMessage (+ attachments). backend_foundation = models + ` +
  `migrations + urls/settings (shared first); frontend_foundation = routes + nav + shared query hooks + dashboard ` +
  `stat hook (shared first); then backend_tasks[] and frontend_tasks[] each owning NON-OVERLAPPING files. ` +
  `Stories: ${JSON.stringify(plan?.stories ?? [])}.`,
  { agentType: 'general-purpose', phase: 'Design', schema: DESIGN })

phase('Build')
const [beFound, feFound] = await parallel([
  () => agent(`${CTX}\nAs Backend Engineer, BACKEND FOUNDATION only: ${design.backend_foundation}. Implement to ` +
    `api_contract: ${JSON.stringify(design.api_contract)}. Models: ${JSON.stringify(design.models)}. Migrate + run tests. Touch ONLY backend/appointments/ + backend/petphysio/.`,
    { agentType: 'general-purpose', label: 'be:foundation', phase: 'Build', schema: BUILD }),
  () => agent(`${CTX}\nAs Frontend Engineer, FRONTEND FOUNDATION only: ${design.frontend_foundation}. Consume ` +
    `api_contract EXACTLY: ${JSON.stringify(design.api_contract)}. vet.css byte-identical. npm build. Touch ONLY frontend/.`,
    { agentType: 'general-purpose', label: 'fe:foundation', phase: 'Build', schema: BUILD }),
])
const beTasks = design.backend_tasks || [], feTasks = design.frontend_tasks || []
const built = await parallel([
  ...beTasks.map(t => () => agent(`${CTX}\nAs Backend Engineer, ONLY task "${t.name}" — ${t.detail}. Edit ONLY ${JSON.stringify(t.owns_files)}. ` +
    `No migrations/models.py/urls.py/settings.py (foundation did). Implement to contract: ${JSON.stringify(design.api_contract)}. Add+run tests.`,
    { agentType: 'general-purpose', label: `be:${t.name}`.slice(0, 40), phase: 'Build', schema: BUILD })),
  ...feTasks.map(t => () => agent(`${CTX}\nAs Frontend Engineer, ONLY task "${t.name}" — ${t.detail}. Edit ONLY ${JSON.stringify(t.owns_files)}. ` +
    `No router/nav/package.json/vet.css. Consume contract EXACTLY: ${JSON.stringify(design.api_contract)}.`,
    { agentType: 'general-purpose', label: `fe:${t.name}`.slice(0, 40), phase: 'Build', schema: BUILD })),
])
log(`Fan-out: ${built.filter(Boolean).length}/${built.length} ok`)

// CONTRACT GATE
phase('Contract')
const runContractCheck = () => agent(`${CTX}\nRun the CHEAP CONTRACT SMOKE-TEST (no browser): start Django (DEBUG=true, ` +
  `seed_parity); assert every frontend api path resolves (no 404) and response keys match the api_contract ` +
  `(${JSON.stringify(design.api_contract)}). ok=true only if all pass; else list defects (frontend_ref, backend_reality, canonical_side, fix).`,
  { agentType: 'general-purpose', label: 'contract-check', phase: 'Contract', schema: CONTRACTCHECK })
let contract = await runContractCheck(), cRound = 0
while (!contract?.ok && cRound < 2) {
  cRound++; log(`Contract defects → integration fix ${cRound}`)
  await agent(`${CTX}\nCROSS-BOUNDARY INTEGRATION FIXER (may edit BOTH sides). Fix ONLY these contract defects on the ` +
    `NON-canonical side (never break a passing test): ${JSON.stringify(contract.defects)}. vet.css byte-identical; tests + npm build green.`,
    { agentType: 'general-purpose', label: `integration-fix${cRound}`, phase: 'Contract', schema: BUILD })
  contract = await runContractCheck()
}
log(`Contract gate: ${contract?.ok ? 'PASS' : 'STILL FAILING'}`)

// VERIFY (incremental + no-progress escalation)
let qa = null, hitCap = false, prevSig = null
const MAX_ROUNDS = 3
const FULL = 'SCOPE = FULL: ALL functional areas + regression on ALL parity screens.'
const sig = (q) => JSON.stringify({ f: (q?.functional_results || []).filter(x => x.result === 'FAIL').map(x => x.area).sort(), r: (q?.regression_parity || []).filter(x => x.parity === 'FAIL').map(x => x.screen).sort() })
const verifyPrompt = (rnd, scope) => `${CTX}\nAs QA (round ${rnd}), verify Sprint 7. ${scope}\nContract smoke-test first, then: ` +
  `FUNCTIONAL — dashboard tiles show REAL computed values (active treatments, pending ₹, today+monthly revenue) matching the seeded data; ` +
  `query: send message + attach up to 5 images (reject 6th / >5MB / non-image), doctor reply, messages are APPEND-ONLY (no delete endpoint), thread persists in pet history. ` +
  `REGRESSION — local Playwright 1280x800 vs golden (dashboard vs its React baseline); classify intended-feature vs true-regression. ` +
  `Return ALL items (re-tested fresh; out-of-scope carried forward). overall=PASS only if every functional area PASS AND no TRUE regression.`
let round = 0
while (true) {
  round += 1
  if (round > MAX_ROUNDS) { hitCap = true; log(`3-round cap — MANUAL review.`); break }
  if (round > 1) {
    const noProgress = sig(qa) === prevSig
    const crossBoundary = (qa.remaining_issues || []).some(s => /contract|mismatch|404|key|path/i.test(s))
    phase('Build')
    if (noProgress || crossBoundary) {
      log(`Fix ${round}: ${noProgress ? 'NO-PROGRESS' : 'cross-boundary'} → INTEGRATION fixer`)
      await agent(`${CTX}\nCROSS-BOUNDARY INTEGRATION FIXER (both sides). Root-cause fix: func=${JSON.stringify((qa.functional_results||[]).filter(f=>f.result==='FAIL'))} ` +
        `regr=${JSON.stringify((qa.regression_parity||[]).filter(p=>p.parity==='FAIL'))} issues=${JSON.stringify(qa.remaining_issues||[])}. vet.css byte-identical; tests green.`,
        { agentType: 'general-purpose', label: `integration-fix-r${round}`, phase: 'Build', schema: BUILD })
    } else {
      const prev = `Prev fails: func=${JSON.stringify((qa.functional_results||[]).filter(f=>f.result==='FAIL'))} regr=${JSON.stringify((qa.regression_parity||[]).filter(p=>p.parity==='FAIL'))}. `
      await parallel([
        () => agent(`${CTX}\n${prev}Backend Engineer (fix ${round}) — API-side ONLY under backend/appointments/petphysio. Tests+migrations green.`, { agentType: 'general-purpose', label: `be:fix${round}`, phase: 'Build', schema: BUILD }),
        () => agent(`${CTX}\n${prev}Frontend Engineer (fix ${round}) — client-side ONLY under frontend. vet.css byte-identical.`, { agentType: 'general-purpose', label: `fe:fix${round}`, phase: 'Build', schema: BUILD }),
      ])
    }
  }
  phase('Verify')
  const failF = qa ? (qa.functional_results || []).filter(f => f.result === 'FAIL').map(f => f.area) : []
  const failS = qa ? (qa.regression_parity || []).filter(p => p.parity === 'FAIL').map(p => p.screen) : []
  const scope = round === 1 ? FULL : `SCOPE = INCREMENTAL: re-test ONLY func ${JSON.stringify(failF)} + screens ${JSON.stringify(failS)}; carry the rest forward from ${JSON.stringify({ functional: qa.functional_results || [], regression: qa.regression_parity || [] })}.`
  prevSig = sig(qa)
  qa = await agent(verifyPrompt(round, scope), { agentType: 'general-purpose', label: `qa:r${round}`, phase: 'Verify', schema: QA })
  log(`Round ${round} (${round === 1 ? 'full' : 'incremental'}): overall=${qa?.overall}`)
  if (qa?.overall === 'PASS') {
    if (round === 1) break
    phase('Verify'); log('Incremental pass → final FULL sweep')
    const sweep = await agent(verifyPrompt(round, FULL), { agentType: 'general-purpose', label: `qa:sweep${round}`, phase: 'Verify', schema: QA })
    if (sweep?.overall === 'PASS') { qa = sweep; break }
    qa = sweep; log('Sweep found new fails — looping')
  }
}

// REVIEW + review-fix loop (NEW: changes_requested auto-routes to the integration-fixer, then re-reviews)
phase('Review')
let review = await agent(`${CTX}\nAs Tech Lead, review Sprint 7. QA: ${JSON.stringify(qa)}. Confirm: dashboard tiles ` +
  `use real data, queries append-only + attachment limits + audit, contract honored, vet.css byte-identical, no true ` +
  `regression, no secrets. Approve or request changes (be specific + file-anchored).`,
  { agentType: 'general-purpose', phase: 'Review', schema: REVIEW })
let reviewRound = 0
while (review?.decision === 'changes_requested' && !hitCap && reviewRound < 2) {
  reviewRound++
  log(`Review changes_requested → integration-fixer addresses feedback (round ${reviewRound})`)
  phase('Build')
  await agent(`${CTX}\nCROSS-BOUNDARY INTEGRATION FIXER (both sides allowed). The Tech Lead requested changes — ` +
    `implement EVERY item, changing the non-canonical side, without breaking passing tests or vet.css byte-identity: ` +
    `${JSON.stringify(review.feedback || [])}. Run backend tests + npm build.`,
    { agentType: 'general-purpose', label: `review-fix${reviewRound}`, phase: 'Build', schema: BUILD })
  phase('Verify')
  const sweep = await agent(verifyPrompt(`rf${reviewRound}`, FULL), { agentType: 'general-purpose', label: `qa:reviewfix${reviewRound}`, phase: 'Verify', schema: QA })
  qa = sweep
  phase('Review')
  review = await agent(`${CTX}\nAs Tech Lead, re-review after the requested changes. QA: ${JSON.stringify(qa)}. ` +
    `Confirm your prior feedback is fully addressed and nothing regressed. Approve or request changes.`,
    { agentType: 'general-purpose', phase: 'Review', schema: REVIEW })
  log(`Re-review ${reviewRound}: ${review?.decision}`)
}

phase('Sign-off')
const signoff = await agent(`As PM, sign off Sprint 7. overall=${qa?.overall}; functional=${JSON.stringify((qa?.functional_results ?? []).map(f => ({ a: f.area, r: f.result })))}; ` +
  `regression=${JSON.stringify((qa?.regression_parity ?? []).map(p => ({ s: p.screen, p: p.parity })))}; review=${review?.decision}. ` +
  `${hitCap ? 'NOTE: hit 3-round cap — MANUAL review. ' : ''}Accept only if functional all PASS, no true regression, review approved; ` +
  `next scope (Sprint 8 = Non-functional hardening §4: PII encryption, DPDP export/delete, WCAG audit, load test).`,
  { agentType: 'general-purpose', phase: 'Sign-off', schema: SIGNOFF })

return {
  sprint: 'dashboard-queries',
  fanout: { backend_tasks: beTasks.length, frontend_tasks: feTasks.length, task_agents_ok: built.filter(Boolean).length, task_agents_total: built.length },
  contract_gate: { passed: !!contract?.ok, fix_attempts: cRound },
  rounds_run: round - (hitCap ? 1 : 0), review_fix_rounds: reviewRound, hit_round_cap: hitCap,
  needs_manual_review: hitCap || qa?.overall !== 'PASS' || review?.decision !== 'approved',
  overall: qa?.overall,
  functional: (qa?.functional_results ?? []).map(f => ({ area: f.area, result: f.result })),
  regression: (qa?.regression_parity ?? []).map(p => ({ screen: p.screen, parity: p.parity })),
  remaining_issues: qa?.remaining_issues ?? [], review: review?.decision, signoff,
}
