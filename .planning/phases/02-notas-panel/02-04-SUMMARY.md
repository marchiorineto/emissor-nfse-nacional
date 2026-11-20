---
phase: 02-notas-panel
plan: 04
subsystem: ui
tags: [hono, vanilla-js, dialog, history-api, pico-css, cdp, headless-chrome]

requires:
  - phase: 02-notas-panel (plan 01)
    provides: panel shell, format.js helpers, panel.js api()/renderRow(), smoke harness
  - phase: 02-notas-panel (plan 03)
    provides: idempotent sync() over the URL, generation guard, pdfHref/pdfFilename, row PDF links
provides:
  - "Modal <dialog id=nota-dialog> over /admin, driven by #nota=<id>: opens from the row's Número link, a copied deep link (with ?status=) or a hashchange"
  - "Details in dl sections Resumo, Tomador, Serviço, Documento, Exportação, Substituição; the government's errors verbatim in a highlighted box; pt-BR notices for pending/unknown, canceled and replaced"
  - "PDF download link in the Documento section (same relative route and filename as the row link)"
  - "Fechar, Esc, backdrop click and Back close the dialog and clear the hash with replaceState; the page behind is scroll-locked"
  - "Smoke checks dialog-deep-link, dialog-close, dialog-back, dialog-unknown, dialog-sections, dialog-errors, dialog-hostile-text, dialog-pdf, dialog-backdrop, dialog-scroll-lock, dialog-narrow, console-clean"
affects: [02-phase human check, phase 3 (retry/issue actions belong there; none are offered here)]

actuals:
  tokens: 15000
  tasks: 3
  commits: 5
plan_head_before: 36a29a743d0b215ac50fa30bfc23bb4bcc57feb5
plan_head_after: c072ee31e75592928e3cec52d08f82913ac9a031

tech-stack:
  added: []
  patterns:
    - "View-model in format.js returns plain data (sections, error boxes, a notice string); panel.js only builds elements with createElement and textContent"
    - "Anchors come only from values format.js built, and panel.js re-checks the three allowed prefixes (#nota=, /v1/notas/, https://) before creating an a"
    - "One sync() reads both ?status= and #nota=; each half acts only on a change, so popstate and hashchange firing together is harmless"
    - "dialogGeneration drops the response of a nota the admin already left"

key-files:
  created: []
  modified:
    - src/admin.ts
    - src/admin.test.ts
    - src/panel/panel.js
    - src/panel/format.js
    - src/panel/format.d.ts
    - src/panel/format.test.ts
    - scripts/panel-smoke.mjs

key-decisions:
  - "Dialog fixtures live in their own smoke scenario app (detailFixtures) so the 45-nota list fixtures and the paging checks built on them are untouched"
  - "A dialog close handler that sees the dialog open again (a quick reopen) does nothing, so a late close event cannot erase the new state"
  - "Valor na moeda is shown pt-BR with two decimals and no symbol; Compartilhar com o MDIC shows Não when absent (the API default is false); other export rows are omitted when absent"
  - "grid-template-columns uses max-content minmax(0, 1fr) (a 1fr value column that can shrink) so long keys wrap instead of widening the dialog"

patterns-established:
  - "goto() in the smoke harness leaves through about:blank when the target differs from the open document only by its hash, so every check gets a real load"

requirements-completed: [PANEL-03, PANEL-04]

