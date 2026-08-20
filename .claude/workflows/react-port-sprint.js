export const meta = {
  name: 'react-port-sprint',
  description: 'Sprint 1: exact React port of the current Django doctor screens (reuse vet.css verbatim), add backend JSON endpoints, verify pixel parity with Playwright screenshot diffs. Backend and Frontend build in parallel on disjoint paths, then QA parity, Tech Lead review, PM sign-off.',
  phases: [
    { title: 'Plan' },
    { title: 'Design' },
    { title: 'Build' },
    { title: 'Parity' },
    { title: 'Review' },
    { title: 'Sign-off' },
  ],
}

const STORIES = {
  type: 'object', required: ['stories'],
  properties: { stories: { type: 'array', items: { type: 'object',
    required: ['id', 'title', 'acceptance_criteria'],
    properties: {
      id: { type: 'string' }, title: { type: 'string' },
      screen: { type: 'string' },
      acceptance_criteria: { type: 'array', items: { type: 'string' } },
      srs_refs: { type: 'array', items: { type: 'string' } },
      priority: { type: 'string' },
    } } } },
}

const DESIGN = {
  type: 'object', required: ['react_structure', 'screens', 'endpoints'],
  properties: {
    react_structure: { type: 'string' },
    screens: { type: 'array', items: { type: 'string' } },
    endpoints: { type: 'array', items: { type: 'string' } },
    css_strategy: { type: 'string' },
    parity_approach: { type: 'string' },
    notes: { type: 'string' },
  },
}

const BUILD = {
  type: 'object', required: ['summary', 'files_changed'],
  properties: {
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    commands_run: { type: 'array', items: { type: 'string' } },
    build_output: { type: 'string' },
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
        screenshot_paths: { type: 'array', items: { type: 'string' } },
      } } },
    defects: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string' }, location: { type: 'string' },
      scenario: { type: 'string' }, blocking: { type: 'boolean' },
    } } },
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

const CTX = 'Read CLAUDE.md, docs/UI_PARITY.md, backend/appointments/static/vet.css, and ' +
  'backend/appointments/templates/vet/*.html first. Also read your role file under .claude/agents/ ' +
  '(product-manager.md / tech-lead.md / backend-engineer.md / frontend-engineer.md / ' +
  'qa-security-engineer.md) and follow it. This is the ThePetPhysioVet doctor web app. ' +
  'GOAL: a React SPA that looks PIXEL-IDENTICAL to the current Django pages by reusing ' +
  'vet.css verbatim and mirroring template markup/classes. React app lives in frontend/.'

// 1. PLAN
phase('Plan')
log('Sprint 1: exact React port of current doctor screens')
const plan = await agent(
  `${CTX}\nAs PM, write one user story per screen to port (login, signup, dashboard, ` +
  `appointments, create, reschedule, patients, pet_form, plus the app shell/nav). Each ` +
  `story's acceptance criteria MUST include "renders pixel-identical to the Django page ` +
  `(Playwright screenshot diff passes)". Trace to SRS §3.1/§3.2/§3.3/§3.6 where relevant.`,
  { agentType: 'general-purpose', phase: 'Plan', schema: STORIES },
)
const screens = (plan?.stories ?? []).map(s => s.screen || s.title)
log(`${plan?.stories?.length ?? 0} screen stories planned`)

// 2. DESIGN
phase('Design')
const design = await agent(
  `${CTX}\nAs Tech Lead, design the sprint: (a) the React app structure under frontend/ ` +
  `(Vite + TypeScript + React Router + React Query), how vet.css is imported globally and ` +
  `reused verbatim, and the app shell mirroring app_base.html; (b) the list of Django JSON ` +
  `endpoints (add Django REST Framework) the screens will consume — auth (login/logout/me), ` +
  `dashboard stats, appointments list/create/reschedule, pets list/create; (c) the Playwright ` +
  `parity approach. Stories: ${JSON.stringify(plan?.stories ?? [])}.`,
  { agentType: 'general-purpose', phase: 'Design', schema: DESIGN },
)

