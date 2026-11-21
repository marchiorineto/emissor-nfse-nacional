---
phase: 02-notas-panel
verified: 2026-11-20T23:30:00Z
status: passed
score: 4/4 must-haves verified
covered_files:
  - .planning/phases/02-notas-panel/02-01-PLAN.md
  - .planning/phases/02-notas-panel/02-01-SUMMARY.md
  - .planning/phases/02-notas-panel/02-02-PLAN.md
  - .planning/phases/02-notas-panel/02-02-SUMMARY.md
  - .planning/phases/02-notas-panel/02-03-PLAN.md
  - .planning/phases/02-notas-panel/02-03-SUMMARY.md
  - .planning/phases/02-notas-panel/02-04-PLAN.md
  - .planning/phases/02-notas-panel/02-04-SUMMARY.md
  - scripts/panel-smoke.mjs
  - src/admin.ts
  - src/app.ts
  - src/notas.ts
  - src/panel/format.d.ts
  - src/panel/format.js
  - src/panel/panel.js
  - src/repo.ts
covered_digest: "v4:sha256:ddaa5c11f6183f44db32a757f6ca496972bd37a985f30be01a2323d39dbfa252"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Open /admin in a real desktop browser and a 375 px window with the Pico CDN reachable, with notas in several states (Rejeitada with government errors, Emitida, Cancelada, Pendente or Sem resposta)"
    expected: "Ledger-like table on desktop; Rejeitada and Sem resposta bold, red, with a left accent; bordered cards on the phone with no sideways scroll; the dialog sits over the list with the red Erros na emissão box, notices, and readable sections"
    why_human: "Pico colors and overall look only render with the CDN stylesheet (the smoke blocks it); legibility and emphasis at a glance are judgements"
  - test: "In the operator's own browser: change the Situação filter, press Back, reload, click Carregar mais, click an Emitida row's PDF link, open a nota from its number, copy its URL into a new tab, close with Fechar / Esc / outside click / Back"
    expected: "URL carries ?status=; list follows Back and reload; paging appends under the filter; the PDF saves as nfse-NUMBER.pdf with no new tab; the copied URL reopens the same nota; Back after closing the dialog feels acceptable (see IN-03 in 02-REVIEW.md: it takes two presses today)"
    why_human: "Real download handling and history behaviour in Firefox/Safari and the operator's Chrome profile; the smoke ran headless Chrome only"
---

# Phase 2: Notas Panel Verification Report

