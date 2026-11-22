---
phase: 03-nota-actions
plan: 05
subsystem: ui
tags: [vanilla-js, dom, duplicate, retry, headless-chrome, vitest, readme]

requires:
  - phase: 03-nota-actions
    provides: "03-02 emitir.js boot and pageApi(); 03-03 notaHash/parseNotaFlags; 03-04 Ações cell, #nota-actions footer slot, patchRow with D-19 removal, view.cancelling"
provides:
  - "form.js: formatBrlInput, prefillFromNota, DROPPED_ABROAD_NOTICE, duplicateHref, retryBody, canRetry (declared in form.d.ts, unit-tested)"
  - "emitir.js: ?de=<id> boot that fetches the source once, fills the controls by value and says what it left out"
  - "panel.js: Duplicar in every row and in the dialog footer; Tentar de novo (#nota-retry) with dialogMessage and row refresh"
  - "README.md: pt-BR subsection Emitir, cancelar e duplicar"
  - "Eight new headless-Chrome checks (duplicate-row, retry-pending-replaces, retry-unanswered, retry-unknown, retry-filtered, duplicate-edges, duplicate-reload, row-actions-narrow)"
affects: []

actuals:
  tokens: 26000
  tasks: 3
  commits: 5
plan_head_before: 3c0c81a97749971df977034ffb366b5fc540e82d
plan_head_after: f060d17d8b1cce7ca8a8e4fe2d354a5cac36249f

tech-stack:
  added: []
  patterns:
    - "A duplicate is built only from prefillFromNota, which reads nothing of replaces, and submitted through buildIssueBody, which never emits replaces or export"
    - "Retry resends structuredClone(nota.request) under the same id; only replaces.accessKey is dropped, and only when replaces.id is set"
    - "The retry updates the list row from any answer that carries the nota (D-19), and the dialog only while it still shows the same nota"

key-files:
  created: []
  modified:
    - src/panel/form.js
    - src/panel/form.d.ts
    - src/panel/form.test.ts
    - src/panel/emitir.js
    - src/panel/panel.js
    - src/panel/format.js
    - scripts/panel-smoke.mjs
    - README.md

key-decisions:
  - "Retry shows the server's own error text for a 404/409 (for example a replaced nota that is no longer issued) instead of the generic lost-answer line, since that failure is definite, not unknown"
  - "src/admin.ts was not changed: the inline-block Ações links from 03-04 already fit three actions on one line at 1280 px and on a 375 px card"

requirements-completed: [ACT-03, ACT-01]

coverage:
  - id: D1
    description: "Duplicar is offered on every row and in every dialog whatever the status, linking to /admin/emitir?de=<id>; the form fetches the source once, fills client, service and value (as 1.234,56) under a new painel- id and today's competence, and submitting issues a separate nota with no replaces or export while the source stays as it was"
    requirement: ACT-03
    verification:
      - kind: unit
        ref: "src/panel/form.test.ts#prefillFromNota"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#duplicate-row"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#duplicate-edges"
        status: pass
    human_judgment: false
  - id: D2
    description: "A source with a taker abroad or export data fills the form without that part and shows the pt-BR note; an unknown source shows Nota não encontrada. with empty fields; a hostile name stays text; a reload keeps the same new id and refills the form"
    requirement: ACT-03
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#duplicate-edges"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#duplicate-reload"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tentar de novo on a Pendente or Sem resposta nota resends the stored request under the same id (minus replaces.accessKey when replaces.id is set), refreshes dialog and row for 200, 202 and 422, ignores a second click while in flight, and removes the row under a status filter"
    requirement: ACT-01
    verification:
      - kind: unit
        ref: "src/panel/form.test.ts#retryBody"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#retry-pending-replaces"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#retry-unanswered"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#retry-unknown"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#retry-filtered"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Ações cell holds PDF, Cancelar, Duplicar in that order on one line at 1280 px and without sideways scroll on a 375 px card"
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#row-actions-narrow"
        status: pass
    human_judgment: false
  - id: D5
    description: "Whether three actions per row read clearly on Pico's real styles, and whether the README subsection matches what the panel does (actions-wide.png and actions-narrow.png with PANEL_SMOKE_SHOTS)"
    verification: []
    human_judgment: true
    rationale: "The smoke blocks the Pico CDN so Pico's rendering is not asserted, and README clarity needs the operator's judgement; the plan's human-check batches this at the end of the phase"

