---
phase: 03-nota-actions
plan: 03
subsystem: ui
tags: [vanilla-js, dom, textcontent, idempotency, headless-chrome, vitest]

requires:
  - phase: 03-nota-actions
    provides: "03-01 per-id lock; 03-02 issue form, api.js, form.js helpers, scripted-gov smoke harness"
provides:
  - "dom.js: text(), note(), errorSection() shared textContent-only builders (dialog and issue form)"
  - "emitir.js: every answer of POST /v1/notas handled on the form (422, 400, 403, 401, 5xx/lost, already issued)"
  - "format.js: notaHash(id, { cancelar, jaEmitida }), parseNotaFlags, ALREADY_ISSUED_NOTICE"
  - "panel.js: #nota=<id>&ja-emitida notice and issueHints lines in the details dialog"
  - "PANEL_CSS rules for the issue form (errors box accent, notes, field errors, fieldset spacing)"
  - "Eleven new headless-Chrome checks for the form and the dialog flag"
affects: [03-04, 03-05]

actuals:
  tokens: 17000
  tasks: 3
  commits: 4
plan_head_before: 4616a4ca7aa889ef0ea7128ac8e1792d612f8877
plan_head_after: f02326d0e40afd5d73b7c5a75b8e3d32e642ec4c

tech-stack:
  added: []
  patterns:
    - "Shared DOM builders in dom.js; every API string goes through textContent"
    - "URL hash flags (&cancelar, &ja-emitida) as literal suffixes after the URLSearchParams-encoded id"
    - "Field error = small#field-<key>-error right after the control, named first in aria-describedby, cleared on input"
    - "Already-issued recognized from the POST answer alone (no GET before submitting)"

key-files:
  created:
    - src/panel/dom.js
  modified:
    - src/panel/emitir.js
    - src/panel/panel.js
    - src/panel/format.js
    - src/panel/format.d.ts
    - src/panel/format.test.ts
    - src/admin.ts
    - src/admin.test.ts
    - scripts/panel-smoke.mjs

key-decisions:
  - "Hand-off flag is #nota=<id>&ja-emitida, text-only; a crafted link can at most show a harmless notice"
  - "issueHints lines follow the error box, on the form and in the dialog"
  - "403 shows the message plus a Recarregar button (safe: the id is in the URL)"
  - "A 200/202 body without a string status, a 400 without an error string and any status not listed fall to the 'resultado desconhecido' message, never a failure claim"

patterns-established:
  - "Smoke checks count server-side posts and government DPS before and after instead of asserting absolute numbers"

requirements-completed: [ACT-01]

