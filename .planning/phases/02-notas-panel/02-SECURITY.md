---
phase: "2"
slug: "notas-panel"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-20"
---

# Phase 2 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser ↔ `/admin` + `/admin/*.js` | Session-guarded shell and same-origin ES modules | HTML/JS (no secrets; `API_TOKEN` never embedded) |
| Browser ↔ `/v1/notas*` | Panel fetches with the session cookie only (`credentials: 'same-origin'`) | Nota data incl. taker names, tax ids, government error text (untrusted, rendered as text) |
| URL (`?status=`, `#nota=`) → panel | Operator-controlled URL state parsed by the module | Status filter and nota id (allow-listed / encoded) |
| `/v1` query → SQLite | `before`, `beforeId`, `limit` from callers | Cursor values (prepared-statement placeholders), clamped limit |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Tampering / EoP | `panel.js` row rendering (stored XSS) | high | mitigate | No HTML-string sinks in `src/panel/*.js` (0 matches for innerHTML/outerHTML/insertAdjacentHTML/document.write); DOM built with `createElement` + `textContent`; CSP `script-src 'self'` | closed |
| T-02-02 | Information disclosure | `API_TOKEN` reaching the browser | high | mitigate | No `API_TOKEN`/`Authorization` in panel modules; `fetch` uses `credentials: 'same-origin'` (`panel.js:35`); `admin.test.ts` "never exposes API_TOKEN" | closed |
| T-02-03 | Tampering | `PAGE_CSP` loosened | medium | mitigate | Exact-string CSP with only `connect-src 'self'` appended (`admin.ts:191`, asserted in `admin.test.ts:347`) | closed |
| T-02-04 | Information disclosure | `/admin/*.js` without a session | low | mitigate | Routes registered after the `/admin/*` guard from the `PANEL_SCRIPTS` allow-list (`admin.ts:446-447`); 303/404 tests | closed |
| T-02-05 | Tampering | Sniffable script MIME | low | mitigate | `text/javascript; charset=utf-8` + `nosniff` (`admin.ts:447`, `admin.test.ts:386`) | closed |
| T-02-06 | Tampering | `repo.ts` list cursor (SQL injection) | high | mitigate | `(created_at, id) < (?, ?)` with placeholder params only (`repo.ts:67-70`); hostile `beforeId` route test | closed |
| T-02-07 | Info disclosure / DoS | `GET /v1/notas` limit | medium | mitigate | `listLimit` clamps 1..100, default 50 (`app.ts:44,141`); tests for -1, 0, abc, 0.5 (`app.test.ts:104-106`) | closed |
| T-02-08 | Tampering / DoS | Content-Disposition from id | medium | mitigate | `download=1` filename from the number filtered to `[0-9A-Za-z-]` (`app.ts:165`); non-Latin-1 id test | closed |
| T-02-09 | EoP | Download branch bypassing auth | high | mitigate | Route under `app.use('/v1/*', requireAuth)` (`app.ts:101`); 401 without credentials test (`appSession.test.ts:228`) | closed |
| T-02-10 | Tampering | Tie order change for Bearer callers | low | accept | See accepted risks AR-02-01 | closed |
| T-02-11 | Tampering | `parseStatus` / `listQuery` from URL | medium | mitigate | Allow-list in `parseStatus` (`format.js:83`); `URLSearchParams` encoding; unit + smoke `filter-invalid` | closed |
| T-02-12 | Tampering | PDF anchor href | medium | mitigate | `pdfHref` builds a relative path with `encodeURIComponent(id)` and never reads API `links` (`format.js:96`); hostile-id tests | closed |
| T-02-13 | Tampering (operator view integrity) | Stale list responses | low | mitigate | `view.generation` drops older loads (`panel.js:114-119`) | closed |
| T-02-14 | Information disclosure | Session expiry while panel open | low | mitigate | `api()` sends 401 to `/login` (`panel.js:36`); smoke `session-expired` | closed |
| T-02-15 | Tampering / EoP | Dialog rendering of GovError/description/taker | high | mitigate | View-model returns plain strings; `textContent` only; unit "hostile text" + smoke `dialog-hostile-text` | closed |
| T-02-16 | Tampering | Anchors with `javascript:` / foreign URLs | medium | mitigate | `httpsHref` accepts only `https://` (`format.js:113`); `LINK_PREFIXES` re-check (`panel.js:188`) | closed |
| T-02-17 | Tampering | `#nota=` hash content | medium | mitigate | `parseNotaHash` via `URLSearchParams` (`format.js:102`); id used only through `encodeURIComponent` / `textContent`; smoke `dialog-unknown` | closed |
| T-02-18 | Repudiation / operator error | Notices for pending/unknown/canceled/replaced | medium | mitigate | `statusNotice` (`format.js:219`) wording; no retry action; unit tests | closed |
| T-02-19 | Tampering (operator view integrity) | Out-of-order dialog responses | low | mitigate | `dialogGeneration` (`panel.js:111-114`) | closed |
| T-02-SC | Tampering | npm/pip/cargo installs | low | accept | See accepted risks AR-02-02 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-10 | Only notas sharing a `createdAt` change relative order, now deterministic (id descending); `before`-only paging keeps its meaning | plan 02-02 threat model | 2026-11-20 |
| AR-02-02 | T-02-SC | No package installed in this phase; the smoke harness uses Node's built-in WebSocket and the system Chrome | plans 02-01..02-04 threat models | 2026-11-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 20 | 20 | 0 | secure-phase (L1 grep-depth, short-circuit: plan-time register, ASVS 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-20
