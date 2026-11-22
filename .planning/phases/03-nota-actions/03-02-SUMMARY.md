---
phase: 03-nota-actions
plan: 02
subsystem: ui
tags: [hono, vanilla-js, csrf, brl-parsing, headless-chrome, vitest]

requires:
  - phase: 02-notas-panel
    provides: "/admin shell, PANEL_SCRIPTS allow-list, details dialog opened from #nota=<id>, panel-smoke harness"
provides:
  - "GET /admin/emitir (session-only issue form) and the Emitir nota / Notas header links"
  - "createApi/pageApi: status-aware fetch wrapper with session cookie and x-csrf-token, 401 to /login"
  - "form.js pure helpers: brasiliaToday, suggestId, parseBrl, buildIssueBody, validateForm, issueProblem, isAlreadyIssued, issueHints, remembered service fields"
  - "emitir.js: sale id in ?id=, submit to POST /v1/notas, hand-over to /admin#nota=<id>"
  - "panel-smoke harness: scriptedGov(), server-side POST recorder, gotoRewritten(), fill(), check emitir-issue"
affects: [03-03, 03-04, 03-05]

actuals:
  tokens: 22000
  tasks: 3
  commits: 4
plan_head_before: 4d43bba7e7ca180ef2e30c473cbf6ef7dc77651b
plan_head_after: 87c7f80cff4fe57ba24f24373fd749bccae46056

tech-stack:
  added: []
  patterns:
    - "Browser modules stay plain ES modules with a sibling .d.ts and a Node vitest file; pure helpers have no DOM"
    - "Form controls carry id=field-<key> and no name attribute, so a native submit sends nothing"
    - "Dependencies injected into createApi so tests drive it with a fake fetch"
    - "Money read from the digit string (no floating point); dates from Intl with America/Sao_Paulo"

key-files:
  created:
    - src/panel/api.js
    - src/panel/api.d.ts
    - src/panel/api.test.ts
    - src/panel/form.js
    - src/panel/form.d.ts
    - src/panel/form.test.ts
    - src/panel/emitir.js
  modified:
    - src/admin.ts
    - src/admin.test.ts
    - scripts/panel-smoke.mjs

key-decisions:
  - "Already-issued is detected from the answer (updatedAt versus Date header minus elapsedMs), never by a GET pre-check or by createdAt"
  - "Every field is addressed by id and has no name attribute; form is method=post with no action"
  - "CPF/CNPJ check digits are validated in the browser because the API only counts digits"
  - "validateForm refuses a competence after today in Brasilia (rule E0015 would reject it)"

patterns-established:
  - "Tracer slice first: page, module, CSRF POST and a headless-Chrome check, then pure helpers and unit tests"
  - "Smoke scenarios take a scriptedGov and expose the server-side list of non-GET /v1 requests"

requirements-completed: [ACT-01]

coverage:
  - id: D1
    description: "GET /admin/emitir renders the issue form behind the session guard (303 to /login without one) with the panel headers, the Emitir nota / Notas header links and one module script"
    requirement: ACT-01
    verification:
      - kind: integration
        ref: "src/admin.test.ts#renders the issue form shell to a session, with the panel headers"
        status: pass
      - kind: integration
        ref: "src/admin.test.ts#redirects /admin/emitir to /login without a session, with the panel headers"
        status: pass
    human_judgment: false
  - id: D2
    description: "The form posts one POST /v1/notas with the session cookie and x-csrf-token and no Authorization header, and lands on the nota's details dialog showing Emitida"
    requirement: ACT-01
    verification:
      - kind: automated_ui
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#emitir-issue"
        status: pass
      - kind: unit
        ref: "src/panel/api.test.ts#posts JSON with the session cookie and exactly the three headers"
        status: pass
    human_judgment: false
  - id: D3
    description: "The sale id is generated before the first submit, lives in ?id= and survives a reload, an edit and an awkward id (loja 7/venda #42?); each new visit makes another"
    requirement: ACT-01
    verification:
      - kind: automated_ui
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#emitir-issue"
        status: pass
      - kind: unit
        ref: "src/panel/form.test.ts#suggestId"
        status: pass
    human_judgment: false
  - id: D4
    description: "Money, competence day, body building, validation, 400 mapping, already-issued rule, hints and remembered service fields are pure functions tested at their edges"
    requirement: ACT-01
    verification:
      - kind: unit
        ref: "src/panel/form.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "How the form reads and looks in a real browser with Pico loaded (spacing, widths, help text, narrow screens)"
    requirement: ACT-01
    verification: []
    human_judgment: true
    rationale: "The smoke blocks the Pico CDN, so the visual result of the classless build on the new form is not asserted; assumption A3 is checked with screenshots in 03-03"

