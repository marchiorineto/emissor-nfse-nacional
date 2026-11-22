---
phase: 03-nota-actions
verified: 2026-11-22T20:15:00Z
status: human_needed
score: 4/4 must-haves verified
covered_files:
  - .planning/phases/03-nota-actions/03-01-PLAN.md
  - .planning/phases/03-nota-actions/03-01-SUMMARY.md
  - .planning/phases/03-nota-actions/03-02-PLAN.md
  - .planning/phases/03-nota-actions/03-02-SUMMARY.md
  - .planning/phases/03-nota-actions/03-03-PLAN.md
  - .planning/phases/03-nota-actions/03-03-SUMMARY.md
  - .planning/phases/03-nota-actions/03-04-PLAN.md
  - .planning/phases/03-nota-actions/03-04-SUMMARY.md
  - .planning/phases/03-nota-actions/03-05-PLAN.md
  - .planning/phases/03-nota-actions/03-05-SUMMARY.md
  - README.md
  - scripts/panel-smoke.mjs
  - src/admin.ts
  - src/notas.ts
  - src/panel/api.js
  - src/panel/dom.js
  - src/panel/emitir.js
  - src/panel/form.js
  - src/panel/format.js
  - src/panel/panel.js
covered_digest: "v4:sha256:385321ebe7783a45367ef20a204d83bf2c2cdf8255ccf326a10bd24f411924c8"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Issue form under real Pico CSS: open /admin, click Emitir nota, submit empty, submit a wrong CPF, issue a valid nota, reload /admin/emitir?id=<that id> and submit again, open a fresh form. Check desktop and phone width (PANEL_SMOKE_SHOTS=DIR gives emitir-wide.png and emitir-narrow.png)."
    expected: "pt-BR errors under the right fields and nothing sent; a valid form lands on the nota details; the resubmit shows 'Esta nota ja foi emitida com este id.'; a fresh form remembers service code, NBS and description but no client data; the form fits a phone with no sideways scroll."
    why_human: "The smoke blocks the Pico CDN, so how the form controls, wording and field order look under real Pico is not asserted."
  - test: "Cancel confirm step under real Pico: click Cancelar in an Emitida row, change the reason, Voltar, reopen from the dialog, confirm; repeat with the list filtered by Emitida; view on a phone (cancel-wide.png, cancel-narrow.png)."
    expected: "The section shows number, client and value; the confirm button is clearly red and distinct from Voltar; nothing happens until it is clicked; afterwards dialog and row say Cancelada (or the row leaves a filtered list); layout fits a phone."
    why_human: "Whether the confirm step feels deliberate and the button reads as dangerous is a visual judgement on the real Pico look."
  - test: "Duplicar and Tentar de novo plus row actions: Duplicar on Emitida, Rejeitada, Cancelada and a taker-abroad nota; reload a duplicate form; submit one duplicate; Tentar de novo on a Pendente or Sem resposta nota; list at desktop and phone width (actions-wide.png, actions-narrow.png); read the new README subsection."
    expected: "Each duplicate opens filled with client, service and value, today's date and a new id (the abroad one says what was left out); reload keeps the id; the submitted duplicate is a new nota and the original is unchanged; Tentar de novo updates in place; PDF, Cancelar and Duplicar read clearly at both widths; README matches the panel."
    why_human: "Readability of three row actions on real Pico styles and the clarity of the README text need the operator's judgement."
---

# Phase 3: Nota Actions Verification Report

