---
phase: "3"
slug: "nota-actions"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-22"
---

# Phase 3 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser panel → `/v1/notas` (issue, cancel, retry) | Same-origin fetch with the session cookie and `x-csrf-token`; no API token in the browser | Sale data, taker personal data (CPF/CNPJ, name, contact), fiscal values, cancel reason |
| Concurrent requests → `src/notas.ts` | Two requests (tabs, devices, reloads) for the same sale id inside one server process | Fiscal integrity: one DPS / one cancel event per id |
| Server → government (Sefin Nacional) | Signed DPS and cancel events; answers may be lost or slow (30 s timeout) | Signed fiscal documents |
| Stored nota data → DOM | Government error texts, hints and stored taker values rendered in the form and the dialog | Untrusted text (stored XSS surface) |
| URL / hash / localStorage | `?id=`, `?de=`, `#nota=…&ja-emitida&cancelar`, remembered service fields | Ids and flags only; three non-personal service fields |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-3-01 | Tampering (fiscal integrity) | `src/notas.ts` issue(): concurrent same-id requests | high | mitigate | `serialized(repo, request.id, …)` around issue (`src/notas.ts:246`); route + service tests assert one `sendDps` | closed |
| T-3-02 | Tampering | `src/notas.ts` cancel(): concurrent same-id cancels | medium | mitigate | `serialized(repo, id, …)` around cancel (`src/notas.ts:265`); test asserts one `sendEvent` | closed |
| T-3-03 | Denial of service | per-id chain held by a slow government call | low | accept | Only same-id calls wait; gov adapter `TIMEOUT_MS = 30_000` (`src/gov.ts:9`); chain entry released on settle | closed |
| T-3-04 | Tampering | several processes over one SQLite file | medium | accept | Outside the supported one-container deployment; documented in README (single-process note) | closed |
| T-3-05 | Information disclosure | taker data in URL, history or referrer | medium | mitigate | Only `?id=` via `history.replaceState`; issue-form fields have no `name`; form has `method="post"` without `action` | closed |
| T-3-06 | Tampering (CSRF) | POST `/v1/notas` from the panel | high | mitigate | `api.request` always sends `x-csrf-token` (`src/panel/api.js:31`); server constant-time check refuses others (403); `api.test.ts` | closed |
| T-3-07 | Elevation of privilege | `/admin/emitir` and new modules | high | mitigate | `/admin/*` guard + in-handler session check (`src/admin.ts:564`), `PANEL_SCRIPTS` allow-list; route tests for 303/404 | closed |
| T-3-08 | Information disclosure | localStorage contents | low | mitigate | Only serviceCode, nbsCode, description stored, inside try/catch; unit test asserts the three keys | closed |
| T-3-09 | Information disclosure | API_TOKEN / Bearer header from the browser | high | mitigate | No credential header in `api.js`; smoke asserts the recorded POST has no `authorization` header | closed |
| T-3-10 | Tampering (integrity) | value and competence conversions | medium | mitigate | `parseBrl` digit-string parsing; `brasiliaToday` uses `Intl` with `America/Sao_Paulo`; boundary unit tests | closed |
| T-3-11 | Tampering / EoP (stored XSS) | gov errors and hints on form and dialog | high | mitigate | `dom.js` builds nodes with `createElement`/`textContent`; 0 `innerHTML`/`outerHTML`/`insertAdjacentHTML` in `dom.js`, `emitir.js`, `panel.js`; hostile-detail smoke | closed |
| T-3-12 | Repudiation / operator error | lost or unknown answers | high | mitigate | Network/5xx/non-JSON answers tell the admin to resend with the same id; id never changes on failure; smoke `emitir-answers` | closed |
| T-3-13 | Tampering (duplicate fiscal document) | double click, reload, second tab | high | mitigate | In-flight flag + disabled button, id in URL, server per-id lock; smoke `emitir-double-click`, `emitir-two-tabs`, `emitir-resubmit` | closed |
| T-3-14 | Spoofing | crafted `#nota=<id>&ja-emitida` link | low | accept | Text-only notice over the real stored nota; no action attached to the flag | closed |
| T-3-15 | Tampering (CSRF) / session | stale CSRF token after another login | medium | mitigate | 403 handled with a reload prompt (`src/panel/emitir.js:188`); id kept in URL so reload is safe | closed |
| T-3-16 | Tampering (unintended fiscal event) | cancel trigger: row link, crafted `&cancelar`, Enter | high | mitigate | Flag only opens the section; POST sent only from the confirm click handler (`confirmCancel`); smoke `cancel-nothing-sent` | closed |
| T-3-17 | Repudiation / operator error | dialog and row after a cancel attempt | medium | mitigate | Cancelada shown only from a 200 canceled body; per-status pt-BR messages; smoke `cancel-answers` | closed |
| T-3-18 | Tampering / EoP (stored XSS) | cancelErrors rendering | high | mitigate | `dom.js` `errorSection` (textContent only); hostile detail asserted as text | closed |
| T-3-19 | Tampering (CSRF) | POST cancel from the panel | high | mitigate | `api.request` sends `x-csrf-token`; 403 handled with a reload prompt | closed |
| T-3-20 | Tampering (fiscal reason integrity) | reason padded or cut by the DPS builder | medium | mitigate | `reasonProblem` blocks <15 or >255 chars before sending (`src/panel/format.js:134`); textarea maxlength 255; unit tests | closed |
| T-3-21 | Tampering (duplicate event) | double click on confirm | low | mitigate | In-flight guard + disabled button; 03-01 per-id lock and server already-canceled handling; smoke `cancel-double-click` | closed |
| T-3-22 | Tampering (unintended cancellation of source) | duplicate request | high | mitigate | `prefillFromNota` never carries `replaces`; `buildIssueBody` never emits it; unit test + smoke `duplicate-row` | closed |
| T-3-23 | Tampering (duplicate or failed fiscal document) | Tentar de novo | high | mitigate | Same id and stored request (`retryBody` strips only the redundant accessKey); server DPS check + per-id lock; in-flight guard; `retry-unknown` proves one POST for two clicks | closed |
| T-3-24 | Spoofing / open redirect | `?de=` parameter | low | mitigate | Used only inside `encodeURIComponent` in a same-origin GET (`src/panel/emitir.js:84`); no navigation built from it | closed |
| T-3-25 | Tampering / EoP (XSS) | prefilled values from stored notas | high | mitigate | Values set through `.value`, never parsed as markup; smoke `duplicate-edges` asserts the hostile name verbatim | closed |
| T-3-26 | Information disclosure | taker data in the duplicate URL | medium | mitigate | Only `de` and `id` in the query; taker comes from the authenticated GET | closed |
| T-3-SC | Tampering | npm/pip/cargo installs | low | accept | No package installed in any plan (RESEARCH Package Legitimacy Audit: none); `package.json` and lockfile unchanged | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-3-01 | T-3-03 | Only same-id calls queue behind a slow government call, bounded by the 30 s gov timeout | plan-phase threat model (03-01) | 2026-11-22 |
| AR-3-02 | T-3-04 | Multi-process access to one SQLite file is outside the supported single-container deployment; README documents it; DB-level reservation is the follow-up if that changes | plan-phase threat model (03-01) | 2026-11-22 |
| AR-3-03 | T-3-14 | A crafted `&ja-emitida` link only shows an informational text over the real nota; no action is attached | plan-phase threat model (03-03) | 2026-11-22 |
| AR-3-04 | T-3-SC | No dependency was added in this phase | plan-phase threat model (all plans) | 2026-11-22 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-22 | 27 | 27 | 0 | secure-phase (L1 grep verification, orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-22