duration: 25min
completed: 2026-11-22
status: complete
---

# Phase 3 Plan 05: Duplicar and Tentar de novo Summary

**Duplicar opens /admin/emitir?de=<id> filled from any nota (client, service, value as 1.234,56, new painel- id, today's competence, never replaces or export, with a pt-BR note when abroad or export data was left out), and Tentar de novo resends a Pendente or Sem resposta nota under the same id with its stored request minus the redundant replaces.accessKey, refreshing the dialog and the list row.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-11-22
- **Tasks:** 3 (1 tracer, 1 TDD, 1 auto)
- **Files modified:** 8 (none created)

## Accomplishments

- Tracer: `Duplicar` link in each row's Ações cell and in the dialog footer for every status. The form's `?de=` boot writes the new id into the URL first (so the address ends `?de=<id>&id=painel-...`), disables the submit button and sets `aria-busy` while one `GET /v1/notas/<encoded id>` runs, fills each control through `.value`, and puts `DROPPED_ABROAD_NOTICE` before the form when the source had a taker abroad or export data. `duplicate-row` submits a duplicate, then asserts the POST body has the new id and today's competence, neither `replaces` nor `export`, and that the source stays issued and its own replaced nota is untouched.
- Retry: `retryBody` clones the stored request and drops `replaces.accessKey` only when `replaces.id` is set (RESEARCH Pitfall 2), so the server's own parser accepts it and re-resolves the id. `retryNota` posts it once at a time, patches the row from any nota answer (D-19 removal under a filter, whatever the dialog generation), and re-renders the dialog with the outcome line for 200, 202 and 422; 400, 403, 404/409 and lost answers get pt-BR lines.
- Edge cases: abroad source (empty taker fields, NBS kept, note shown), hostile name (value verbatim, no `img`, title unchanged), canceled source (footer link), unknown source (`Nota não encontrada.`, fields empty, button enabled), reload (same `?de=...&id=...`, form refilled).
- README: a pt-BR subsection under "Painel administrativo" describing issuing, cancelling, duplicating and Tentar de novo.

## Task Commits

1. **Task 1 (tracer): Duplicar and the ?de= form** - `e5288e8` (feat)
2. **Task 2: failing tests for retryBody, canRetry and the duplicate helpers, RED** - `2ed8c47` (test)
3. **Task 2: retryBody and canRetry, GREEN** - `657451f` (feat)
4. **Task 2: Tentar de novo in panel.js, retry smoke checks** - `2c6e481` (feat)
5. **Task 3: duplicate edges, reload, row actions, README** - `f060d17` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## TDD Gate Compliance (Task 2)

- **RED (`2ed8c47`):** `vitest run src/panel/form.test.ts` with the default reporter: 82 tests, 6 failing, 76 passing. Failures: `retryBody is not a function` (five tests) and `canRetry is not a function` (one test), each on the planned call. Semantic assessment: the target tests executed and failed for the intended reason (the two helpers did not exist yet); no import, syntax or fixture fault. The `formatBrlInput`, `prefillFromNota`, `DROPPED_ABROAD_NOTICE` and `duplicateHref` cases passed at RED because Task 1 (a tracer, which the plan orders first) already shipped those helpers; the new tests pin them. `gsd_run check tdd-red-evidence` was not run (no TAP capture; same as 03-03 and 03-04), the vitest failure output is the RED evidence.
- **GREEN (`657451f`):** all 82 tests pass; `tsc --noEmit` exit 0.
- **REFACTOR:** none needed.

## Tracer gate

Task 1 is `type="tracer"` with an automated-only `<verify>`; after its commit the smoke (45 passed, including `ok duplicate-row`) and `vitest run src/admin.test.ts src/panel` (191 passed) were green before the expansion tasks started.

## Files Created/Modified

- `src/panel/form.js`, `form.d.ts`, `form.test.ts` - duplicate and retry helpers, declarations, tests
- `src/panel/emitir.js` - `?de=` boot (`loadSource`)
- `src/panel/panel.js` - Duplicar links, `#nota-retry`, `dialogMessage`, `retryNota`, `view.retrying`
- `src/panel/format.js` - `statusNotice` doc comment
- `scripts/panel-smoke.mjs` - `duplicateFixtures`, `duplicating` scenario, eight checks, scoped footer assertions
- `README.md` - "Emitir, cancelar e duplicar"

## Decisions Made

- A 404 or 409 answer to a retry shows the server's own message after "Não foi possível reenviar:" rather than the generic "result unknown" line: those statuses are definite refusals (for example the replaced nota is no longer issued), so telling the admin the result is unknown would be wrong.
- `src/admin.ts` was left alone: the row-actions check passed with the 03-04 CSS.

## Deviations from Plan

**1. [Rule 3 - Blocking] Smoke script's Chrome start timer outlived the start**
- **Found during:** Task 2 (mutation run of `retry-pending-replaces`)
- **Issue:** `setTimeout(fail, 20_000).unref()` was never cleared, so any smoke run longer than 20 s was killed with "cannot start Chrome" (exit 2). The full run had grown to 19.4 s, one slow check away from a false failure, and the mutation run (which waits 8 s for a failing check) hit it.
- **Fix:** the timer is cleared as soon as Chrome prints its DevTools URL.
- **Files modified:** scripts/panel-smoke.mjs
- **Verification:** mutated `retryBody` now fails `retry-pending-replaces` cleanly (48 passed, 1 failed) and the unmutated run passes (52 passed)
- **Committed in:** `2c6e481`

**2. [Rule 1 - Bug] Existing 03-04 smoke assertions assumed an empty footer**
- **Found during:** Task 1 (adding Duplicar to the footer)
- **Issue:** `cancel-row` asserted a pending nota's `#nota-actions` had no children and `cancel-nothing-sent` asserted no `a` in the footer while the cancel section shows; both now also see Duplicar.
- **Fix:** both narrowed to `a[href$="&cancelar"]`, which is the invariant they meant (no Cancelar).
- **Files modified:** scripts/panel-smoke.mjs
- **Committed in:** `e5288e8`

**3. [Rule 2 - Missing critical] Definite refusals of a retry (404/409) get their own message**
- **Found during:** Task 2
- **Issue:** The plan maps every non-listed status to "Não foi possível confirmar o resultado", which for a 409 (the replaced nota is no longer issued) would tell the admin the outcome is unknown when it is known.
- **Fix:** `retryProblem` shows `Não foi possível reenviar: <server message>` for 404/409 with a message.
- **Files modified:** src/panel/panel.js
- **Committed in:** `2c6e481`

---

**Total deviations:** 3 auto-fixed (1 Rule 1, 1 Rule 2, 1 Rule 3)
**Impact on plan:** No scope change; the smoke harness is more reliable and the retry messages more accurate.

## Issues Encountered

None beyond the deviations above.

## Known Stubs

None.

## Threat Flags

None. T-3-22 (prefillFromNota reads nothing of replaces, buildIssueBody never emits it; unit test and `duplicate-row` assert no `replaces` key and an untouched source), T-3-23 (same id and stored request, only the redundant accessKey removed, `parseIssueRequest` accepts all three request shapes in a unit test, `retry-unknown` proves two clicks send one POST, and a mutation of `retryBody` makes `retry-pending-replaces` fail), T-3-24 (the `de` value is only used inside `encodeURIComponent` in a same-origin GET path), T-3-25 (values set through `.value`; `duplicate-edges` asserts the hostile name verbatim with no `img` and an unchanged title) and T-3-26 (only `de` and `id` in the query; the taker comes from the authenticated GET) are mitigated as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 plans are all executed. The human checks of 03-03, 03-04 and 03-05 are batched at the end of the phase: Duplicar on Emitida, Rejeitada, Cancelada and abroad notas, reload of the duplicate form, Tentar de novo on a Pendente or Sem resposta nota, the three row actions at desktop and phone width on Pico's real styles (`PANEL_SMOKE_SHOTS=DIR` writes `actions-wide.png` and `actions-narrow.png`), and reading the README subsection.

## Self-Check: PASSED

- Files exist: all eight modified files and this SUMMARY (FOUND)
- Commits are ancestors of HEAD: e5288e8, 2ed8c47, 657451f, 2c6e481, f060d17
- `vitest run` 410 passed / 1 skipped; `tsc --noEmit` exit 0; `panel-smoke.mjs` 52 passed, 0 failed (all ok lines named in the plan present, including `ok duplicate-row`, `ok retry-pending-replaces`, `ok retry-unanswered`, `ok retry-unknown`, `ok retry-filtered`, `ok duplicate-edges`, `ok duplicate-reload`, `ok row-actions-narrow`, `ok console-clean`)

---
*Phase: 03-nota-actions*
*Completed: 2026-11-22*
