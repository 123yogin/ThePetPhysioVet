export const meta = {
  name: 'sdlc-sprint',
  description: 'Run one SDLC sprint for Pet Physio Vet with the agent team: PM plans, Tech Lead designs, Backend + Frontend build in parallel, QA verifies, Tech Lead reviews, PM signs off.',
  whenToUse: 'When the user wants the team to plan and execute a sprint or advance the roadmap. Pass args: { phase, stories? }.',
  phases: [
    { title: 'Plan' },
    { title: 'Design' },
    { title: 'Build' },
    { title: 'Test' },
    { title: 'Review' },
    { title: 'Sign-off' },
  ],
}

// ---- structured output schemas ----
const STORIES = {
  type: 'object',
  required: ['stories'],
  properties: {
    stories: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'acceptance_criteria', 'priority'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          as_a: { type: 'string' },
          i_want: { type: 'string' },
          so_that: { type: 'string' },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          srs_refs: { type: 'array', items: { type: 'string' } },
          plan_phase: { type: 'string' },
          priority: { type: 'string' },
          estimate: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const DESIGN = {
  type: 'object',
  required: ['story_id', 'owning_service', 'backend_tasks', 'frontend_tasks'],
  properties: {
    story_id: { type: 'string' },
    owning_service: { type: 'string' },
    data_model: { type: 'string' },
    api_contract: { type: 'string' },
    events: { type: 'string' },
    authz: { type: 'string' },
    backend_tasks: { type: 'array', items: { type: 'string' } },
    frontend_tasks: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const BUILD = {
  type: 'object',
  required: ['summary', 'files_changed', 'acs_covered'],
  properties: {
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    acs_covered: { type: 'array', items: { type: 'string' } },
    tests_added: { type: 'array', items: { type: 'string' } },
    test_output: { type: 'string' },
    flags: { type: 'array', items: { type: 'string' } },
  },
}

const QA = {
  type: 'object',
  required: ['story_id', 'verdict', 'ac_results'],
  properties: {
    story_id: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    ac_results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['ac', 'result'],
        properties: {
          ac: { type: 'string' },
          result: { type: 'string', enum: ['PASS', 'FAIL'] },
          evidence: { type: 'string' },
        },
      },
    },
    defects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string' },
          location: { type: 'string' },
          scenario: { type: 'string' },
          fix: { type: 'string' },
          blocking: { type: 'boolean' },
        },
      },
    },
  },
}

const REVIEW = {
  type: 'object',
  required: ['decision'],
  properties: {
    decision: { type: 'string', enum: ['approved', 'changes_requested'] },
    feedback: { type: 'array', items: { type: 'string' } },
  },
}

const SIGNOFF = {
  type: 'object',
  required: ['decisions', 'next_scope'],
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          story_id: { type: 'string' },
          decision: { type: 'string', enum: ['accepted', 'rejected'] },
          reason: { type: 'string' },
        },
      },
    },
    next_scope: { type: 'string' },
  },
}

// ---- the sprint ----
const targetPhase = args?.phase ?? 'Phase 0'
const seedStories = args?.stories ? JSON.stringify(args.stories) : 'derive them yourself'

// 1. PLAN
phase('Plan')
log(`Planning sprint for: ${targetPhase}`)
const plan = await agent(
  `Read CLAUDE.md and PRODUCT_PLAN.md. Plan the sprint for "${targetPhase}". ` +
  `Candidate stories: ${seedStories}. Produce prioritized user stories with ` +
  `acceptance criteria traced to SRS AC-xx.`,
  { agentType: 'product-manager', phase: 'Plan', schema: STORIES },
)
const stories = (plan?.stories ?? []).filter(s => (s.priority || 'P2') !== 'P3')
log(`${stories.length} stories planned`)

// 2–5. Each story flows independently: Design → Build (be‖fe) → QA → Review
const results = await pipeline(
  stories,
  // Design
  (s) => agent(
    `Design story ${s.id}: ${s.title}. ACs: ${JSON.stringify(s.acceptance_criteria)}. ` +
    `Produce the technical design and split into backend and frontend tasks.`,
    { agentType: 'tech-lead', label: `design:${s.id}`, phase: 'Design', schema: DESIGN },
  ),
  // Build (backend ‖ frontend), then QA, then Review — QA/Review need both builds
  async (design, s) => {
    if (!design) return null
    const [be, fe] = await parallel([
      () => agent(
        `Implement the BACKEND tasks for story ${s.id}: ${JSON.stringify(design.backend_tasks)}. ` +
        `Design context: ${JSON.stringify(design)}. Write code + tests, run them, report results.`,
        { agentType: 'backend-engineer', label: `build-be:${s.id}`, phase: 'Build', schema: BUILD, isolation: 'worktree' },
      ),
      () => agent(
        `Implement the WEB FRONTEND tasks for story ${s.id}: ${JSON.stringify(design.frontend_tasks)}. ` +
        `Design context: ${JSON.stringify(design)}. Build React screens + tests, run them, report results.`,
        { agentType: 'frontend-engineer', label: `build-fe:${s.id}`, phase: 'Build', schema: BUILD, isolation: 'worktree' },
      ),
    ])
    // QA
    const qa = await agent(
      `QA story ${s.id}. ACs: ${JSON.stringify(s.acceptance_criteria)}. ` +
      `Backend work: ${JSON.stringify(be)}. Frontend work: ${JSON.stringify(fe)}. ` +
      `Verify every AC with evidence, run suites, do a security review, return defects.`,
      { agentType: 'qa-security-engineer', label: `qa:${s.id}`, phase: 'Test', schema: QA },
    )
    // Review
    const review = await agent(
      `Review the integrated work for story ${s.id}. Backend: ${JSON.stringify(be)}. ` +
      `Frontend: ${JSON.stringify(fe)}. QA verdict: ${JSON.stringify(qa)}. ` +
      `Approve or request changes with file-anchored feedback.`,
      { agentType: 'tech-lead', label: `review:${s.id}`, phase: 'Review', schema: REVIEW },
    )
    return { story: s, design, be, fe, qa, review }
  },
)

const done = results.filter(Boolean)

// 6. SIGN-OFF
phase('Sign-off')
const signoff = await agent(
  `Sprint results for "${targetPhase}": ${JSON.stringify(done.map(r => ({
    id: r.story.id, qa: r.qa?.verdict, review: r.review?.decision,
  })))}. Accept or reject each story against its ACs and state the next sprint scope.`,
  { agentType: 'product-manager', phase: 'Sign-off', schema: SIGNOFF },
)

return {
  phase: targetPhase,
  stories_planned: stories.length,
  results: done.map(r => ({
    id: r.story.id,
    title: r.story.title,
    qa: r.qa?.verdict,
    review: r.review?.decision,
    blocking_defects: (r.qa?.defects ?? []).filter(d => d.blocking).length,
  })),
  signoff,
}
