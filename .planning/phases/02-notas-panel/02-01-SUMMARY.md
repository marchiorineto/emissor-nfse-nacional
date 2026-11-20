---
phase: 02-notas-panel
plan: 01
subsystem: ui
tags: [hono, csp, es-modules, pt-BR, intl, headless-chrome, cdp, vitest]

requires:
  - phase: 01-admin-session
    provides: "/admin session guard, pageHeaders, PANEL_CSS at /panel.css, GET /v1/notas behind requireAuth with the nfse_admin cookie"
provides:
  - "PAGE_CSP with connect-src 'self' (the only change to the Phase 1 policy)"
  - "PANEL_SCRIPTS and GET /admin/panel.js, GET /admin/format.js behind the /admin/* guard"
  - "/admin shell: noscript line, h2 Notas, #notas-state status line, six-column table over #notas-body, one module script"
  - "src/panel/format.js column helpers (typed by format.d.ts) and src/panel/panel.js list renderer"
  - "PANEL_CSS list rules: status emphasis, muted DPS and detail line, labelled cards under 768 px"
  - "scripts/panel-smoke.mjs headless-Chrome harness that plans 02-03 and 02-04 extend"
affects: [02-02, 02-03, 02-04, notas-panel]

actuals:
  tokens: 10500
  tasks: 3
  commits: 3

plan_head_before: af9362c14d351b68bcd052abac3982e4f31d1fa1
plan_head_after: 85186e4a45873e3a069e66e6e4e676e3bdd9faa8

tech-stack:
  added: []
  patterns:
    - "Browser modules are plain ES files in src/panel/, read once at startup into an exported ReadonlyMap and served from an explicit allow-list behind the session guard"
    - "API strings reach the DOM only through createElement + textContent; styling only through data-* attributes and /panel.css"
    - "Headless Chrome over CDP with Node's global WebSocket, CDN blocked for deterministic offline runs"

key-files:
  created:
    - src/panel/panel.js
    - src/panel/format.js
    - src/panel/format.d.ts
    - src/panel/format.test.ts
    - scripts/panel-smoke.mjs
  modified:
    - src/admin.ts
    - src/admin.test.ts

key-decisions:
  - "Alert emphasis selectors are scoped to td descendants (#notas-body td [data-status=...]) so only the status label is bold and red, not the whole row"
  - "The left accent uses var(--pico-del-color, currentColor): a custom property that cannot resolve makes box-shadow and border-left invalid, so the accent now survives Pico being unreachable"
  - "goto() in the smoke marks the old document (window.__stale) so a same-URL reload is not mistaken for the finished navigation"

patterns-established:
  - "scenario(): serve a real createApp app on 127.0.0.1:0 sharing one password hash, so one session cookie works across scenario ports"
  - "check(name, fn): prints exactly 'ok <name>' or 'FAIL <name>: <reason>'"

requirements-completed: [PANEL-01]

coverage:
  - id: D1
    description: "/admin lists the newest 20 notas from one GET /v1/notas?limit=20 request that carries only the session cookie, with no CSP violation or script error"
    requirement: PANEL-01
    verification:
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#list-renders"
        status: pass
      - kind: unit
        ref: "src/admin.test.ts#serves the panel modules to a session as text/javascript with the panel headers, and 303 to /login without one"
        status: pass
    human_judgment: false
  - id: D2
    description: "Columns format correctly: competence dd/mm/aaaa without day shift, Brasília day boundary, integer-cents BRL, CPF/CNPJ, taker abroad, NFS-e vs muted DPS, six pt-BR statuses, list query"
    requirement: PANEL-01
    verification:
      - kind: unit
        ref: "src/panel/format.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "PAGE_CSP differs from Phase 1 only by connect-src 'self'; API_TOKEN never appears in /admin, /admin/panel.js or /admin/format.js; the shell has no class or style attribute and exactly one module script on /admin only"
    requirement: PANEL-01
    verification:
      - kind: unit
        ref: "src/admin.test.ts#pins Pico 2.1.1 classless with an SRI hash and keeps the page CSP"
        status: pass
      - kind: unit
        ref: "src/admin.test.ts#never exposes API_TOKEN and refuses a session signed with it"
        status: pass
    human_judgment: false
  - id: D4
    description: "Rejeitada and Sem resposta are bold with a left accent; phone widths show labelled stacked cards with no sideways scroll; empty and failure states read in pt-BR"
    requirement: PANEL-01
    verification:
      - kind: e2e
        ref: "scripts/panel-smoke.mjs#list-status-emphasis, list-cards-narrow, list-empty, list-error"
        status: pass
    human_judgment: true
    rationale: "Pico's colors and the 'easy to spot at a glance' judgement only render with the CDN stylesheet in a real browser; the smoke run blocks the CDN on purpose (Task 3 human-check, batched at end of phase)"