coverage:
  - id: D1
    description: "Opening a nota from its row link or a deep link (#nota=<id>, with ?status= kept, also for a nota beyond the first page) shows it in a modal dialog over the list; unknown id says Nota não encontrada."
    requirement: PANEL-03
    verification:
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#dialog-deep-link"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#dialog-unknown"
        status: pass
      - kind: unit
        ref: "src/panel/format.test.ts#parseNotaHash and notaHash"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fechar, Esc, backdrop click and Back close the dialog, clear the hash without a bare # and keep the list, filter and appended rows; the page behind does not scroll"
    requirement: PANEL-03
    verification:
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#dialog-close"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#dialog-back"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#dialog-backdrop"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#dialog-scroll-lock"
        status: pass
    human_judgment: false
  - id: D3
    description: "The dialog shows the dl sections in the fixed order, Substituição links open the other nota in the still-open dialog, and absent data omits its row or section"
    requirement: PANEL-03
    verification:
      - kind: unit
        ref: "src/panel/format.test.ts#detailSections"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#dialog-sections"
        status: pass
    human_judgment: false
  - id: D4
    description: "The government's errors appear verbatim in boxes right under the header (emission first, cancellation second); API text with markup stays literal text"
    requirement: PANEL-03
    verification:
      - kind: unit
        ref: "src/panel/format.test.ts#errorBoxes"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#dialog-errors"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#dialog-hostile-text"
        status: pass
    human_judgment: false
  - id: D5
    description: "The dialog's PDF link downloads nfse-<number>.pdf; canceled and replaced notas say the document is no longer valid next to the link; pending and unknown show the unanswered notice with no PDF link and no button but Fechar"
    requirement: PANEL-04
    verification:
      - kind: unit
        ref: "src/panel/format.test.ts#statusNotice"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#dialog-pdf"
        status: pass
    human_judgment: false
  - id: D6
    description: "The dialog is readable on a phone (no sideways scroll, one-column dl) and the whole panel run records no console error"
    requirement: PANEL-03
    verification:
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#dialog-narrow"
        status: pass
      - kind: e2e
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#console-clean"
        status: pass
    human_judgment: false
  - id: D7
    description: "Pico's dialog look, readability of the sections and the feel of the history behaviour in a real browser (Chrome was checked headless with the CDN stylesheet blocked; Firefox and Safari were not)"
    requirement: PANEL-03
    verification: []
    human_judgment: true
    rationale: "The smoke run blocks Pico's stylesheet to stay offline, so colors, the dialog's real appearance and cross-browser history events need the batched human check at end of phase"

duration: 7min
completed: 2026-11-20
status: complete
---

# Phase 2 Plan 04: Nota details dialog Summary

