---
phase: 02-notas-panel
plan: 03
subsystem: ui
tags: [hono, vanilla-js, history-api, pagination, cdp, headless-chrome]

requires:
  - phase: 02-notas-panel (plan 01)
    provides: panel shell, format.js helpers (listQuery, STATUS_ORDER, statusLabel, numberCell), panel.js api()/renderRow(), smoke harness
  - phase: 02-notas-panel (plan 02)
    provides: GET /v1/notas before+beforeId cursor, GET /v1/notas/:id/pdf?download=1 attachment
provides:
  - "Situação filter (select) kept in the URL: /admin?status=<s>, pushState, Back and reload keep it"
  - "Carregar mais: appends the next page under the same filter with the before+beforeId cursor, hidden at the end"
  - "Row PDF link: relative same-origin download named nfse-<number>.pdf, only for notas with an access key"
  - "Smoke checks filter-url, filter-invalid, session-expired, more-pages, more-exact-page, filter-empty, pdf-row-download"
affects: [02-04 details dialog (binds sync() to hashchange, reuses pdfHref/pdfFilename)]

actuals:
  tokens: 7500
  tasks: 3
  commits: 5
plan_head_before: cfeb16f9db617b8915153df8100bfcbf12087c2e
plan_head_after: 563d97424f64b9e51880a42266f8ec575a91702f

tech-stack:
  added: []
  patterns:
    - "URL is the source of truth: sync() reads parseStatus(location.search), idempotent, called by change, popstate and module load"
    - "Generation counter: every first-page load bumps view.generation; a response of an older generation is dropped (no append of an old filter's page)"
    - "Server-rendered select options imported from the browser module (format.js has no DOM access, so Node can import it)"
    - "Download check over CDP: Browser.setDownloadBehavior with eventsEnabled + Target.setDiscoverTargets, assert suggestedFilename and no new target"

key-files:
  created: []
  modified:
    - src/admin.ts
    - src/admin.test.ts
    - src/panel/format.js
    - src/panel/format.d.ts
    - src/panel/format.test.ts
    - src/panel/panel.js
    - scripts/panel-smoke.mjs

key-decisions:
  - "pdfHref never reads the API's links object: the link is the relative /v1/notas/<encoded id>/pdf?download=1 so the download attribute works (same-origin only)"
  - "Last page: hide Carregar mais when a page has fewer than 20; with exactly 20 left one extra click returns an empty page and hides it without a message (no limit=21 probe)"
  - "Smoke fixtures: ids n<200-index> so the id-descending tie-break matches index order, and indexes 26+ are all issued so the issued filter spans two pages (24 notas)"

patterns-established:
  - "Append loads keep the current generation; only first-page loads bump it"

requirements-completed: [PANEL-02, PANEL-04]

coverage:
  - id: D1
    description: "Status filter via select and /admin?status=: only that status is listed, the select shows it, change pushes the URL and reloads from the first page, Back and reload keep it, unknown or malformed values behave as Todas"
    requirement: PANEL-02
    verification:
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#filter-url"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#filter-invalid"
        status: pass
      - kind: unit
        ref: "src/panel/format.test.ts#parseStatus"
        status: pass
      - kind: unit
        ref: "src/admin.test.ts#renders the notas shell"
        status: pass
    human_judgment: false
  - id: D2
    description: "Carregar mais appends the next page under the current filter with before+beforeId, every nota exactly once across a createdAt tie, hidden at the end, safe on an exact full page and on an empty filter"
    requirement: PANEL-02
    verification:
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#more-pages"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#more-exact-page"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#filter-empty"
        status: pass
      - kind: unit
        ref: "src/panel/format.test.ts#hasMore"
        status: pass
    human_judgment: false
  - id: D3
    description: "An expired session (401 from /v1) while browsing sends the browser to /login"
    requirement: PANEL-02
    verification:
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#session-expired"
        status: pass
    human_judgment: false
  - id: D4
    description: "Each row of a nota with an access key has a PDF link that downloads nfse-<number>.pdf without leaving /admin or opening a tab; rows without an access key have none"
    requirement: PANEL-04
    verification:
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#pdf-row-download"
        status: pass
      - kind: unit
        ref: "src/panel/format.test.ts#pdfHref"
        status: pass
    human_judgment: false
  - id: D5
    description: "Filter, Back, reload, Carregar mais and the PDF download in the user's own browsers (Chrome was checked headless; Firefox and Safari were not)"
    requirement: PANEL-04
    verification: []
    human_judgment: true
    rationale: "Real download handling and history behaviour across browsers is not asserted by headless Chrome (RESEARCH A7); the plan batches this human check at end of phase"

duration: 9min
completed: 2026-11-20
status: complete
---

# Phase 2 Plan 03: Filter, paging and row PDF links Summary