**Phase Goal:** A logged-in admin can issue, cancel and duplicate notas from the panel without ever causing a second nota for the same sale.
**Verified:** 2026-11-22T20:15:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin fills the issue form (id, client, service code, description, value, competence), submits to `POST /v1/notas`, sees the nota or the validation and government errors | VERIFIED | `src/admin.ts` `emitirPage` (line 392) plus `GET /admin/emitir` (line 564, session-only, 303 to /login otherwise); `src/panel/emitir.js` submit handler runs `validateForm`, then `api.request('POST','/v1/notas', buildIssueBody(fields))`. 200/202 redirects to `/admin#nota=<id>`, 422 renders `errorBoxes(nota)` verbatim, 400 maps to field errors via `issueProblem`, 403/404/409/5xx each say something honest. Smoke `emitir-issue`, `emitir-rejected`, `emitir-validation`, `emitir-answers` pass. |
| 2 | Submitting again with the same `id` (double click, reload) shows the nota already issued, no second one | VERIFIED | Server: `serialized(repo, id, ...)` in `src/notas.ts` wraps `issue` (WeakMap keyed by the shared Repo, so it holds across the per-request `createNotas` in `src/app.ts` line 50). Tests: `notas.test.ts` "concurrent calls for one id" (DPS sent once, same dpsNumber/accessKey, third call no send, different ids not serialized, a rejected call does not poison the chain) and `app.test.ts` "concurrent requests for one id". Client: `sending` flag + disabled button; id lives in `?id=` so reload keeps it. Smoke `emitir-double-click` (2 clicks, 1 POST, 1 DPS), `emitir-two-tabs` (2 concurrent fetches, 1 DPS, identical answers), `emitir-resubmit` (stored nota shown with "ja emitida" notice, 0 new DPS), `emitir-resubmit` data stays the stored R$ 1.234,56. |
| 3 | Admin cancels an issued nota by choosing the reason and confirming; nothing sent before confirmation; afterwards canceled status or government cancel errors | VERIFIED | `panel.js` `cancelSection` is built from `type="button"` elements only, never a form; the `&cancelar` hash flag only opens the section; the only POST to `/v1/notas/:id/cancel` is in `confirmCancel`, reached by the Confirmar click, after `reasonProblem` (15 to 255 chars). 200+canceled shows Cancelada, 422 shows `cancelErrors` with the draft kept, other outcomes via `cancelProblem`. Server cancel is serialized per id (`notas.test.ts` line 313: two concurrent cancels send 1 event). Smoke `cancel-nothing-sent` (0 POSTs and 0 gov events across open, Voltar, Enter, Esc, backdrop, pending nota), `cancel-answers`, `cancel-double-click`, `cancel-row`, `cancel-filtered`, `cancel-left-dialog` pass. |
| 4 | Admin duplicates a nota: opens the issue form filled with that nota's data and a new suggested `id`; submitting issues a separate nota | VERIFIED | `panel.js` row and dialog render `Duplicar` with `duplicateHref(id)` = `/admin/emitir?de=<id>` for every status; `emitir.js` `loadSource` GETs `/v1/notas/<de>` once and fills via `prefillFromNota` (service, NBS, value, CPF/CNPJ, name, email, phone; never id, competence or replaces); the form's own `suggestId()` goes into `?id=`. Abroad/export data is dropped with a visible notice (`DROPPED_ABROAD_NOTICE`). Smoke `duplicate-row` asserts the POST body has the new id, today's competence, no `replaces`/`export`, the source nota unchanged and a new Emitida nota; `duplicate-edges`, `duplicate-reload` pass. |