duration: 14min
completed: 2026-11-20
status: complete
---

# Phase 2 Plan 1: Notas List Slice Summary

**Server-rendered /admin shell plus same-origin ES modules that fetch GET /v1/notas?limit=20 with the session cookie and render pt-BR rows (competence, client, BRL value, NFS-e/DPS number, status emphasis, stacked cards on phones), proven end to end in headless Chrome over CDP**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-20T22:38:00Z (approx.)
- **Completed:** 2026-11-20T22:46:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- The CSP structural risk is closed: `connect-src 'self'` is the only directive added, so the panel's `fetch` to `/v1` works and nothing else loosens (no `unsafe-inline`, no new origin).
- `/admin/panel.js` and `/admin/format.js` are served from an explicit allow-list after the `/admin/*` guard (303 to `/login` without a session, 404 for any other name), with `text/javascript; charset=utf-8`, no-store, CSP, no-referrer and nosniff.
- `panel.js` renders every row with `createElement` + `textContent` only; a taker named `<img src=x onerror=...>` shows as literal text and no `img` exists in the table.
- Pure column helpers in `format.js` with 20 unit tests (Brasília 03:00Z boundary, no-Date competence split, integer-cents BRL with U+00A0, CPF/CNPJ, taker abroad, NFS-e vs DPS, six statuses, list query).
- `scripts/panel-smoke.mjs` drives headless Chrome with no new dependency and prints `ok` for list-renders, list-status-emphasis, list-cards-narrow, list-empty and list-error (5 passed, 0 failed).

## Task Commits

1. **Task 1: End-to-end list tracer** - `5c08d3e` (feat)
2. **Task 2: Column helpers locked by unit tests** - `40ca0e8` (test)
3. **Task 3: Status emphasis, cards, states** - `85186e4` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Tracer feedback gate

After Task 1 the tracer's `<verify>` (vitest admin.test.ts, typecheck, panel-smoke list-renders) passed end to end; no `<human-check>` on the tracer and `human_verify_mode` default, so expansion continued (log: "Tracer verified end-to-end - expanding").

## TDD Gate Compliance

Task 2 was `tdd="true"`, but its RED gate could not be honored: the Task 1 tracer had to ship the complete `format.js` for `panel.js` to render, so the new `format.test.ts` passed on its first run (unexpected GREEN, investigated: the feature exists by plan design, not because the test is wrong). Instead of a manufactured failure, the tests were checked for sensitivity by mutation (timezone changed to UTC made the two Brasília tests fail; reverted). Git log therefore has `test(02-01)` without a preceding failing run, and no `feat(02-01)` commit after it for this task. Treat Task 2 as test-after on an already-implemented helper module. The plan itself ("where one fails, fix format.js") anticipated this ordering.

## Files Created/Modified

- `src/admin.ts` - PAGE_CSP + connect-src, PANEL_SCRIPTS and routes, list shell, PANEL_CSS list rules (status emphasis, cards)
- `src/admin.test.ts` - CSP string, script tag, script routes, shell, API_TOKEN on modules, CSS tests
- `src/panel/panel.js` - browser module: cookie-only fetch, row rendering, loading/empty/error states, aria-busy
- `src/panel/format.js` - pure column helpers and `listQuery`
- `src/panel/format.d.ts` - types and `NotaView` (avoids TS7016)
- `src/panel/format.test.ts` - unit tests of every helper
- `scripts/panel-smoke.mjs` - headless-Chrome end-to-end harness (not in `pnpm test`/CI/Docker)