**URL-driven Situação filter with history.pushState, a generation-guarded Carregar mais over the before+beforeId cursor, and same-origin row PDF links that download as nfse-NUMBER.pdf, all verified in headless Chrome**

## Performance

- **Duration:** about 9 min
- **Started:** 2026-11-20T22:48:20Z
- **Completed:** 2026-11-20T22:53Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- `/admin` renders `<label for="status">Situação</label>` and a `<select id="status">` (Todas, then the six statuses) on the server, with labels imported from `format.js`, plus a hidden `Carregar mais` button.
- `panel.js` keeps the filter in the URL: `sync()` reads `?status=`, `change` pushes the URL and syncs, `popstate` syncs, an unknown or malformed status is Todas. Stale responses are dropped by a generation counter.
- `loadPage({ append })` appends the next 20 under the same filter with `before` + `beforeId`, disables the button while loading, hides it as soon as a page has fewer than 20, shows `Nenhuma nota encontrada.` only for an empty first page, and keeps the rows with a retry message when an append fails.
- Each row of a nota with an access key has `<a href="/v1/notas/<id>/pdf?download=1" download="nfse-<number>.pdf">`; nothing else is offered (no XML, no signed public links).
- Seven new smoke checks plus the five from plan 01 all pass (12 passed, 0 failed).

## Task Commits

1. **Task 1: Filter the list by status through the URL (tracer)** - `c0a6d22` (feat)
2. **Task 2: Carregar mais (TDD)** - `1fc7243` (test, RED), `928eef0` (feat, GREEN)
3. **Task 3: PDF link in each row (TDD)** - `c7b3df0` (test, RED), `563d974` (feat, GREEN)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified
- `src/admin.ts` - status select, label and Carregar mais button in the shell; imports STATUS_ORDER/statusLabel from `format.js`
- `src/admin.test.ts` - shell test: label, option list in order, button markup
- `src/panel/format.js` - parseStatus, statusSearch, hasMore, pdfHref, pdfFilename
- `src/panel/format.d.ts` - declarations of the five helpers
- `src/panel/format.test.ts` - unit tests of the helpers (30 tests in the file)
- `src/panel/panel.js` - view state, sync(), loadPage({ append }), generation guard, PDF cell
- `scripts/panel-smoke.mjs` - 45-nota fixtures with a createdAt tie, exact-page scenario app, download/target recording, seven new checks

## Decisions Made
See key-decisions. The tracer gate (re-run of the plan's smoke verify end to end, auto-mode path) passed before expansion: 8 ok lines, 0 failed.

## TDD Gate Compliance

- **Task 2 RED:** `1fc7243` - target test `hasMore > is true only for a full page` failed with `TypeError: hasMore is not a function` (the planned function does not exist yet; the target test ran and failed, 24 others passed). The parseStatus/statusSearch/listQuery cases were green already because the tracer commit implemented those helpers. Semantic assessment: genuine RED for the missing behavior, no import, syntax or fixture fault. GREEN: `928eef0`.
- **Task 3 RED:** `c7b3df0` - five target tests (`pdfHref` x4, `pdfFilename`) failed with `TypeError: pdfHref/pdfFilename is not a function`; semantic assessment: same, helpers absent. GREEN: `563d974`.
- Task 1 is a `tracer` task (not `tdd="true"`): helpers and shell test landed in one commit. No REFACTOR commits were needed.
- RED evidence was inspected from the vitest output; the `gsd_run check tdd-red-evidence` classifier was not run (no TAP capture was made).

## Deviations from Plan

None - plan executed exactly as written. Notes: the smoke fixtures were reshaped to meet the plan's own requirements (45 notas, a createdAt tie at the 20th/21st position, and enough issued notas for the issued filter to page); ids became `n<200-index>` so the id-descending tie-break keeps index order. The plan's "Total <=1 PDF cell" behaviours needed no change to existing checks.

## Issues Encountered
None. Not covered by an automated check: a response arriving after a filter change being ignored is implemented (generation counter) and reviewed, but the smoke harness has no slow-response injection.

## Known Stubs
None.

## Threat Flags
None - no new surface beyond the plan's threat model (T-02-11..T-02-14 mitigated: allow-list in parseStatus, relative pdfHref, generation guard, 401 to /login).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Plan 02-04 can bind `sync()` to `hashchange` and reuse `pdfHref`/`pdfFilename` for the dialog's PDF link. The batched human check (real browsers: filter, Back, reload, Carregar mais, PDF download) is still open for end of phase.

## Self-Check: PASSED

Modified files exist; commits `c0a6d22`, `1fc7243`, `928eef0`, `c7b3df0`, `563d974` are ancestors of HEAD; `pnpm test` (259 passed, 1 skipped), `pnpm run typecheck` and the smoke run (12 passed, 0 failed) pass; all acceptance greps pass.

---
*Phase: 02-notas-panel*
*Completed: 2026-11-20*