**Phase Goal:** A logged-in admin can browse the notas and inspect and download any of them from `/admin`.
**Verified:** 2026-11-20T23:30:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria, plus plan must-haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/admin` lists notas newest first with date, client, value, DPS/NFS-e number and status, loaded from `GET /v1/notas` through the session cookie, `API_TOKEN` never reaching the browser | VERIFIED | `src/panel/panel.js` `api()` uses `fetch(path, {credentials:'same-origin'})` with no credential header; `renderRow` builds all six columns from `format.js` helpers (`listDate`, `takerCell`, `formatBrl`, `numberCell`, `statusLabel`); `grep -i api_token src/admin.ts src/panel/*.js` is empty; the repo orders `created_at DESC, id DESC`; smoke checks `list-renders`, `list-status-emphasis`, `list-cards-narrow`, `list-empty`, `list-error`, `console-clean` pass |
| 2 | Admin can filter by status and load the next page; the filter stays applied while more notas load | VERIFIED | `parseStatus`/`statusSearch` plus `history.pushState` in `panel.js`; `listQuery` sends `status`, `before` and `beforeId` together; `view.generation` discards stale pages; `repo.list` uses `(created_at, id) < (?, ?)` in SQLite and a byte-compared memory twin; smoke `filter-url`, `filter-invalid`, `more-pages` (45 notas with a createdAt tie at the page boundary), `more-exact-page`, `filter-empty`, `session-expired` pass; repo and session tests cover the tie, `beforeId` without `before`, and a hostile `beforeId` |
| 3 | Admin can open a nota and see all its details, including the government's errors when rejected | VERIFIED | `#nota=ID` hash drives `<dialog id="nota-dialog">` (`openNota`, `renderNota`); `detailSections` yields Resumo, Tomador, Serviço, Documento, Exportação, Substituição in fixed order; `errorBoxes` passes `errors` and `cancelErrors` through verbatim; all text via `textContent`, links limited to `#nota=`, `/v1/notas/`, `https://`; smoke `dialog-deep-link`, `dialog-sections`, `dialog-errors`, `dialog-hostile-text`, `dialog-unknown`, `dialog-close`, `dialog-back`, `dialog-backdrop`, `dialog-narrow` pass; `format.test.ts` covers per-status view-model |
| 4 | For an issued nota the admin can download the PDF from the panel | VERIFIED | `pdfHref` returns the relative `/v1/notas/<id>/pdf?download=1` only with an `accessKey`; `src/app.ts` answers `attachment; filename="nfse-<number>.pdf"` (digits, letters and hyphen only) and keeps the inline default for Bearer clients; no `/xml` route exists under `/v1/notas/:id` and neither panel module mentions xml; smoke `pdf-row-download` and `dialog-pdf` pass using `Browser.downloadWillBegin`; `appSession.test.ts` covers download bytes and headers, a 404 without an accessKey, a non-Latin-1 id, concurrent requests, the 401 without credentials, and the XML route returning 404 |

**Score:** 4/4 truths verified (0 present, behavior-unverified). Behavior-dependent invariants (stale-response guard, paging without skip or repeat, hash and history sync, dialog close cleanup) each have a passing named test or smoke check.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/admin.ts` | `PAGE_CSP` with `connect-src 'self'`, `PANEL_SCRIPTS` routes, shell with filter, table, Carregar mais and dialog, panel CSS | VERIFIED | CSP line 191, `PANEL_SCRIPTS` allow-list (`panel.js`, `format.js`) served after the `/admin/*` session guard, shell and dialog markup present |
| `src/panel/panel.js` | Browser module, list, paging, dialog | VERIFIED | 267 lines, GET-only, wired from the shell's `<script type="module">` |
| `src/panel/format.js` | Pure helpers | VERIFIED | 224 lines; every helper the plans name is exported and used by `panel.js` or `admin.ts` |
| `src/panel/format.d.ts` | Types | VERIFIED | `NotaView`, `DetailSection`, `pdfHref` declared; `pnpm run typecheck` is clean |
| `src/repo.ts`, `src/notas.ts` | `beforeId` cursor and id tiebreak | VERIFIED | `ORDER BY created_at DESC, id DESC`; `beforeId?: string` in `Repo.list` |
| `src/app.ts` | `beforeId` passthrough, `listLimit` clamp, `?download=1` | VERIFIED | `listLimit` maps absent, empty, 0, negative and NaN to 50 and caps at 100 |
| `scripts/panel-smoke.mjs` | Headless-Chrome check | VERIFIED | 24 of 24 checks pass when I ran it |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `admin.ts` | `panel.js`, `format.js` | `PANEL_SCRIPTS` (`readFileSync`) and `GET /admin/<name>.js` | WIRED |
| `panel.js` | `format.js` | `from './format.js'` | WIRED |
| `panel.js` | `app.ts` | `listQuery(...)` to `GET /v1/notas`, `/v1/notas/<id>`, `pdfHref(...)` to `/pdf?download=1` | WIRED |
| `app.ts` | `repo.ts` | `notas().list({status, limit, before, beforeId})` | WIRED |
| `admin.ts` | `format.js` | `STATUS_ORDER` and `statusLabel` render the select server-side | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| list rows | `notas` | `GET /v1/notas` to `notas().list` to SQLite `notas` table | Yes | FLOWING |
| dialog | `nota` | `GET /v1/notas/:id` to `repo.get` | Yes | FLOWING |
| PDF link | `accessKey`, `id` | the same nota objects; the route returns the stored or generated PDF | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit and route tests | `pnpm test` | 286 passed, 1 skipped | PASS |
| Types | `pnpm run typecheck` | clean | PASS |
| End-to-end in headless Chrome | `node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs` | 24 passed, 0 failed | PASS |

### Probe Execution

SKIPPED. The phase declares no `probe-*.sh`, and none exists under `scripts/`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PANEL-01 | 02-01 | List newest first with date, client, value, number, status from `GET /v1/notas` | SATISFIED | Truth 1 |
| PANEL-02 | 02-02, 02-03 | Filter by status, load next page | SATISFIED | Truth 2 |
| PANEL-03 | 02-04 | Open a nota and see all details including the government's errors | SATISFIED | Truth 3 |
| PANEL-04 | 02-02, 02-03, 02-04 | Download the PDF of an issued nota (XML dropped on 2026-11-20) | SATISFIED | Truth 4 |

No orphaned requirements: the REQUIREMENTS.md traceability table maps exactly PANEL-01 to PANEL-04 to Phase 2, and all four appear in plan frontmatter. The Pending checkboxes and traceability rows in REQUIREMENTS.md and ROADMAP.md have not been ticked yet. That is bookkeeping for the orchestrator.

### Prohibitions (must_haves.prohibitions)

| Prohibition | Tier | Status |
|-------------|------|--------|
| Nota unreachable from the list across pages (tied createdAt) | test | VERIFIED: repo and session tests plus smoke `more-pages` |
| XML route under `/v1/notas/:id`, or a changed inline default for Bearer clients | test | VERIFIED: the route is absent (404 test), inline default unchanged |
| XML download or raw dump in the panel | test | VERIFIED: no "xml" in `panel.js` or `format.js` |
| PDF link built from the signed public links | test | VERIFIED: `pdfHref` is relative and same-origin only |
| Fiscal-state change from the panel | test | VERIFIED: `panel.js` has no `method`, POST, PUT or DELETE |
| Hiding, paraphrasing or truncating government errors | test | VERIFIED: `errorBoxes` passes the arrays through and the dialog renders code, message and detail |
| PDF of a Cancelada or Substituída nota presented as valid | test | VERIFIED: `statusNotice` text sits with the Documento section |
| Suggesting re-issue or a retry for a Pendente or Sem resposta nota | judgment | UNVERIFIED by tooling. A text-only notice and no button exist in code, but this tier needs a human glance (covered by the human-verification items) |

### Anti-Patterns Found

None blocking. There are no TBD, FIXME, XXX, TODO or HACK markers in the phase's files. The open code-review findings (disposition `open`, none critical) are non-blocking:

| Finding | Severity | Impact |
|---------|----------|--------|
| WR-01 smoke script kill-timer is never cleared | Warning | Dev tooling only; a run longer than 20 s may be mis-reported as a Chrome start failure. It passed here |
| WR-02 status list kept in three places | Warning | Future-drift risk, no current defect |
| IN-01 unused `csrf-token` meta | Info | Groundwork for Phase 3 |
| IN-02 duplicate CNPJ formatter | Info | Cosmetic |
| IN-03 Back needs two presses after closing the dialog | Info | UX nit; included in the human check |
| IN-04 `before` and `beforeId` are not validated | Info | Bound parameters, so no injection; a malformed value returns an odd page rather than a 400 |

### Human Verification Required

#### 1. Visual and responsive look with the Pico CDN

**Test:** Open `/admin` in a real browser with the CDN reachable, at desktop width and 375 px, with notas in several states. Open one of each kind in the dialog.
**Expected:** Ledger-like table; Rejeitada and Sem resposta bold and red with a left accent; cards on the phone with no sideways scroll; a readable dialog with the red errors box.
**Why human:** The smoke blocks the CDN, so Pico colors and the overall look are not exercised; "easy to spot at a glance" is a judgement. The plans deferred this check to end of phase.

#### 2. History, download and deep-link behaviour in the operator's browser

**Test:** Change the filter, press Back, reload, click Carregar mais, click a row's PDF link, open a nota, copy its URL into a new tab, and close the dialog by every route.
**Expected:** Filter, paging, download and deep link behave as in the plan; the PDF saves as `nfse-NUMBER.pdf` with no new tab.
**Why human:** The automated evidence is headless Chrome only (RESEARCH A7: Firefox and Safari unchecked); IN-03's double-Back is a feel judgement.

### Gaps Summary

No gaps. Every ROADMAP success criterion and every plan must-have is backed by code I read, a named test, and a passing headless-Chrome check. All four requirement IDs are accounted for and none are orphaned. The status is `human_needed` rather than `passed` only because the plans deliberately deferred a visual and real-browser check that automation cannot cover.

---

_Verified: 2026-11-20T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