coverage:
  - id: D1
    description: "A 422 keeps every field and the id, shows the government's errors verbatim (hostile detail as text) under Erros na emissão, and resending the same id issues the nota under the same DPS number"
    requirement: ACT-01
    verification:
      - kind: automated_ui
        ref: "node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs#emitir-rejected"
        status: pass
    human_judgment: false
  - id: D2
    description: "Hash flags: notaHash(id, flags), parseNotaFlags and ALREADY_ISSUED_NOTICE; the dialog shows the notice first for #nota=<id>&ja-emitida and drops it on close; a rejection that may hide an accepted nota shows the hint"
    requirement: ACT-01
    verification:
      - kind: unit
        ref: "src/panel/format.test.ts#hash flags"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#dialog-already-issued"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#dialog-rejected-hint"
        status: pass
    human_judgment: false
  - id: D3
    description: "Invalid input never reaches the API: pt-BR errors next to fields, first invalid field focused, zero POSTs"
    requirement: ACT-01
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#emitir-validation"
        status: pass
    human_judgment: false
  - id: D4
    description: "400 shows the pt-BR message next to the named field (unknown 400 in the status line); 403 shows the session message with Recarregar; network failure, 5xx and non-JSON bodies say to resend with the same id; 401 goes to /login; fields and id are kept and the button re-enabled"
    requirement: ACT-01
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#emitir-answers"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#emitir-session-expired"
        status: pass
    human_judgment: false
  - id: D5
    description: "Double click records one POST and one DPS; two simultaneous POSTs with one id (two tabs, 800 ms government) make the government receive one DPS and answer the same dpsNumber and accessKey"
    requirement: ACT-01
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#emitir-double-click"
        status: pass
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#emitir-two-tabs"
        status: pass
    human_judgment: false
  - id: D6
    description: "Resubmitting an issued id sends exactly the POST (no GET before it), lands on #nota=<id>&ja-emitida showing the stored nota and the notice, with no new DPS"
    requirement: ACT-01
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#emitir-resubmit"
        status: pass
    human_judgment: false
  - id: D7
    description: "A fresh form pre-fills only serviceCode, nbsCode and description from localStorage nfse-painel:servico; taker and value are never stored; competence input max is today in Brasília"
    requirement: ACT-01
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#emitir-defaults"
        status: pass
    human_judgment: false
  - id: D8
    description: "The form fits 375 px without sideways scroll and the errors box has the left accent (computed border-left-width)"
    requirement: ACT-01
    verification:
      - kind: automated_ui
        ref: "scripts/panel-smoke.mjs#emitir-narrow"
        status: pass
      - kind: unit
        ref: "src/admin.test.ts#styles the issue form in /panel.css"
        status: pass
    human_judgment: false
  - id: D9
    description: "How the form reads and looks with Pico loaded (wording, field order, spacing), including the screenshots emitir-wide.png and emitir-narrow.png"
    verification: []
    human_judgment: true
    rationale: "The smoke blocks the Pico CDN, so Pico's real rendering is not asserted; the plan's human-check batches this at the end of the phase"

duration: 6min
completed: 2026-11-22
status: complete
---

# Phase 3 Plan 03: Issue form answers Summary

**Every answer of POST /v1/notas now has an honest pt-BR outcome on the issue form (government rejection with fields kept and a same-id resend, field errors, stale session, lost answer, 401), a shared textContent-only DOM builder module, and a `&ja-emitida` hash flag that makes the details dialog say "Esta nota já foi emitida com este id." when the id already had an issued nota.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-22T19:21:13Z
- **Completed:** 2026-11-22T19:27:21Z
- **Tasks:** 3 (1 tracer, 1 TDD, 1 auto)
- **Files modified:** 9 (1 created)

## Accomplishments

- Tracer: a Rejeitada answer keeps the admin on `/admin/emitir` with every field and `?id=` untouched, shows `Erros na emissão` built by the same `errorSection` the dialog uses (hostile detail asserted as text, no `img`, title unchanged), and a resend with the corrected description issues the nota under the same `<nDPS>`.
- `notaHash(id, { cancelar, jaEmitida })`, `parseNotaFlags` and `ALREADY_ISSUED_NOTICE`; the dialog re-renders without refetching when only the flag changes, and closing clears flag and hash.
- The form validates before sending (`validateForm`), marks fields with `aria-invalid` and a following `small`, maps API 400 messages with `issueProblem`, handles 403/401/5xx/non-JSON/network, saves and restores only the three service fields, and hands an already-issued id over to the dialog from the POST answer alone.
- `issueHints` lines (HTTP 2xx code, E0015) appear after the error box on the form and in the dialog.
- PANEL_CSS gives the form's error box the same left accent as the dialog's, with literal fallbacks so the Pico-blocked smoke still sees a computed value.

## Task Commits

1. **Task 1 (tracer): keep a rejected nota on the form with the government's errors** - `4212862` (feat)
2. **Task 2: hash flags, RED** - `4098918` (test)
3. **Task 2: hash flags, GREEN** - `b080a5f` (feat)
4. **Task 3: every other answer of the form** - `f02326d` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## TDD Gate Compliance (Task 2)