duration: 6min
completed: 2026-11-22
status: complete
---

# Phase 3 Plan 02: Issue form slice Summary

**Session-only /admin/emitir form that keeps the sale id in the URL, posts to POST /v1/notas with the session cookie and CSRF token, and hands over to the existing details dialog; with tested BRL, Brasilia-date, id, validation, error-mapping and already-issued helpers and a headless-Chrome check against a government stub that issues.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-22T19:11:02Z
- **Completed:** 2026-11-22T19:17:27Z
- **Tasks:** 3 (1 tracer, 2 TDD-style)
- **Files modified:** 10

## Accomplishments

- `/admin/emitir` behind the `/admin/*` guard with an in-handler session check; header with Notas and Emitir nota links, `aria-current="page"` on the open one; `method="post"` form without `action` and without any `name` attribute; maxlength 200/300/80/2000 so the DPS builder never cuts anything silently.
- `createApi`/`pageApi`: `request()` resolves every HTTP answer as `{ status, body, date, elapsedMs }`, only a network failure rejects, 401 redirects to `/login`; CSRF token read on every request, no credential header other than `x-csrf-token`.
- `form.js` helpers with 67 unit tests: `parseBrl` reads digit strings (no floats), `brasiliaToday` uses `Intl` with America/Sao_Paulo (boundary tests at 02:59:59Z/03:00:00Z), `suggestId` uses `getRandomValues` with rejection sampling, `validateForm` checks CPF/CNPJ check digits and competence not after today, `issueProblem` maps all ten API 400 messages, `isAlreadyIssued` implements the D-09 rule, `issueHints` covers 2xx-with-error and E0015.
- `scripts/panel-smoke.mjs`: `scriptedGov()` (issue/reject/unreached DPS steps, ok/refuse/unreached events), server-side recorder of non-GET `/v1` requests, `gotoRewritten()`, `fill()`, `todayBrasilia()`, new `issuing` scenario and the `emitir-issue` check (25 checks pass, console clean).

## Task Commits

1. **Task 1: tracer, Emitir nota form posts to /v1/notas and lands on the details** - `d0f7013` (feat)
2. **Task 2: form rules, RED** - `d3a1042` (test)
3. **Task 2: form rules, GREEN** - `38d05fb` (feat)
4. **Task 3: fetch wrapper contract and emitir route tests** - `87c7f80` (test)

**Plan metadata:** committed separately (docs: complete plan)

## TDD notes (Task 2)

- **RED:** `src/panel/form.test.ts` run with the TAP reporter: 67 tests, 38 failing, 29 passing (the Task 1 helpers). `gsd_run check tdd-red-evidence` returned `RED_EVIDENCE_OK` (`target_test_failed`) for the target "uses the documented storage key". Semantic assessment: the target executed and failed on the planned assertion (`SERVICE_DEFAULTS_KEY` undefined instead of `nfse-painel:servico`); the other 37 failures are `TypeError: <name> is not a function` for exports that did not exist yet, which is the intended reason. Evidence files were kept under the self-ignoring `.gsd/tdd-evidence/03-02/`.
- **GREEN:** all 67 tests pass after adding the six new exports to `form.js`.
- **REFACTOR:** none needed.
- Task 3 tests describe behavior the tracer already shipped, so they passed on first run (no RED possible); no gap in `api.js` or `admin.ts` was exposed.

## Files Created/Modified