// 3. BUILD — backend ‖ frontend on DISJOINT paths (no worktree needed). Neither commits.
phase('Build')
const [backend, frontend] = await parallel([
  () => agent(
    `${CTX}\nAs Backend Engineer, implement ONLY under backend/appointments/ and backend/petphysio/ (do NOT ` +
    `touch clients/). Add Django REST Framework to requirements + settings, and JSON API ` +
    `endpoints at /api/v1 for: auth (login returns JWT or session, logout, current user), ` +
    `dashboard stats, appointments (list/create/reschedule/complete), pets (list/create). ` +
    `Keep existing template views working. Reuse ./.venv/bin/python for manage.py. Write ` +
    `tests and RUN them (paste output). Run migrations if models change. DO NOT run git ` +
    `commit/push. Design: ${JSON.stringify(design)}.`,
    { agentType: 'general-purpose', label: 'build:backend', phase: 'Build', schema: BUILD },
  ),
  () => agent(
    `${CTX}\nAs Frontend Engineer, create the React app ONLY under frontend/ (do NOT touch ` +
    `backend/appointments/ or backend/petphysio/). Steps: scaffold Vite + React + TypeScript; COPY ` +
    `backend/appointments/static/vet.css into the app and import it once globally (verbatim — do not ` +
    `edit styles); build the app shell mirroring app_base.html and every screen (login, signup, ` +
    `dashboard, appointments, create, reschedule, patients, pet_form) as React components whose ` +
    `JSX mirrors each template's DOM and CSS class names EXACTLY so vet.css applies unchanged. ` +
    `Render with representative mock data matching each template's sample content (real API ` +
    `wiring comes later). Run "npm install" and "npm run build" and confirm it compiles (paste ` +
    `output). DO NOT run git commit/push. Design: ${JSON.stringify(design)}.`,
    { agentType: 'general-purpose', label: 'build:frontend', phase: 'Build', schema: BUILD },
  ),
])

// 4. PARITY — QA runs Playwright screenshot diffs React vs live Django
phase('Parity')
const qa = await agent(
  `${CTX}\nAs QA/Security Engineer, verify PIXEL PARITY. Playwright (chromium) is installed ` +
  `globally; if you write a node script use NODE_PATH="$(npm root -g)" to import playwright, ` +
  `or "npm i -D playwright" inside frontend. Steps: (1) start Django: ` +
  `"./.venv/bin/python manage.py runserver 8000" in background; seed a test doctor user via ` +
  `manage.py shell so authenticated pages render. (2) build+preview the React app ` +
  `("npm run build" then "npm run preview" in frontend) or run its dev server. (3) For each ` +
  `screen, screenshot the Django page and the matching React page at the SAME viewport ` +
  `(1280x800) and compare; report per-screen parity PASS/FAIL with a short diff summary and ` +
  `save screenshots under frontend/parity-shots/. (4) Also sanity-check the backend JSON ` +
  `endpoints respond. Frontend result: ${JSON.stringify(frontend)}. Backend result: ` +
  `${JSON.stringify(backend)}.`,
  { agentType: 'general-purpose', phase: 'Parity', schema: QA },
)

// 5. REVIEW
phase('Review')
const review = await agent(
  `${CTX}\nAs Tech Lead, review the integrated work. Backend: ${JSON.stringify(backend)}. ` +
  `Frontend: ${JSON.stringify(frontend)}. QA parity: ${JSON.stringify(qa)}. Check: vet.css ` +
  `reused verbatim (not re-derived), markup mirrors templates, endpoints sane, no secrets, ` +
  `no cross-area edits. Approve or request changes with specifics.`,
  { agentType: 'general-purpose', phase: 'Review', schema: REVIEW },
)

// 6. SIGN-OFF
phase('Sign-off')
const signoff = await agent(
  `As PM, sign off Sprint 1. Screens planned: ${JSON.stringify(screens)}. QA parity overall: ` +
  `${qa?.overall}. Review: ${review?.decision}. Accept or reject and state the next sprint scope.`,
  { agentType: 'general-purpose', phase: 'Sign-off', schema: SIGNOFF },
)

return {
  sprint: 'react-port',
  screens_planned: screens,
  parity_overall: qa?.overall,
  parity_by_screen: (qa?.screen_results ?? []).map(r => ({ screen: r.screen, parity: r.parity })),
  frontend_compiles: frontend?.compiles,
  backend_summary: backend?.summary,
  review: review?.decision,
  signoff,
}
