---
phase: 03-nota-actions
plan: 04
subsystem: ui
tags: [vanilla-js, dom, dialog, csrf, headless-chrome, vitest]

requires:
  - phase: 03-nota-actions
    provides: "03-01 per-id cancel lock; 03-02 api.js pageApi() and the scripted-gov smoke harness; 03-03 notaHash(id, { cancelar }) / parseNotaFlags and dom.js builders"
provides:
  - "format.js: CANCEL_REASONS, cancelSuggestion, canCancel, reasonProblem, cancelProblem (declared in format.d.ts, unit-tested)"
  - "panel.js: row and footer Cancelar links (#nota=<id>&cancelar), cancel section, Confirmar/Voltar handlers, patchRow with D-19 removal, backdrop press guard"
  - "admin.ts: Ações column, #nota-actions footer slot, danger button / footer / cancel section / Ações CSS"
  - "Eight new headless-Chrome checks for the cancel flow"
affects: [03-05]

actuals:
  tokens: 21000
  tasks: 3
  commits: 5
plan_head_before: ae5336f6c8f9d44138d2b9ad76854cdaa9c5e1ce
plan_head_after: 2d5bf649a3a6fbe791f59bdb2082e56bb22c5c9a

tech-stack:
  added: []
  patterns:
    - "The cancel UI is built from type=button controls (no form element), so no implicit submission exists; the confirm click handler is the only sender"
    - "Row updates find the tr by comparing dataset.id, never through a selector built from the id"
    - "The dialog generation counter retires only the dialog render; the list row is patched from any answer that carries the nota"
    - "In-flight cancels tracked per id in view.cancelling (a Set); the draft (code and text) lives in view.cancelDraft and survives re-renders of the same nota"

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
  - "view.cancelling is a Set of ids rather than a boolean, so a late answer for one nota never re-enables or blocks another nota's confirm"
  - "The footer Cancelar link keeps the &ja-emitida flag when it is set, so opening the section does not drop the already-issued notice"
  - "The Ações links are inline-block with a 0.75rem end margin instead of a flex td, so the table cell keeps its table layout on desktop"

patterns-established:
  - "Smoke checks assert zero POSTs (server-side recording) and zero gov events across every path that must not send"

requirements-completed: [ACT-02]

coverage:
  - id: D1
    description: "Cancelar appears only for an Emitida nota with an access key, in the row's Ações cell and the dialog footer; both open #nota=<id>&cancelar with the reason section showing; a pending nota shows no section or link"
    requirement: ACT-02
    verification:
      - kind: unit
        ref: "src/panel/format.test.ts#canCancel"
        status: pass
      - kind: automated_ui
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#cancel-row"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#cancel-nothing-sent"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reason code select (2 first) and textarea pre-filled with the suggestion; a code change swaps only an untouched suggestion; a reason outside 15 to 255 characters is stopped in the browser with the pt-BR message"
    requirement: ACT-02
    verification:
      - kind: unit
        ref: "src/panel/format.test.ts#reasonProblem"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#cancel-nothing-sent"
        status: pass
    human_judgment: false
  - id: D3
    description: "Nothing is sent before Confirmar cancelamento: opening the section, choosing, typing, Enter, Voltar, Esc, Fechar and a backdrop click record zero POSTs and zero government events; a double click on confirm sends exactly one"
    requirement: ACT-02
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#cancel-nothing-sent"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#cancel-double-click"
        status: pass
    human_judgment: false
  - id: D4
    description: "A 200 re-renders the dialog as Cancelada and patches the row in place (a row added by Carregar mais included); 422 keeps the section open with the typed reason and the Erros no cancelamento box (hostile detail as text); 502, 409, 403 and a lost answer show their pt-BR messages with the section kept"
    requirement: ACT-02
    verification:
      - kind: unit
        ref: "src/panel/format.test.ts#cancelProblem"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#cancel-row"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#cancel-answers"
        status: pass
    human_judgment: false
  - id: D5
    description: "Under a status filter the canceled row leaves the list (others and the cursor stay); a cancel that finishes after the dialog was closed still updates the row"
    requirement: ACT-02
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#cancel-filtered"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#cancel-left-dialog"
        status: pass
    human_judgment: false
  - id: D6
    description: "A text selection dragged out of the reason field onto the backdrop never closes the dialog; a plain backdrop click still does"
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#cancel-backdrop-drag"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#dialog-backdrop"
        status: pass
    human_judgment: false
  - id: D7
    description: "The confirm button has its own non-transparent background different from Voltar and the cancel UI fits 375 px without sideways scroll (computed styles, Pico blocked)"
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#cancel-style"
        status: pass
      - kind: unit
        ref: "src/admin.test.ts#styles the cancel action in /panel.css"
        status: pass
    human_judgment: false
  - id: D8
    description: "Whether the confirm step feels deliberate and the button reads as dangerous on the real Pico look, desktop and phone (cancel-wide.png and cancel-narrow.png with PANEL_SMOKE_SHOTS)"
    verification: []
    human_judgment: true
    rationale: "The smoke blocks the Pico CDN, so Pico's real rendering is not asserted; the plan's human-check batches this at the end of the phase"