- `src/admin.ts` - `panelHeader()`, `emitirPage()`, `GET /admin/emitir`, PANEL_SCRIPTS with api.js, form.js, emitir.js
- `src/admin.test.ts` - emitir route, shell, field and header-link tests; module allow-list and API_TOKEN tests extended
- `src/panel/api.js`, `api.d.ts`, `api.test.ts` - fetch wrapper, types, tests with a fake fetch
- `src/panel/form.js`, `form.d.ts`, `form.test.ts` - pure helpers, types, tests
- `src/panel/emitir.js` - the page module (id in the URL, submit, redirect to the details)
- `scripts/panel-smoke.mjs` - harness extensions and the `emitir-issue` check

## Decisions Made

- Already-issued detection uses `updatedAt` against the request start on the server clock, so a rejected nota that is resent and issued is not mistaken for an already-issued one (RESEARCH Pitfall 3). The notice itself is wired in 03-03.
- Fields have ids and no names; the page works as a no-op without the module and a native submit can never put taker data in a URL.
- `buildIssueBody` treats a taker as present when any of the four taker fields has text (trimmed), so `validateForm` and the body agree on when a taker exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Verification commands run through node_modules/.bin instead of `pnpm exec` / `pnpm run`**
- **Found during:** Task 1 (first verify)
- **Issue:** The worktree has no `node_modules`; `pnpm exec`/`pnpm run` start a dependency status check that tries to install and fails in this sandbox.
- **Fix:** Symlinked the main checkout's already-installed `node_modules` into the worktree (git-ignored, not committed, no package installed) and ran `node_modules/.bin/vitest run ...` and `node_modules/.bin/tsc --noEmit`, which are exactly what `pnpm test` and `pnpm run typecheck` execute.
- **Files modified:** none tracked
- **Verification:** full suite 372 passed / 1 skipped; `tsc --noEmit` exits 0

**2. [Rule 1 - Consistency] hasTaker uses trimmed raw text for the phone**
- **Found during:** Task 2 (GREEN)
- **Issue:** The Task 1 `buildIssueBody` decided "taker present" from the digits of the phone, so a phone like `()` would drop the taker while `validateForm` treated it as filled.
- **Fix:** Both use the trimmed raw text of the four taker fields.
- **Files modified:** src/panel/form.js
- **Committed in:** 38d05fb

---

**Total deviations:** 2 auto-fixed (1 blocking environment workaround, 1 consistency fix)
**Impact on plan:** None on scope; behavior and artifacts are as planned.

## Notes for follow-up plans

- `emitir.js` does not call `validateForm`, `issueProblem`, `isAlreadyIssued`, `issueHints` or `load/saveServiceDefaults` yet: the plan scoped those helpers as tested building blocks and left the specific 4xx/422 branches, field errors, the already-issued notice and remembered service fields to 03-03. Until then any non-2xx answer shows the generic "Não foi possível confirmar o resultado..." line.
- `gotoRewritten()` is defined in the smoke for later checks; `emitir-issue` navigates by click and reload, so it is not used yet.

## Issues Encountered

None beyond the environment note in Deviation 1.

## Known Stubs

None. The generic error line in `emitir.js` is intentional and is replaced by 03-03.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 03-03 can import `form.js` helpers and `api.js` and extend `panel-smoke.mjs` (`scriptedGov` steps, `posts`, `fill`, `gotoRewritten`).
- Element ids (`#emitir-form`, `#emitir-submit`, `#emitir-state`, `#emitir-errors`, `#field-<key>`, `#field-<key>-help`) are the stable contract.

## Self-Check: PASSED

- Files exist: src/panel/api.js, api.d.ts, api.test.ts, form.js, form.d.ts, form.test.ts, emitir.js (all FOUND)
- Commits exist and are ancestors of HEAD: d0f7013, d3a1042, 38d05fb, 87c7f80
- `vitest run` 372 passed / 1 skipped; `tsc --noEmit` exit 0; `panel-smoke.mjs` 25 passed, 0 failed (includes `ok emitir-issue`)

---
*Phase: 03-nota-actions*
*Completed: 2026-11-22*