**Score:** 4/4 truths verified (0 present, behavior-unverified). The state-transition and concurrency invariants (truths 2 and 3) each have a named test or smoke check that exercises them.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/notas.ts` | Per-id lock around issue and cancel | VERIFIED | `locks` WeakMap<Repo, Map<id, Promise>>, `serialized()` used by `issue` and `cancel`; failures isolated, chain entries released |
| `src/admin.ts` | `/admin/emitir` page and script allow-list | VERIFIED | Route session-guarded; `PANEL_SCRIPTS` includes api.js, dom.js, form.js, emitir.js |
| `src/panel/emitir.js` | Form driver | VERIFIED | 221 lines, real submit handling, every answer class handled, `?de=` prefill |
| `src/panel/form.js` | Validation, body builder, prefill, retry helpers | VERIFIED | `buildIssueBody` never emits `replaces`/`export`; `retryBody` resends the stored request under the same id |
| `src/panel/api.js` | Cookie + CSRF fetch wrapper, no Bearer | VERIFIED | `x-csrf-token` on writes, 401 redirects to /login |
| `src/panel/panel.js` | Cancel section, Duplicar links, Tentar de novo, row patching | VERIFIED | All wired as described above |
| `scripts/panel-smoke.mjs` | Scripted-government smoke | VERIFIED | Re-run: 52 passed, 0 failed |
| `README.md` | pt-BR section on the actions | VERIFIED | Contains Duplicar and Tentar de novo text and the single-process note (grep-confirmed by plan criteria; wording is in the human list) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| emitir.js | POST /v1/notas | `api.request('POST','/v1/notas', request)` | WIRED | Session cookie + CSRF; `requireAuth` in `src/app.ts` accepts the cookie and checks CSRF on non-GET |
| panel.js confirmCancel | POST /v1/notas/:id/cancel | `api.request` | WIRED | Only call site of the cancel route |
| panel.js row/dialog | emitir.js | `duplicateHref()` -> `?de=` -> `prefillFromNota()` | WIRED | |
| panel.js retryNota | POST /v1/notas | `retryBody(nota)` same id | WIRED | Server `findIssued` check before resend for `unknown` notas |
| app.ts createNotas per request | shared repo lock | WeakMap keyed by repo | WIRED | One `repo` is passed to every `createNotas` |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Issue result dialog | nota | `GET /v1/notas/:id` after redirect, backed by repo | Yes | FLOWING |
| Duplicate form fields | `source.request` | `GET /v1/notas/<de>` | Yes (smoke asserts exact values) | FLOWING |
| Cancel outcome | `nota` in the POST answer | server `cancel()` -> gov event | Yes | FLOWING |

### Behavioral Spot-Checks (re-run by the verifier)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit and integration tests | `pnpm test` | 18 files, 410 passed, 1 skipped | PASS |
| Type check | `node_modules/.bin/tsc --noEmit` | exit 0, no output | PASS |
| Browser smoke with scripted government | `node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs` | 52 passed, 0 failed | PASS |

### Probe Execution

Step 7c: SKIPPED (no `probe-*.sh` declared or present for this phase; the smoke script is the declared runnable check and was run above).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ACT-01 | 03-01, 03-02, 03-03 (and later plans) | Issue form posting to `POST /v1/notas`, shows result or validation and government errors | SATISFIED | Truths 1 and 2 |
| ACT-02 | 03-01, 03-04 | Cancel an issued nota, choosing reason, after a confirmation step | SATISFIED | Truth 3 |
| ACT-03 | 03-05 | Duplicate opens the form filled with the nota's data and a new suggested id | SATISFIED | Truth 4 |

All three IDs appear in PLAN frontmatter and in REQUIREMENTS.md; no orphaned requirement is mapped to Phase 3. Housekeeping: the REQUIREMENTS.md checkboxes (lines 35-37) and the traceability table (lines 79-81) still read `Pending` / unchecked, and ROADMAP line 25 still shows Phase 3 unchecked. Update them when the phase is closed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | TBD/FIXME/XXX scan over phase files: no matches | - | - |

No stubs found. `return null`/empty-literal matches in the panel are initial state overwritten by fetches.

### Code review findings carried (03-REVIEW.md, all dispositions still `open`)

None is a goal blocker. They are recorded here so they are not lost.

| ID | Summary | Effect on the goal |
|----|---------|--------------------|
| WR-01 | The replacement path (`replaces.id`) reads and writes the replaced nota outside that nota's lock (race with `cancel(B)`, or two ids both replacing B) | The panel never sends `replaces` (PANEL-06 is out of scope), so the panel cannot trigger it; only a direct API client can. Same-id double issue is unaffected. Worth a follow-up before PANEL-06. |
| WR-02 | Duplicar copies description/name/email set by script, bypassing the form `maxlength`, so `buildDps` silently slices anything over 2000/300/80 chars | Confirmed real: `parseIssueRequest` does not cap those lengths, so an API-created nota can exceed them. Narrow case (unusually long text on a duplicate); no second nota results. |
| WR-03 | Fields are editable while `?de=` loads and get overwritten; submit guard relies on `disabled`, not `sending`, during the load | Cosmetic and robustness; the id is stable, so no second nota can result. |
| IN-01..03 | Blank `?de=`, shadowed `state` name, redundant session check | None. |

### Human Verification Required

#### 1. Issue form under real Pico CSS

**Test:** see frontmatter item 1.
**Expected:** see frontmatter item 1.
**Why human:** the smoke blocks the Pico CDN; wording, field order and appearance are not asserted.

#### 2. Cancel confirm step under real Pico CSS

**Test:** see frontmatter item 2.
**Expected:** see frontmatter item 2.
**Why human:** whether the confirm step feels deliberate and the red button reads as dangerous is a visual call.

#### 3. Duplicar, Tentar de novo, row actions and README

**Test:** see frontmatter item 3.
**Expected:** see frontmatter item 3.
**Why human:** readability of three row actions at both widths and the README text.

### Gaps Summary

No gaps. All four ROADMAP success criteria and all three requirement IDs are backed by code that exists, is wired, and is exercised by passing tests (410 unit/integration, 52 browser smoke checks, clean tsc), all re-run by the verifier. The never-a-second-nota guarantee holds at three levels: a server-side per-id lock shared across requests (`src/notas.ts`), client-side id stability (id in the URL, `sending` flag, retries under the same id), and duplicates that never carry `replaces`. The status is `human_needed` only because the visual checks under real Pico CSS were deferred by the executors and cannot be verified programmatically.

---

_Verified: 2026-11-22T20:15:00Z_
_Verifier: Claude (gsd-verifier)_