- **RED (`4098918`):** `src/panel/format.test.ts` run with the default vitest reporter: 63 tests, 6 failing, 57 passing. Failures: `notaHash('abc', { cancelar: true })` returned `#nota=abc` (expected `#nota=abc&cancelar`), `parseNotaFlags is not a function` (four cases) and `ALREADY_ISSUED_NOTICE` undefined. Semantic assessment: the target tests executed and failed on the planned assertions for the intended reason (flag behaviour and exports that did not exist); no import, syntax or fixture fault. `gsd_run check tdd-red-evidence` was not run (no `workflow.tdd_mode` in this repo's config and no TAP capture); the vitest failure output is the RED evidence.
- **GREEN (`b080a5f`):** all 63 tests pass after `notaHash` gained the flags argument and `parseNotaFlags` / `ALREADY_ISSUED_NOTICE` were added.
- **REFACTOR:** none needed.

## Tracer gate

Task 1 is `type="tracer"` with an automated-only `<verify>`; after its commit the smoke (26 passed) and `vitest run src/admin.test.ts src/panel` (174 passed) were both green before any expansion task started.

## Files Created/Modified

- `src/panel/dom.js` - `text`, `note`, `errorSection` builders (no markup parsing, no style setting)
- `src/panel/emitir.js` - the form logic for every answer, field errors, remembered service fields
- `src/panel/panel.js` - imports from dom.js, `view.jaEmitida` / `view.current`, notice and hints in `renderNota`
- `src/panel/format.js`, `format.d.ts`, `format.test.ts` - hash flags, notice constant, declarations, tests
- `src/admin.ts` - `dom.js` in PANEL_SCRIPTS, form/error CSS
- `src/admin.test.ts` - dom.js served, dom.test.ts not served, API_TOKEN scan covers dom.js, CSS test
- `scripts/panel-smoke.mjs` - `rej2xx` fixture, request method recorded, `fieldValues` / `fieldError` / `settle` helpers and eleven checks

## Decisions Made

- A 200/202 whose body is not an object with a string `status`, a 400 without an `error` string, and any unlisted status all fall to the "Não foi possível confirmar o resultado" message: the result is unknown, never reported as a failure.
- Validation errors are shown in DOM order (not `FIELD_KEYS` order) so focus lands on the first invalid field the admin sees.
- The 422 branch builds its nodes with explicit arrow functions (`(box) => errorSection(box)`) so `Array.map`'s index argument can never leak into a builder.

## Deviations from Plan

None - plan executed exactly as written.

Smoke-only notes (not deviations): `emitir-resubmit` waits 1.3 s before the second submit because the HTTP `Date` header has one-second resolution (`isAlreadyIssued` compares `updatedAt` with `Date` minus the wait), and `v1Requests` now records the request method so the check can prove the POST was the page's first `/v1` request.

## Issues Encountered

- First smoke run of `emitir-resubmit` failed on my own regex written with doubled backslashes in a regex literal; fixed to single backslashes and re-run (36 passed, 0 failed, twice).

## Known Stubs

None.

## Threat Flags

None. T-3-11 (textContent-only builders, negative grep on dom.js, hostile detail asserted as text), T-3-12 (lost answers say resend with the same id), T-3-13 (in-flight flag, id in URL, three smoke checks) and T-3-15 (403 reload prompt) are mitigated as planned; T-3-14 remains accepted.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `notaHash(id, { cancelar: true })` and `parseNotaFlags(hash).cancelar` exist for the cancel action; panel.js does not act on the `cancelar` flag yet.
- `errorSection`, `note` and `text` in dom.js are the builders to use for any new dialog or form content.
- The human check of Task 3 (wording, field order, Pico look, `PANEL_SMOKE_SHOTS` screenshots) is batched at the end of the phase.

## Self-Check: PASSED

- Files exist: src/panel/dom.js, 03-03-SUMMARY.md (FOUND)
- Commits are ancestors of HEAD: 4212862, 4098918, b080a5f, f02326d
- `vitest run` 386 passed / 1 skipped; `tsc --noEmit` exit 0; `panel-smoke.mjs` 36 passed, 0 failed (all ok lines named in the plan present)

---
*Phase: 03-nota-actions*
*Completed: 2026-11-22*