## Decisions Made

- Emphasis selectors target `#notas-body td [data-status=...]` rather than any descendant of the body, so the `tr` itself is not colored or bolded; the smoke check asserts weights on the labels inside cells and a left accent on the first cell of a rejected row.
- `var(--pico-del-color, currentColor)` for the accent (see key-decisions).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Smoke app needs a full issuer environment**
- **Found during:** Task 1 (first smoke run)
- **Issue:** `GET /v1/notas` answered 500 "fix the settings in .env" because the plan's `envFrom` list lacked `ISSUER_CITY_CODE` and the Simples settings.
- **Fix:** Added `ISSUER_CITY_CODE`, `ISSUER_SIMPLES_OPTION`, `ISSUER_SIMPLES_APURATION`, `ISSUER_SIMPLES_TOTAL_TAX_PERCENT` (same values as `src/admin.test.ts`).
- **Files modified:** scripts/panel-smoke.mjs
- **Committed in:** 5c08d3e

**2. [Rule 1 - Bug] Left accent vanished without Pico**
- **Found during:** Task 3 (list-status-emphasis)
- **Issue:** with the CDN stylesheet unreachable `--pico-del-color` is undefined, which made the `box-shadow` (and the card `border-left`) invalid, so the accent computed to `none`.
- **Fix:** `var(--pico-del-color, currentColor)` fallback on both declarations (also makes the accent robust if jsDelivr is down).
- **Files modified:** src/admin.ts
- **Committed in:** 85186e4

**3. [Rule 3 - Blocking] Same-URL reload race in the smoke harness**
- **Found during:** Task 3 (design of list-cards-narrow reload)
- **Issue:** after `Page.navigate` to the current URL the old, already-complete document satisfies the load wait.
- **Fix:** `goto()` sets `window.__stale` on the old document and waits for a document without it.
- **Files modified:** scripts/panel-smoke.mjs
- **Committed in:** 85186e4

**Interpretive choice (not a bug):** the plan's list-status-emphasis wording ("every element with data-status rejected or unknown inside #notas-body") would also match the `tr`; with the td-scoped CSS that follows the must-have ("`<strong data-status>` with weight 600") the check is scoped to `td` descendants.

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking), plus the TDD ordering note above
**Impact on plan:** None on scope; all fixes were needed for the checks to run or to hold without the CDN.

## Issues Encountered

None beyond the deviations.

## Known Stubs

- `src/panel/panel.js` (`tr.append(cell('PDF'))`): the PDF cell is intentionally empty and hidden in card mode; plan 02-03 fills it. Not a goal blocker for PANEL-01.

## Threat Flags

None. The new routes and fetch are exactly the plan's threat register (T-02-01 to T-02-05), each mitigated and tested; no package was installed (T-02-SC).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 02-03 and 02-04 can extend `scripts/panel-smoke.mjs` (`scenario`, `check`, `goto`, `viewport`, `shot` helpers) and fill the PDF cell and pagination in `panel.js`; `listQuery` already emits `before` and `beforeId`, which plan 02-02 must make the API accept.
- Human check (Pico colors, look at 375 px and desktop) is batched at the end of the phase. Screenshots: `PANEL_SMOKE_SHOTS=<dir> node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs`.

## Self-Check: PASSED

- Files present: src/panel/panel.js, src/panel/format.js, src/panel/format.d.ts, src/panel/format.test.ts, scripts/panel-smoke.mjs, src/admin.ts, src/admin.test.ts
- Commits present on HEAD: 5c08d3e, 40ca0e8, 85186e4
- `pnpm test` (222 passed, 1 skipped), `pnpm run typecheck` and the smoke run (5 passed, 0 failed) all green at HEAD 85186e4

---
*Phase: 02-notas-panel*
*Completed: 2026-11-20*