duration: 20min
completed: 2026-11-22
status: complete
---

# Phase 3 Plan 04: Cancel an Emitida nota Summary

**The admin cancels an Emitida nota from a list row or the details dialog by choosing a reason (1, 2 or 9, text validated to 15-255 characters) and clicking a red Confirmar cancelamento; nothing is sent before that click, the row is patched in place (or dropped under a status filter), and every government or transport outcome has an honest pt-BR message.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-11-22
- **Tasks:** 3 (1 tracer, 1 TDD, 1 auto)
- **Files modified:** 7 (none created)

## Accomplishments

- Tracer: `Cancelar` link in each Emitida row's new Ações cell (and in the dialog footer) opens `#nota=<id>&cancelar`; the section shows the nota's number, client and value, a code select (2 first), a textarea with the code's suggestion, a danger-styled `Confirmar cancelamento` and `Voltar`. A 200 turns both dialog and row into Cancelada, rows added by Carregar mais included. `panel.js` now reads `/v1` only through `pageApi()`.
- Reason checks and answers: `reasonProblem` stops a reason outside 15 to 255 characters (after trimming) in the browser; `cancelProblem` maps 502, 409 (naming the status, e.g. Substituída), 404, 400, 403, lost answers and others to pt-BR; a 422 keeps the section open with the typed reason and shows `Erros no cancelamento` (hostile detail asserted as text). The draft survives every non-success answer.
- Never sent early: smoke `cancel-nothing-sent` records zero POSTs and zero government events across footer/row/deep-link opening, code changes, typing, Enter, Voltar, Esc, Fechar and a pending-nota deep link with the flag; `cancel-double-click` records exactly one POST and one event.
- D-19 and late answers: under `?status=issued` the canceled row leaves the list (others and the Carregar mais cursor stay); a cancel confirmed and then Fechar'd at once still shows Cancelada on the row.
- Pitfall 7: the dialog closes on the backdrop only when press and release both land there. Confirmed with a mutation run: removing the guard makes `cancel-backdrop-drag` fail (research assumption A1 holds: the drag produces a click on the dialog).
- CSS: red confirm button with literal fallback, footer/`#nota-actions` flex rows, `#cancel-form` block, Ações link spacing.

## Task Commits

1. **Task 1 (tracer): cancel from row or dialog after a confirmation** - `d248808` (feat)
2. **Task 2: cancel helpers, RED** - `b5e2fb1` (test)
3. **Task 2: reasonProblem / cancelProblem + declarations, GREEN** - `b136502` (feat)
4. **Task 2: reason validation and answer handling in panel.js, smoke checks** - `8074ba4` (feat)
5. **Task 3: D-19 removal, backdrop guard, cancel CSS, smoke checks** - `2d5bf64` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## TDD Gate Compliance (Task 2)

- **RED (`b5e2fb1`):** `vitest run src/panel/format.test.ts` with the default reporter: 71 tests, 5 failing, 66 passing. Failures: `reasonProblem is not a function` (two tests) and `cancelProblem is not a function` (three tests). Semantic assessment: the target tests executed and failed on the planned calls for the intended reason (the helpers did not exist yet); no import, syntax or fixture fault. The `CANCEL_REASONS`, `cancelSuggestion` and `canCancel` cases passed at RED because Task 1 (a tracer, written before the TDD task as the plan orders it) already shipped those three helpers; the new tests pin them. `gsd_run check tdd-red-evidence` was not run (no TAP capture; same as 03-03), the vitest failure output is the RED evidence.
- **GREEN (`b136502`):** all 71 tests pass; `tsc --noEmit` exit 0.
- **REFACTOR:** none needed.