**Hash-driven modal dialog (#nota=ID) that fetches GET /v1/notas/:id and renders dl sections, the government's errors verbatim in a highlighted box, status notices and the PDF link from a pure view-model, all built with createElement and textContent**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-11-20T22:54:12Z
- **Completed:** 2026-11-20T23:00:44Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- `/admin` shell holds `<dialog id="nota-dialog">` with `#nota-title`, `#nota-status`, `#nota-body` and a `<form method="dialog">` Fechar button; the Número text of each row is a `#nota=<id>` link.
- `sync()` now reads both `?status=` and `#nota=` and is bound to `popstate` and `hashchange`: a deep link or Substituição link opens (or switches) the dialog without reloading the list, closing clears the hash with `replaceState` and never leaves a bare `#`.
- `format.js` gained `parseNotaHash`, `notaHash`, `formatDateTime`, `httpsHref`, `detailSections`, `errorBoxes` and `statusNotice` (declared in `format.d.ts` with `DetailValue`, `DetailSection`, `ErrorBox`); `panel.js` only turns that data into elements.
- Errors are never trimmed or reworded; pending and unknown get the text-only notice with no action; canceled and replaced add the no-longer-valid line next to the PDF link; there is no XML link and no raw dump.
- `PANEL_CSS` adds the scroll lock (`html:has(dialog[open])`), the `dl` grid that collapses under 768 px, wrapped `dd`, the red `[data-errors]` box and the `[role="note"]` notice; a click on the backdrop closes the dialog.
- Smoke run: 24 checks, 0 failed (12 earlier plus 12 new). `pnpm test` 286 passed, 1 skipped; `pnpm run typecheck` clean.

## Task Commits

1. **Task 1: #nota=ID opens a modal dialog (tracer)** - `ac4e6eb` (feat)
2. **Task 2: detail view-model, errors and notices (TDD)** - `6610e1f` (test, RED), `54af3c8` (feat, GREEN view-model), `47b8f41` (feat, panel rendering and smoke checks)
3. **Task 3: styling, backdrop close, scroll lock, narrow screens** - `c072ee3` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified
- `src/admin.ts` - dialog markup in the shell and the dialog rules in `PANEL_CSS`
- `src/admin.test.ts` - shell test for the dialog markup, new `styles the nota dialog in /panel.css` test
- `src/panel/format.js` - hash, date-time, https and view-model helpers
- `src/panel/format.d.ts` - declarations and the `DetailValue`, `DetailSection`, `ErrorBox` types
- `src/panel/format.test.ts` - 26 new unit tests (56 in the file)
- `src/panel/panel.js` - row link, `openNota`, hash-aware `sync()`, close handling, rendering from the view-model, backdrop close
- `scripts/panel-smoke.mjs` - `detailFixtures` scenario app, `about:blank` hop for hash-only navigations, 12 new checks, screenshots under `PANEL_SMOKE_SHOTS`

## Decisions Made
See key-decisions. The tracer gate (re-run of the plan's three verify commands end to end, auto-mode path) passed before expansion: dialog-deep-link, dialog-close, dialog-back, dialog-unknown ok, 16 passed, 0 failed.

## TDD Gate Compliance

- **Task 2 RED:** `6610e1f` - 23 target tests failed with `TypeError: formatDateTime / httpsHref / detailSections / errorBoxes / statusNotice is not a function` (the planned functions did not exist yet; the target tests ran and failed, the 33 others passed). The `parseNotaHash`/`notaHash` cases were already green because the tracer commit implemented them. Semantic assessment: genuine RED for the missing behavior; no import, syntax, or fixture fault (typecheck passed with the declarations). GREEN: `54af3c8` (56 passed).
- No REFACTOR commit was needed. Task 1 is a `tracer` task and Task 3 an `auto` task, not `tdd="true"`.
- RED evidence was inspected from the vitest output; the `gsd_run check tdd-red-evidence` classifier was not run (no TAP capture was made), as in plan 02-03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Detail fixtures in a dedicated smoke app instead of the main app**
- **Found during:** Task 2 (smoke fixtures)
- **Issue:** The plan says to extend the main app's fixtures, but the earlier checks (more-pages, pdf-row-download, filter-url, list-renders) are built on exactly 45 notas, a createdAt tie at the page edge and a fixed issued count; adding notas there would break them, and the plan requires every earlier check to keep passing.
- **Fix:** Added `detailFixtures()` (rejected with two errors incl. the hostile message, issued with errors and cancelErrors, export plus replaces, the replaced nota pointing back, canceled, pending, unknown) served by its own `scenario()` app that shares the session cookie.
- **Files modified:** scripts/panel-smoke.mjs
- **Verification:** all 24 checks pass
- **Committed in:** `47b8f41`

**2. [Rule 3 - Blocking] goto() could hang on a hash-only navigation**
- **Found during:** Task 1 (dialog-deep-link navigates to a URL that differs from the open document only by its hash)
- **Issue:** Such a navigation is same-document, so the `window.__stale` marker never clears and `goto` times out.
- **Fix:** `goto` first leaves through `about:blank` when the target differs only by its hash.
- **Files modified:** scripts/panel-smoke.mjs
- **Committed in:** `ac4e6eb`

---

**Total deviations:** 2 auto-fixed (2 blocking, both in the smoke harness)
**Impact on plan:** No production-code change; both keep the plan's checks verifiable. No scope creep.

## Issues Encountered
- The shell guard of this environment refused a few long heredoc commands; the test and fixture text was written with the Write tool to a scratch file and appended instead. No effect on the result.
- The smoke run blocks the Pico CDN stylesheet, so it cannot judge the real Pico dialog look; screenshots were written under the scratch directory but not visually reviewed. This is the batched human check (D7).

## Known Stubs
None.

## Threat Flags
None - no new surface beyond the plan's threat model (T-02-15 to T-02-19 mitigated: createElement + textContent only with negative greps on both modules and the hostile-text unit and smoke checks; https-only lookup and a three-prefix anchor allow-list; URLSearchParams hash parsing; dialogGeneration drops stale responses; notices carry no action).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
The admin can now browse, filter, page, inspect and download every nota from /admin. The batched human check (real browser, desktop and phone width: open each kind of nota, copy a URL into a new tab, close with Fechar/Esc/outside click/Back, download the PDF, optionally run the smoke with `PANEL_SMOKE_SHOTS=DIR`) is still open for end of phase. Retry and issue actions are deliberately absent and belong to Phase 3.

## Self-Check: PASSED

Modified files exist; commits `ac4e6eb`, `6610e1f`, `54af3c8`, `47b8f41`, `c072ee3` are ancestors of HEAD; `pnpm test` (286 passed, 1 skipped), `pnpm run typecheck` and the smoke run (24 passed, 0 failed) pass; all acceptance greps pass (no innerHTML/outerHTML/insertAdjacentHTML/document.write, no JSON.stringify and no "xml" in panel.js or format.js).

---
*Phase: 02-notas-panel*
*Completed: 2026-11-20*