## Tracer gate

Task 1 is `type="tracer"` with an automated-only `<verify>`; after its commit the smoke (37 passed) and `vitest run src/admin.test.ts src/panel` (182 passed) were green before the expansion tasks started.

## Files Created/Modified

- `src/admin.ts` - Ações column header, `#nota-actions` slot, danger/footer/cancel/Ações CSS
- `src/admin.test.ts` - shell test (nota-actions next to Fechar, Ações header), `styles the cancel action in /panel.css`
- `src/panel/panel.js` - `pageApi()`, Ações cell with Cancelar link, cancel section, confirm/back handlers, drafts, `patchRow`, backdrop guard
- `src/panel/format.js`, `format.d.ts`, `format.test.ts` - cancel helpers, declarations, tests
- `scripts/panel-smoke.mjs` - `canceling` scenario, scoped Fechar selectors, eight checks

## Decisions Made

- `view.cancelling` is a Set of ids (not a boolean): a late answer for one nota cannot block or re-enable another nota's confirm; the `finally` re-enables the live button only when it still belongs to that id.
- The footer Cancelar link preserves `&ja-emitida` when set, so the already-issued notice is not dropped by opening the section.
- A 200 whose body is not a `canceled` nota, and any 200/other status without a mapped message, fall to "Não foi possível cancelar agora" rather than ever showing Cancelada.

## Deviations from Plan

**1. [Rule 1 - Bug] Ações links laid out with inline-block and a margin instead of a flex td**
- **Found during:** Task 3 (CSS)
- **Issue:** The plan asks for `td[data-label="Ações"]` as a wrapping flex row with a 0.75rem gap. `display: flex` on a `td` takes it out of table-cell layout (borders, padding and row alignment break on desktop).
- **Fix:** `#notas-body td[data-label="Ações"] a { display: inline-block; margin-inline-end: 0.75rem }`; links still wrap and keep the 0.75rem spacing, the cell stays a table cell (and a block with the mobile card rules).
- **Files modified:** src/admin.ts, src/admin.test.ts
- **Committed in:** `2d5bf64`

**2. [Rule 1 - Bug] Smoke assertion for the late answer corrected**
- **Found during:** Task 3 (`cancel-left-dialog`)
- **Issue:** My first assertion required `#nota-body` to be empty after Fechar; the dialog never clears its body on close (pre-existing, openNota clears it on the next open), so the check failed on correct behavior.
- **Fix:** assert the closed dialog's status is not Cancelada and the hash stays empty, which is the real invariant (a late answer does not draw into a closed dialog).
- **Files modified:** scripts/panel-smoke.mjs
- **Committed in:** `2d5bf64`

---

**Total deviations:** 2 auto-fixed (2 Rule 1)
**Impact on plan:** No scope change; both keep the plan's stated behavior.

Smoke-only note: all `#nota-dialog form button` Fechar selectors (four, not two) were scoped to `#nota-dialog footer form button` for consistency.

## Issues Encountered

None beyond the deviations above.

## Known Stubs

None.

## Threat Flags

None. T-3-16 (the confirm click is the only sender; no form element; zero-POST smoke across every other path), T-3-17 (Cancelada only from a 200 canceled body; per-status pt-BR messages), T-3-18 (errorSection textContent-only; hostile detail asserted as text), T-3-19 (api.request sends x-csrf-token, asserted on the recorded POST; 403 message), T-3-20 (reasonProblem, textarea maxlength 255) and T-3-21 (disabled button, per-id in-flight guard, one POST / one event) are mitigated as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `renderRow` builds the Ações cell and `patchRow` replaces a row by id; 03-05's Duplicar can append its link to that cell, and the footer `#nota-actions` slot is a flex row ready for a second action.
- The human check of Task 3 (red button, confirm step feel, phone layout, `PANEL_SMOKE_SHOTS` screenshots) is batched at the end of the phase.

## Self-Check: PASSED

- Files exist: all seven modified files and this SUMMARY (FOUND)
- Commits are ancestors of HEAD: d248808, b5e2fb1, b136502, 8074ba4, 2d5bf64
- `vitest run` 395 passed / 1 skipped; `tsc --noEmit` exit 0; `panel-smoke.mjs` 44 passed, 0 failed (all ok lines named in the plan present)

---
*Phase: 03-nota-actions*
*Completed: 2026-11-22*
