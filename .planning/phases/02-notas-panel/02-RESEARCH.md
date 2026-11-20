# Phase 2: Notas Panel - Research

**Researched:** 2026-11-20
**Domain:** Browser-side vanilla ES module on a Hono/Node server (no build step): same-origin `fetch` under a strict CSP, cursor pagination over SQLite, a `<dialog>` driven by the URL hash, Pico.css classless, pt-BR formatting with `Intl`
**Confidence:** HIGH (the two risky browser behaviours, the CSP `fetch` block and the history events, were run in headless Chrome in this session; everything else was read from the repo or tested in Node)

## Summary

No new dependency is needed. The panel is a plain ES module served by a Hono route plus a few additions to the existing server: a bigger `/admin` shell, extended `PANEL_CSS`, a cursor tiebreak, an opt-in `?download=1` on the PDF route, and a `connect-src` in the CSP. Everything the list and the dialog need already arrives in `GET /v1/notas` and `GET /v1/notas/:id` (`view()` returns the whole `Nota` minus `nfseXml`, plus `links` when there is an access key).

**The one blocker not in CONTEXT.md:** the current `PAGE_CSP` has `default-src 'none'` and no `connect-src`, so every `fetch('/v1/...')` from the panel script is blocked. This was reproduced in headless Chrome 153 with the exact current policy (`fetch blocked: Failed to fetch`) and fixed by adding `connect-src 'self'` (`fetch ok`). Phase 2 must change `PAGE_CSP`, and the existing exact-string assertion in `src/admin.test.ts` must change with it.

Other findings that change the plan: (1) `Content-Disposition: filename=` on the PDF route is built from the raw idempotency `id`, which can be any string up to 200 characters, and a non-Latin-1 character makes `new Response` throw (verified), so the download branch should name the file from the NFS-e/DPS number; (2) `createMemoryRepo.list` ignores `before` and does not sort, so pagination cannot be tested at route level until it mirrors the SQL repo; (3) competence is a date-only string and must never go through `new Date()` (shows the previous day in Brasília, verified); (4) the browser script cannot be unit tested end to end without a DOM library, so split it into a pure `format.js` (tested in vitest) and a thin DOM `panel.js` (checked by a headless-browser UAT).

**Primary recommendation:** Serve `panel.js` + `format.js` from real `.js` files in `src/panel/` read once at startup (Dockerfile already copies `src/`), add `connect-src 'self'`, build the shell (filter `<select>`, `<table>`, "Carregar mais", `<dialog>`) server-side in `adminPage`, fill it with `textContent`/`createElement` only, add `beforeId` to the repo cursor, and add `?download=1` to the PDF route.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### How the list loads
- **D-01:** The list is built **in the browser by a same-origin script** that calls `GET /v1/notas` with the session
  cookie, as ROADMAP criterion 1 says.
  - The script is served by a Hono route, for example `/admin/panel.js`, because the CSP only allows `script-src 'self'`
    and has no `'unsafe-inline'`.
  - `/admin` stays a server-rendered shell (Phase 1 D-11, D-13). The script fills `<main id="notas">`.
  - Without JS the list does not appear, which the user accepts. A `<noscript>` line in pt-BR saying that the panel
    needs JavaScript is enough.
  - `API_TOKEN` never reaches the browser.
- **D-02:** Pagination is a **"Carregar mais" button** that appends the next page under the notas already shown.
  - It sends `before=<createdAt of the last nota>` together with the current status filter, so the filter stays applied
    (ROADMAP criterion 2).
  - The button is hidden when a page comes back with fewer than the page size.
- **D-03:** The **status filter lives in the URL** as `/admin?status=<status>`. Changing the filter updates the URL with
  `history.replaceState` or `pushState`, the planner chooses which, and reloads the list from the first page. A reload
  or the Back button keeps the filter.
- **D-04:** The **page size is 20**. The panel always sends an explicit `limit=20` and never relies on the `limit`
  default or on the `limit=-1` bug from CONCERNS.md.

### List columns and formatting
- **D-05:** The **date column is the competence** (`request.competence`), shown as dd/mm/aaaa.
  - When the request had no competence, the column shows the `createdAt` date in Brasília time, which is the same
    default the issuer applies.
  - The list is still ordered by `createdAt`, which is also the cursor. The user accepts that the competence column may
    not look strictly ordered.
- **D-06:** The **client column shows the taker's name**, with the CPF or CNPJ formatted below it in smaller text.
  - With no taker: "— (não informado)".
  - For a taker abroad: the name and the country.
- **D-07:** **Value** is shown as Brazilian currency (`R$ 1.234,56`), formatted from `valueCents`.
- **D-08:** The **number column shows "NFS-e <nfseNumber>"** when the nota has one. Otherwise it shows "DPS
  <dpsNumber>" in muted text.
- **D-09:** **Status is a pt-BR label with emphasis**:
  - `issued` → Emitida
  - `rejected` → Rejeitada
  - `canceled` → Cancelada
  - `replaced` → Substituída
  - `pending` → Pendente
  - `unknown` → Sem resposta

  Rejeitada and Sem resposta stand out with color or an icon. The styling goes in `/panel.css` and uses Pico's CSS
  variables, because the CSP blocks inline `style` attributes.
- **D-10:** **On narrow screens, the rows turn into stacked cards.** The user chose this over horizontal scrolling. The
  extra CSS goes in `/panel.css`, and the markup stays semantic (a `<table>` restyled under a media query, or a list).
  The planner chooses the technique.
- **D-11:** **Each row or card links to its details** through an `<a href="#nota=<id>">` on the number or the client,
  so it opens with a normal click and can be copied.
- **D-12:** **The status filter offers every status** (Emitida, Rejeitada, Cancelada, Substituída, Pendente, Sem
  resposta), plus "Todas", which is the default.

### Nota details
- **D-13:** Details open **in a modal `<dialog>` on the same page**. The list stays loaded behind it, including the
  pages added by "Carregar mais".
  - The dialog closes with Esc or a "Fechar" button.
  - It uses Pico's `<dialog><article>` styling.
  - There is no separate `/admin/notas/:id` page.
- **D-14:** **The open nota lives in the URL hash** (`#nota=<id>`), which works together with `?status=`.
  - Loading the page, or a `hashchange` event, with `#nota=<id>` opens the dialog. The dialog fetches
    `GET /v1/notas/:id`, so a deep link works even when the nota is not on the loaded page.
  - Closing the dialog clears the hash.
  - The Back button closes the dialog.
  - An unknown id shows "Nota não encontrada." in the dialog.
- **D-15:** The details are **organized into sections built from `<dl>`**, with no raw JSON dump:
  - **Resumo:** status, NFS-e number, DPS number, value, created, issued and canceled dates.
  - **Tomador:** name, CPF/CNPJ or foreign data, email, phone.
  - **Serviço:** service code, NBS code, description, competence.
  - **Documento:** access key and the public lookup link (`links.lookup`).
  - **Exportação:** shown only when `request.export` is set.
  - **Substituição:** shown only when the nota replaced another one or was replaced, with `replaces` and `replacedBy`.
    `replacedBy` links to `#nota=<id>`.

  The idempotency `id` is shown too.
- **D-16:** **The government's errors go in a highlighted box at the top** of the dialog, right under the status.
  - Each error shows its code, message and detail.
  - The heading is "Erros na emissão" for `errors` and "Erros no cancelamento" for `cancelErrors`.
- **D-16a:** **Pendente and Sem resposta notas show a short pt-BR notice**, for example: "O governo não respondeu. A
  nota será verificada quando o sistema de origem reenviar este id." The notice is text only. Any retry button belongs
  to Phase 3.

### Downloads
- **D-17:** **The panel offers only the PDF. There is no XML download.** The user does not need the XML in the panel.
  The PANEL-04 wording and ROADMAP Phase 2 criterion 4 were changed to "download the PDF". The XML stays reachable
  through the API (`?xml=1`) and the signed `links.xml`. No new `/v1/notas/:id/xml` route is added. This settles the
  STATE.md blocker about the missing XML route.
- **D-18:** **The PDF downloads directly** and does not open in a new tab.
  - `GET /v1/notas/:id/pdf` already works with the cookie, because it is a same-origin GET.
  - Today that route answers `inline`. The planner chooses how to force the download:
    - a `download="nfse-<number>.pdf"` attribute on the same-origin link; or
    - an opt-in query parameter such as `?download=1` that switches the response to `attachment`, without changing the
      default for Bearer clients.
- **D-19:** **The PDF link appears in both the list rows or cards and the details dialog.**
- **D-20:** **The PDF link is shown for every nota with an `accessKey`**, which covers Emitida, Cancelada and
  Substituída.
  - For Cancelada and Substituída, the dialog notes that the document is no longer valid.
  - Notas without an access key show no PDF link.

### Claude's Discretion
- The script's structure: one file or a few, plain ES module, no build step. Use DOM APIs (`textContent`) and never
  insert API strings as HTML.
- Loading, empty-list ("Nenhuma nota encontrada.") and network-error states, all short pt-BR text.
- A 401 from `/v1` in the middle of use sends the browser to `/login`, as Phase 1 D-05 says.
- Tie-breaking for the `before=createdAt` cursor: the repo uses `created_at < ?`, so notas that share a timestamp could
  be skipped at a page edge. The planner decides whether to fix this in the repo, for example with an `id` tiebreak,
  without changing the `/v1` contract for existing callers.
- The exact date and time formatting helpers, for example `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })`.
- How the filter control looks: a `<select>`, or a row of links or buttons.

### Deferred Ideas (OUT OF SCOPE)
- XML download in the panel: dropped by the user. The XML stays available through the API and the signed links. Add
  it back as a requirement if an operator asks for it.
- Retry button for Pendente and Sem resposta notas: an action, so it belongs to Phase 3 or later.
- Search by client (PANEL-05), replacement from the panel (PANEL-06), and health and certificate status (PANEL-07) are
  already tracked as v2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PANEL-01 | Admin sees the notas on `/admin`, newest first, with date, client, value, DPS/NFS-e number and status, loaded from `GET /v1/notas` | `view()` already returns every field the columns need; CSP needs `connect-src 'self'`; script route under the existing `/admin/*` guard; pure `format.js` helpers for date/value/number/status/taker; `Intl` verified output |
| PANEL-02 | Admin can filter the list by status and load the next page | `?status=` allow-list; `before` (+ proposed `beforeId`) cursor; explicit `limit=20`; stale-response guard; `limit` clamp fix; memory repo parity for tests |
| PANEL-03 | Admin can open a nota and see all its details, including the government's errors | `<dialog>` + `showModal()`; `#nota=` via `URLSearchParams`; `popstate`+`hashchange` idempotent sync; view-model functions for the `<dl>` sections and error box |
| PANEL-04 | Admin can download the PDF of an issued nota | Same-origin relative link `/v1/notas/:id/pdf?download=1`; new `attachment` branch with number-based filename; `download` attribute semantics cited from MDN |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` or `.claude/CLAUDE.md` exists in the repo, and there is no `.claude/skills/` or `.agents/skills/` directory. The directives that bind this phase come from `.planning/PROJECT.md`/CONTEXT.md and `.planning/codebase/CONVENTIONS.md`:

- No frontend build step or framework; `API_TOKEN` never reaches the browser; the UI is pt-BR. [CITED: 02-CONTEXT.md canonical refs, REQUIREMENTS.md Out of Scope]
- Code style: 2-space indent, no semicolons, single quotes, trailing commas, `export const name = (...) =>` arrow style, tests co-located as `<module>.test.ts`, relative imports with `.ts` extension, comments in English, user-facing text in Portuguese. [CITED: .planning/codebase/CONVENTIONS.md]
- `pnpm run typecheck` (`tsc --noEmit`, `strict`, `noUncheckedIndexedAccess`, `include: ["src"]`) is the enforced gate and runs in CI. [VERIFIED: package.json scripts, tsconfig.json, .github/workflows/test.yml:25]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Panel shell (filter, table, dialog skeleton, `<noscript>`) | Frontend Server (Hono `hono/html`) | — | Phase 1 D-11/D-13: server-rendered, escaped, testable with `app.request` |
| Serving `panel.js`/`format.js` | Frontend Server | — | CSP allows only `script-src 'self'`; route sits under the `/admin/*` session guard |
| List fetch, pagination state, filter, hash/URL sync | Browser / Client | — | D-01: the script calls `/v1` with the cookie |
| Formatting (R$, dd/mm/aaaa, CPF/CNPJ, status labels) | Browser / Client | — | Pure functions over the `/v1` JSON; `Intl` is in the browser |
| Session auth of `/v1` reads | API / Backend | — | Already done in Phase 1 (`requireAuth`); no change |
| Cursor (`before`, `beforeId`), `limit` clamp | API / Backend | Database / Storage | The tiebreak must be in the SQL `WHERE`/`ORDER BY` |
| PDF generation and `Content-Disposition` | API / Backend | — | `notas().pdf()` unchanged; only the header branch changes |
| Stored XSS defence (API strings to DOM) | Browser / Client | Frontend Server (CSP) | `textContent` only; CSP `script-src 'self'` as the backstop |

## Standard Stack

### Core

No package is added. Everything is a platform API or already installed.

| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| `hono` + `hono/html` | 4.13.18 (installed) | Panel shell, script and CSS routes | Already the web framework and the Phase 1 page pattern [VERIFIED: package.json `"hono": "^4.13.18"`; Phase 1 research read node_modules version 4.13.18] |
| Pico.css classless | 2.1.1 via CDN + SRI (existing) | Table, `<dialog><article>`, forms, `<mark>/<ins>/<del>` | Locked by Phase 1 D-12; `dialog`, `dialog>article`, `table`, `--pico-del-color`, `--pico-ins-color`, `--pico-mark-*`, `--pico-muted-color` all present in the 2.1.1 classless build [VERIFIED: grep of `pico.classless.min.css` fetched from jsDelivr this session] |
| `Intl.NumberFormat` / `Intl.DateTimeFormat` (`pt-BR`, `America/Sao_Paulo`) | platform | R$ and dd/mm/aaaa | No library needed; output tested in Node 22.23.5 (see Code Examples) |
| `URLSearchParams`, `history`, `<dialog>.showModal()` | platform | Filter/hash state, modal | Native; `URLSearchParams` never throws on bad percent sequences, unlike `decodeURIComponent` [ASSUMED: URLSearchParams parsing never throws; verify in a unit test with `#nota=%E0%A4%A`] |
| `node:sqlite` row values | SQLite 3.54.1 bundled with Node 22.23.5 | `(created_at, id) < (?, ?)` tiebreak | [VERIFIED: ran `select sqlite_version()` = 3.54.1 and a row-value comparison in this session] |
| Vitest | ^5.1.0 (installed) | Tests | Already the runner; 53 tests in the files this phase touches pass at baseline [VERIFIED: ran `vitest run` on admin, appSession, repo, app tests] |

### Supporting

None.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Real `.js` files in `src/panel/` read at startup | A TS string constant like `PANEL_CSS` | A string constant forces escaping of backticks and `${}` in a large script and gets no editor support; real files are plain and the Dockerfile already `COPY src ./src` [VERIFIED: Dockerfile] |
| Plain JS + a sibling `format.d.ts` | Authoring the script as `.ts` and serving it through `node:module` `stripTypeScriptTypes` | The function exists in Node 22.23.5 [VERIFIED: ran it], but it is an experimental API and `tsconfig` has no DOM lib, so the benefit is small. Rejected: D-01/Discretion say plain ES module |
| Pure-function tests plus a headless-browser UAT | Adding `jsdom` or `happy-dom` as a devDependency | New dependency for a project that avoids them; `<dialog>.showModal()` support in these DOMs is uncertain [ASSUMED]. Not recommended |
| `<select>` for the filter | Row of links/buttons | Seven options fit a `<select>`; Pico styles it natively and it is one line of markup. Recommend `<select>` |
| `?download=1` on the PDF route | `download="nfse-<n>.pdf"` attribute only | The attribute alone is overridden by the server's `filename=` (MDN, below), so the saved name would be `nfse-<id>.pdf`. Recommend `?download=1` |

**Installation:** none (`pnpm install` unchanged).

**Version verification:** No package is recommended, so there is nothing to look up on a registry. Pico 2.1.1 is the version already pinned in `src/admin.ts` (`PICO_CSS_URL`, lines 25-26).

## Package Legitimacy Audit

No external packages are installed by this phase, so the legitimacy gate does not apply.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none installed)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 BROWSER (logged in, cookie nfse_admin, HttpOnly)
   |
   | 1. GET /admin?status=rejected#nota=abc
   v
 Hono app ──> pageHeaders (CSP + no-store + nosniff) ──> /admin/* session guard ──┐
   |                                                       no session -> 303 /login |
   | 2. HTML shell: filter <select>, <table> (empty tbody), "Carregar mais",       |
   |    <dialog>, <noscript>, <script type="module" src="/admin/panel.js">  <──────┘
   v
 BROWSER runs panel.js  (imports ./format.js, both served by Hono, same guard)
   |
   |-- sync(): read ?status= (allow-list) and #nota= (URLSearchParams)
   |
   |-- list:   fetch /v1/notas?limit=20[&status=..][&before=<createdAt>&beforeId=<id>]
   |              |                      (cookie only; no Authorization header; GET needs no CSRF)
   |              v
   |           requireAuth: no Authorization header -> readSession(cookie)
   |              401 JSON -> panel.js: location.assign('/login')
   |              200 { notas: [view(nota)...] } -> append rows (textContent only)
   |              rows < 20 -> hide "Carregar mais"
   |
   |-- detail: fetch /v1/notas/:id  (encodeURIComponent) -> dialog.showModal()
   |              404 -> "Nota não encontrada."
   |
   |-- pdf:    <a href="/v1/notas/:id/pdf?download=1" download>  (plain browser navigation/download)
   |              notas().pdf(id) -> gov DANFSe or renderDanfse(nfseXml)
   |              Content-Disposition: attachment; filename="nfse-<nfseNumber|dpsNumber>.pdf"
   |
   +-- URL is the state: filter -> pushState/replaceState (?status=), nota -> #nota=<id>
       popstate + hashchange -> sync() (idempotent) -> opens/closes dialog, reloads list when filter changed
```

### Recommended Project Structure

```
src/
├── admin.ts            # adminPage shell grows; PAGE_CSP gains connect-src; PANEL_CSS grows;
│                       #   routes: GET /admin/panel.js and /admin/format.js (allow-list, text/javascript)
├── panel/
│   ├── panel.js        # entry module: state, fetch, DOM building, URL sync (no exports used by tests)
│   ├── format.js       # pure helpers + view-model builders; no DOM, no top-level side effects
│   └── format.d.ts     # declarations so format.test.ts typechecks (TS7016 otherwise)
├── panel/format.test.ts
├── app.ts              # limit clamp, beforeId passthrough, ?download=1 branch
├── repo.ts             # list tiebreak; createMemoryRepo parity (sort, before, beforeId)
└── notas.ts            # Repo.list / Notas.list options gain `beforeId?: string`
```

`tsconfig.json` has `include: ["src"]` and no `allowJs`, so the `.js` files are ignored by `tsc`, and a `.ts` test importing them fails with TS7016 unless a declaration file exists. [VERIFIED: created a `.js` + importing `.ts` under `src/`, `tsc --noEmit` printed `error TS7016: Could not find a declaration file for module './format.js'`; adding a sibling `.d.ts` made it pass; the scratch files were deleted.]

### Pattern 1: Serve the script from real files, read once

**What:** Read the files at module load (like `PANEL_CSS` is a module constant), register an allow-list route under `/admin/`, reuse `pageHeaders` and the `/admin/*` guard already registered in `registerAdmin`.
**When to use:** Always for this phase. `app.use('/admin/*', pageHeaders)` and the session guard already cover any `/admin/...` path. [VERIFIED: src/admin.ts:219, 256-259]
**Example:**
```typescript
// Source: pattern of PANEL_CSS and the /panel.css route in src/admin.ts:222, adapted
import { readFileSync } from 'node:fs'

const PANEL_FILES = new Map(
  ['panel.js', 'format.js'].map((name) => [name, readFileSync(new URL(`./panel/${name}`, import.meta.url), 'utf8')]),
)

// inside registerAdmin, after the guard is registered
app.get('/admin/:file{(panel|format)\\.js}', (c) =>
  c.body(PANEL_FILES.get(c.req.param('file')) ?? '', 200, { 'Content-Type': 'text/javascript; charset=utf-8' }),
)
```
`nosniff` is already set by `pageHeaders`, and a module script needs a JavaScript MIME type, so keep `text/javascript`. The guard answers an unauthenticated request with a 303 to `/login`, which a `<script type="module">` rejects; that is fine because `/admin` itself would already have redirected.

### Pattern 2: Server-rendered shell, script fills it

**What:** Put every static label (title, filter `<label>`, `<option>`s, column headers, "Carregar mais", "Fechar", `<noscript>`) in `adminPage` so tests can assert on it with `app.request` and it needs no JS to translate. The script only creates rows and dialog content.
**Example (shape, not final markup):**
```html
<main id="notas">
  <noscript><p>O painel precisa de JavaScript.</p></noscript>
  <label for="status">Situação</label>
  <select id="status"><option value="">Todas</option><option value="issued">Emitida</option>...</select>
  <p id="notas-state" role="status"></p>           <!-- loading / empty / error text -->
  <table><thead>...</thead><tbody id="notas-body"></tbody></table>
  <button id="more" hidden>Carregar mais</button>
</main>
<dialog id="nota-dialog" aria-labelledby="nota-title"><article>...<footer><form method="dialog"><button>Fechar</button></form></footer></article></dialog>
<script type="module" src="/admin/panel.js"></script>
```
`<form method="dialog"><button>` closes the dialog natively without JS. [ASSUMED: standard HTML behaviour; cover it in the headless UAT.] The empty `<main id="notas">` slot already exists. [VERIFIED: src/admin.ts:159]

### Pattern 3: URL is the single source of truth, one idempotent `sync()`

**What:** Keep `status` and `nota` only in the URL (`?status=` and `#nota=`). A `sync()` function reads both from `location`, compares with what is currently rendered, and only acts on differences: reload the list when the status differs, open or close the dialog when the id differs. Call it on load, on `popstate` and on `hashchange`.
**Why:** In headless Chrome 153, clicking `<a href="#nota=x">` fired **both** `popstate` and `hashchange`; `history.replaceState` and `history.pushState` fired **neither**; `history.back()` fired `popstate` only. [VERIFIED: ran a test page in `google-chrome --headless=new` this session. Firefox and Safari were not run.] Because the set of events can differ per browser, an idempotent `sync()` bound to both is the safe design.
**Rules:**
- Filter change: `history.pushState(null, '', url)` (drops the hash) then reload page one. Recommend `pushState`, so Back restores the previous filter (D-03 says Back keeps the filter).
- Opening a nota is a plain link click (`#nota=<id>`), which adds a history entry; Back then closes the dialog (D-14).
- Closing with Esc/Fechar fires the dialog's `close` event: clear the hash with `history.replaceState(null, '', location.pathname + location.search)` (never `location.hash = ''`, which leaves a bare `#` and adds an entry). `replaceState` fires no event, so the handler must not depend on `hashchange` to finish. Accepted trade-off: after closing, one Back press lands on the same list URL without the dialog (a stale entry). Do not try to `history.back()` on close; it exits the site on a deep-link landing.
- Guard against the loop `sync() -> dialog.close() -> 'close' handler -> sync()` by checking the current state first.
- Build and parse both with `URLSearchParams` (`new URLSearchParams(location.hash.slice(1)).get('nota')`, and `new URLSearchParams({ nota: id }).toString()`). It is symmetric for any id, including `/`, `#`, `?`, `%`, spaces and emoji. [ASSUMED for the no-throw claim; the symmetry was reasoned, not run. The server side was verified: Hono round-trips ids `loja/123`, `a b#c?d`, `50%`, `ç😀`, `x"y` through `encodeURIComponent` in the `:id` param, ran in this session.]
- Validate `?status=` against the six statuses; anything else is "Todas" (the API answers 400 for an unknown status, `src/app.ts:129`).

### Pattern 4: Pure view-model + thin DOM (what makes it testable)

**What:** `format.js` exports pure functions that return plain data, and `panel.js` only turns that data into elements with `createElement`/`textContent`. Suggested exports: `statusLabel(status)`, `formatBrl(cents)`, `formatCompetence(nota)`, `formatDateTime(iso)`, `formatTaxId(digits)`, `takerCell(taker)`, `numberCell(nota)`, `listQuery({ status, last, limit })`, `pdfHref(nota)`, `detailSections(nota)` (returns `[{ title, rows: [[label, value | {text, href}]] }]`), `errorBox(nota)` (returns `{ heading, errors } | undefined`), `statusNotice(nota)` (D-16a, D-20), `parseLocation(search, hash)`.
**Why:** The browser script has no DOM test library (none installed; see Alternatives). Everything with branching logic (D-05, D-06, D-08, D-15, D-16, D-16a, D-20) lives in code `vitest` can import directly, and the DOM glue stays small enough to verify by the headless UAT.

### Pattern 5: Cursor with an `id` tiebreak that keeps the `/v1` contract

**What:** Add an optional `beforeId` next to `before` in `Repo.list` and `Notas.list` and the route (`before` alone keeps today's meaning). In SQL use a row-value comparison and a matching `ORDER BY`.
**Example:**
```typescript
// Source: src/repo.ts:66-72 adapted. Row values verified on SQLite 3.54.1 in this session.
list: async ({ status, limit, before, beforeId }) => {
  const filters = [
    status ? 'status = ?' : '',
    before && beforeId ? '(created_at, id) < (?, ?)' : before ? 'created_at < ?' : '',
  ].filter(Boolean)
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const params = [status, before, before && beforeId ? beforeId : undefined].filter((v): v is string => Boolean(v))
  const rows = db.prepare(`SELECT data FROM notas ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).all(...params, limit)
  return rows.map((row) => JSON.parse(String(row.data)) as Nota)
},
```
Verified in Node: with rows `(a,1) (b,1) (c,1) (d,0)`, `select id ... where (c,id) < ('1','c') order by c desc, id desc limit 2` returned `b`, `a`. `created_at` is a fixed-width `toISOString()` string, so text comparison orders correctly. The panel sends `before=<last.createdAt>&beforeId=<last.id>`. No migration is required: the existing `notas_created(created_at)` index serves the first sort key and SQLite sorts only the ties. [ASSUMED: query plan not inspected; irrelevant at this data size.]
**Why recommended over leaving `created_at < ?`:** the discretion item is real. Two notas created in the same millisecond at a page edge would make the second one unreachable. The fix is about 8 lines, optional for old callers, and testable.

### Pattern 6: PDF download link

**What:** The link is a plain anchor with a **relative** same-origin URL, never `links.pdf`: `links.pdf` is built from `PUBLIC_URL` (`originOf`, `src/app.ts:60`) and may be cross-origin, and MDN says `download` is ignored for cross-origin URLs. [CITED: developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a: "`download` only works for same-origin URLs, same-origin `blob:`, and `data:` schemes."] The same page says "The `download` attribute, when honored, overrides the `Content-Disposition: inline` behavior, but the `filename` parameter of `Content-Disposition` overrides the name in the `download` attribute." So today's route would save the file as `nfse-<id>.pdf`, not the `nfse-<number>.pdf` of D-18.
**Recommendation:** Add `?download=1` to `GET /v1/notas/:id/pdf` and answer `attachment; filename="nfse-<nfseNumber ?? dpsNumber>.pdf"`, the same naming as the public signed route (`src/app.ts:163,169`). The default (no query) stays `inline` for Bearer clients. Also put the `download` attribute on the anchor as a belt-and-braces hint.
```typescript
// Source: src/app.ts:141-145 adapted
app.get('/v1/notas/:id/pdf', async (c) => {
  const id = c.req.param('id')
  const pdf = await notas().pdf(id)
  if (!pdf) return c.json({ error: 'nota not issued' }, 404)
  if (c.req.query('download') !== '1') {
    return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="nfse-${id}.pdf"` } })
  }
  const nota = await notas().get(id)
  const number = nota?.nfseNumber ?? nota?.dpsNumber ?? 'nota'
  return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="nfse-${number}.pdf"` } })
})
```
`nfseNumber` comes from the XML's `nNFSe` text and `dpsNumber` is an integer, so the header value is ASCII digits (a safe `ByteString`). See Pitfall 7 for why the id must not be used in the new branch.

### Pattern 7: Mobile cards without changing the markup

**What:** Keep a real `<table>`. Under `@media (max-width: 767px)` (Pico's own `min-width: 768px` breakpoint exists [VERIFIED: `@media (min-width:768px)` in the Pico CSS]) set `table, thead, tbody, tr, td { display: block }`, hide `thead` visually, give each `tr` a Pico-like card border and each `td` a `::before { content: attr(data-label) }`. The script sets `data-label` with `setAttribute`/`dataset`, which the CSP does not block (only `style` attributes and inline `<style>` are blocked).
**A11y caveat:** `display: block` on table parts can drop the table semantics in some browser/assistive-tech pairs. Mitigate by adding `role="table"`, `role="row"`, `role="cell"`, `role="columnheader"` explicitly in the shell and in the generated rows. [ASSUMED: browser behaviour varies; check in the headless/manual UAT with the accessibility tree.]

### Anti-Patterns to Avoid

- **`innerHTML`, `insertAdjacentHTML`, `outerHTML` with any API field.** The government's messages, the taker's name, the description and the idempotency `id` all come from outside (other systems, the government). Use `createElement` + `textContent`. This is the stored-XSS defence; the CSP is only the backstop.
- **`new Date(competence)`** (see Pitfall 2).
- **`el.setAttribute('style', ...)` or inline `<style>`**: blocked by the CSP. Use `data-*` attributes (for example `tr.dataset.status = nota.status`) and `/panel.css` selectors.
- **An `href` taken from the API without a scheme check.** `links.lookup` is built by the server from the access key (`publicLookupUrl`, always `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=<key>`), but the panel should still only render an anchor when the value starts with `https://`. [VERIFIED: src/danfse.ts:11]
- **Using `links.pdf`/`links.xml`** for the panel's PDF button (cross-origin risk, signed link meant for emails).
- **Reading the status filter from a DOM variable instead of the URL.** It breaks reload/Back/deep links (D-03).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Brazilian currency | String concatenation of `R$` and manual thousands separators | `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)` | Rounding, grouping, negative values. Output is `R$ 1.234,56` with a **no-break space (U+00A0)** after `R$` [VERIFIED: ran in Node 22.23.5, code points `52 24 a0 31 2e 32 33 34 2c 35 36`], so tests must expect `R$ 1.234,56` |
| Date and time in Brasília | Manual UTC-3 arithmetic in the browser | `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ... })` | Correct zone rules; `dd/mm/aaaa` for dates, `20/11/2026, 12:30` with `dateStyle/timeStyle: 'short'` [VERIFIED: ran in Node] |
| Modal behaviour | Custom overlay, focus trap, Esc handling, `inert` background | `<dialog>.showModal()` | Native focus trap, Esc, top layer, focus return. Pico styles `dialog` and `dialog>article` [VERIFIED: Pico CSS grep] |
| Query/hash encoding | Manual `split('&')` and `decodeURIComponent` | `URLSearchParams` | Symmetric and does not throw `URIError` on malformed input [ASSUMED for the no-throw part] |
| Cursor tiebreak | Client-side dedupe or "overlap" paging | SQL row values `(created_at, id) < (?, ?)` | Skipping is the failure; overlap with a repeated timestamp can also loop forever when more than a page shares one value |
| Scroll lock behind the modal | Class toggling copied from Pico's class build | `html:has(dialog[open]) { overflow: hidden }` in `/panel.css` | The classless build has no `modal-is-open` rule [VERIFIED: grep of the 2.1.1 classless CSS returned no `modal-is` match] |
| PDF byte handling | Fetching a blob and rebuilding a download | Plain anchor to the same-origin route | Browser handles disposition, progress, filename. Errors (502 `DANFSe not available right now`) show as a failed download; accept it |

**Exception (small and justified):** the CPF/CNPJ formatter. `Intl` has no tax-id format. `formatCnpj` already exists server-side (`src/admin.ts:76`, regex `^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$`), the browser needs a copy plus the CPF variant `^(\d{3})(\d{3})(\d{3})(\d{2})$` → `$1.$2.$3-$4`. Fall back to the raw digits for any other length.

**Key insight:** the dangerous parts of this phase are not the UI widgets but the boundaries: the CSP, the date-only competence, ids in URLs and headers, and untrusted strings reaching the DOM.

## Runtime State Inventory

Not a rename/refactor/migration phase. Omitted.

## Common Pitfalls

### Pitfall 1: The CSP blocks the panel's own `fetch`
**What goes wrong:** The list never loads and the console shows a CSP violation; `fetch` rejects with `Failed to fetch`.
**Why it happens:** `connect-src` falls back to `default-src`, which is `'none'` in `PAGE_CSP` (`src/admin.ts:64-65`). The policy has no `connect-src`.
**How to avoid:** Append `; connect-src 'self'` to `PAGE_CSP`. Reproduced and fixed in headless Chrome 153 with the exact current policy. [VERIFIED: local server with `default-src 'none'; style-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'` gave `fetch blocked: Failed to fetch`; the same plus `connect-src 'self'` gave `fetch ok {"a":1}`.]
**Warning signs:** An empty `<main>` and a red CSP error in the console while `curl` with the cookie works.
**Test impact:** `src/admin.test.ts:346-348` asserts the exact `PAGE_CSP` string; update it. The comment above `PAGE_CSP` ("room for a Phase 2 script route") should be updated too. Downloads by `<a download>` navigation are not governed by `connect-src`, so the PDF link needs no CSP change. [ASSUMED for the download part; cover in the UAT.]

### Pitfall 2: Date-only strings shift a day in Brasília
**What goes wrong:** Competence `2026-11-20` shows as `19/11/2026`.
**Why it happens:** `new Date('2026-11-20')` is UTC midnight; formatting it in `America/Sao_Paulo` gives the previous evening. [VERIFIED: ran in Node: `Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(new Date('2026-11-20'))` printed `19/11/2026`.]
**How to avoid:** `request.competence` is validated as `YYYY-MM-DD` [VERIFIED: src/request.ts:100 `/^\d{4}-\d{2}-\d{2}$/`], so format it by splitting the string (`d + '/' + m + '/' + y`). Use `Intl` with the Brasília zone only for real timestamps (`createdAt`, `issuedAt`, `canceledAt`), which are ISO instants (`createdAt` is `toISOString()`, `src/notas.ts:227`).
**Warning signs:** A test with `createdAt` near 00:00-03:00 UTC showing the wrong day. Add one.

### Pitfall 3: `issuedAt` may not parse
**What goes wrong:** `Invalid Date` or `RangeError` in the dialog.
**Why it happens:** `issuedAt` is the XML's `dhProc` text when present (`src/notas.ts:137`), not always our own ISO string.
**How to avoid:** `formatDateTime` returns the raw string when `Number.isNaN(Date.parse(value))`. `Intl.DateTimeFormat.format(invalidDate)` throws `RangeError`.

### Pitfall 4: Stale responses after a filter change or a second click
**What goes wrong:** The user switches the filter while "Carregar mais" is in flight and rows of the old filter are appended under the new one; or opens nota A then B quickly and A's response overwrites B's dialog.
**How to avoid:** Keep a request generation counter (or an `AbortController`) for the list and another for the dialog, and ignore any response whose generation is not current. Disable "Carregar mais" while loading. State shape: `{ status, rows, cursor: { createdAt, id } | null, done, generation }`.

### Pitfall 5: Hash and history handling
**What goes wrong:** Stuck dialogs, double loads, a bare `#` in the URL, or a loop between `close` and `sync`.
**How to avoid:** See Pattern 3. Use `replaceState` to clear the hash, `pushState` for filter changes, and an idempotent `sync()` on `popstate` and `hashchange`. A `popstate` that only changed the hash must not reload the list; compare `status` before reloading.

### Pitfall 6: Stored XSS through API data
**What goes wrong:** A taker name or a government message like `<img src=x onerror=...>` reaches the admin's session.
**How to avoid:** `textContent` and `createElement` only; no `innerHTML`; anchors only for `#nota=...` links built by the script and an `https:` `links.lookup`. Add a unit test that feeds `<script>`/`"><img` strings through `detailSections`/`takerCell` and asserts they stay data (the view-model returns strings, never HTML). The CSP (`script-src 'self'`, no inline) is the second line.

### Pitfall 7: `Content-Disposition` filename from the idempotency id
**What goes wrong:** `GET /v1/notas/:id/pdf` returns a 500 (`onError`) for an id with a character above U+00FF, and a header with a stray `"` for ids with quotes.
**Why it happens:** `filename="nfse-${id}.pdf"` (`src/app.ts:144`) uses the raw id; ids are any string up to 200 characters. [VERIFIED: src/request.ts:99 `id.length > 200`, no charset rule.] `new Response('x', { headers: { 'content-disposition': 'inline; filename="nfse-pedido-😀.pdf"' } })` throws `Cannot convert argument to a ByteString...` in Node 22.23.5. [VERIFIED: ran it.]
**How to avoid:** The new `?download=1` branch names the file from the number (ASCII). Leave the default branch as is (existing behaviour for Bearer clients) or sanitise it in a separate, optional fix; do not widen the phase. Note it in the plan as a known pre-existing issue.

### Pitfall 8: `createMemoryRepo.list` does not behave like the SQL repo
**What goes wrong:** A route test of `?before=` or of the order passes vacuously.
**Why it happens:** `createMemoryRepo().list` filters by status and slices, with no sort and no `before` (`src/repo.ts:90`). [VERIFIED: src/repo.ts:77-91]
**How to avoid:** Make the memory repo sort by `createdAt` desc then `id` desc and apply `before`/`beforeId` with the same semantics, in the same plan that adds `beforeId`. Add the same cases to `repo.test.ts` for both repos (it already covers the SQL repo at lines 40-48).

### Pitfall 9: `limit=-1` (and `limit=0`, `limit=abc`)
**What goes wrong:** `limit=-1` lifts the cap (SQLite negative `LIMIT` is unlimited).
**Why it happens:** `Math.min(Number(c.req.query('limit') ?? 50) || 50, MAX_LIST)` (`src/app.ts:130`).
**How to avoid:** The panel always sends `limit=20`, as D-04 requires. A one-line server clamp, `Math.min(Math.max(1, Math.trunc(Number(q) || 50)), MAX_LIST)`, closes the bug for every caller and does not change the contract for valid values. Recommend including it as a small task with a test (`limit=-1` returns at most `MAX_LIST`), because the Phase 2 STATE.md blocker names it. Treat it as a bug fix, not as a contract change; flag it in the plan summary.

### Pitfall 10: The exact "last page" signal
**What goes wrong:** With exactly 20 remaining notas the button shows once more and the next page is empty.
**How to avoid:** Follow D-02 literally (hide when fewer than 20 come back) and treat an empty append as "done": hide the button and show nothing extra. Do not switch to a `limit=21` probe; D-04 fixes `limit=20`.

### Pitfall 11: Existing Phase 1 tests forbid what this phase adds
**What goes wrong:** `pnpm test` fails after adding the script tag and the class-free shell.
**Where:** `src/admin.test.ts:344-376`: the test "allows only Pico from jsDelivr..." asserts `not.toContain('<script')` for **every** page body, including `/admin`, and exact CSP equality at 346-348. [VERIFIED: read.]
**How to avoid:** Update it so only the `/admin` body (the two `/admin` entries in `bodies`) may contain exactly one `<script type="module" src="/admin/panel.js">`, the other pages still have none, `class=`/`style=` stay forbidden everywhere, and the absolute-URL list still equals `[PICO_CSS_URL]`. The `/admin/panel.js` and `/panel.css` routes need their own header tests next to the existing `/panel.css` one (`src/admin.test.ts:379-386`).

### Pitfall 12: Pico dialog layout
**What goes wrong:** The dialog looks right but the page behind scrolls, or an expected close button is missing.
**Facts:** Pico's `dialog` is `display:flex; position:fixed; inset:0; min-width:100%; min-height:100%` with `dialog>article{max-width:510px}` and `700px` at wider widths, and `dialog:not([open]){display:none}`; the close icon style needs a `[rel=prev]` anchor/button; there is no scroll-lock rule in the classless build. [VERIFIED: Pico 2.1.1 classless CSS grep.]
**How to avoid:** Add `html:has(dialog[open]) { overflow: hidden }`; give the article `max-height` scrolling (Pico already sets `max-height: calc(100vh - spacing*2)` and `overflow:auto`); close on a backdrop click by checking `event.target === dialog`; use a footer "Fechar" button (D-13 names it) rather than the icon.

### Pitfall 13: Narrow screens vs wide dialog content
**What goes wrong:** Long access keys (44-50 digits) and `links.lookup` URLs overflow the card.
**How to avoid:** `overflow-wrap: anywhere` (or `word-break: break-all`) on `dd` in `/panel.css`; show the access key in `<code>`.

## Code Examples

### Formatters (verified output)
```javascript
// format.js (pure, no DOM). Outputs below were run in Node 22.23.5.
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatBrl = (cents) => BRL.format(cents / 100) // 123456 -> "R$ 1.234,56"

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
export const formatDateTime = (iso) => (Number.isNaN(Date.parse(iso)) ? String(iso) : DATE_TIME.format(new Date(iso))) // 2026-11-20T15:30:00Z -> "20/11/2026, 12:30"

// Competence is a date-only string: split it, never new Date() (see Pitfall 2).
export const formatCompetence = (value) => value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')

const BRASILIA_DAY = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }) // "dd/mm/aaaa"
export const listDate = (nota) => (nota.request.competence ? formatCompetence(nota.request.competence) : BRASILIA_DAY.format(new Date(nota.createdAt)))

export const formatTaxId = (digits) =>
  digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
```

### List request and cursor
```javascript
// Source: contract of GET /v1/notas in src/app.ts:127-134 (status, limit capped at MAX_LIST = 100, before)
export const PAGE_SIZE = 20
export const listQuery = ({ status, last }) => {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) })
  if (status) query.set('status', status)
  if (last) { query.set('before', last.createdAt); query.set('beforeId', last.id) }
  return `/v1/notas?${query}`
}
```

### 401 handling and fetch wrapper
```javascript
// Phase 1 D-05: an expired session answers 401 JSON on /v1; the panel sends the browser to /login.
const api = async (path, signal) => {
  const res = await fetch(path, { credentials: 'same-origin', headers: { accept: 'application/json' }, signal })
  if (res.status === 401) { location.assign('/login'); throw new Error('unauthorized') }
  return res
}
```
GETs need no CSRF header (`requireAuth` exempts `GET`/`HEAD`, `src/app.ts:84`). Phase 3 adds `X-CSRF-Token` from `<meta name="csrf-token">`.

### Status emphasis in `/panel.css` (CSP-safe)
```css
/* The script sets tr.dataset.status / span.dataset.status; no style attribute is involved. */
[data-status="rejected"] { color: var(--pico-del-color); font-weight: 600; }
[data-status="unknown"]  { color: var(--pico-del-color); font-weight: 600; }
[data-status="issued"]   { color: var(--pico-ins-color); }
[data-status="canceled"], [data-status="replaced"], [data-status="pending"] { color: var(--pico-muted-color); }
```
Use a text label plus an icon character (for example a leading "!" for Rejeitada/Sem resposta) so color is never the only cue. Variables confirmed in the Pico CSS: `--pico-del-color`, `--pico-ins-color`, `--pico-muted-color`, `--pico-mark-background-color`. [VERIFIED: grep.] Check contrast in light and dark (`color-scheme: light dark` is already set in the layout).

### Error box
Fields to render per `GovError` (`code`, `message`, optional `detail`) [VERIFIED: src/notas.ts:33-37 `interface GovError { code: string; message: string; detail?: string }`]. Heading "Erros na emissão" for `nota.errors`, "Erros no cancelamento" for `nota.cancelErrors`; render both boxes when both exist. A non-HTTP-answer error has code like `HTTP 403` with up to 500 characters of message [VERIFIED: src/notas.ts:119], so keep the box scrollable/wrapping.

### Status meaning (for labels and notices)
`NotaStatus` is `'pending' | 'unknown' | 'issued' | 'rejected' | 'canceled' | 'replaced'` [VERIFIED: src/notas.ts:45]. `pending` = number reserved, never answered; `unknown` = sent, answer lost; `replaced` = issued then replaced by `replacedBy`. The filter allow-list in the API is the same array [VERIFIED: src/app.ts:24].

### Fields the detail view can rely on
From `view()` (`src/app.ts:53-57`): every `Nota` field except `nfseXml`, plus `links: { pdf, xml, lookup }` only when `accessKey` is set. `Nota` fields [VERIFIED: src/notas.ts:47-64]: `id, status, request, dpsNumber, dpsId, accessKey?, nfseNumber?, issuedAt?, errors?, cancelErrors?, canceledAt?, replacedBy?, createdAt, updatedAt`. `request` is `IssueRequest`: `id, competence?, taker?, serviceCode, nbsCode?, description, valueCents, export?, replaces?` [VERIFIED: src/notas.ts:5-20]. `taker` is `{ taxId?, abroad?: { nif?, noNifReason?: '1'|'2', address? }, name, phone?, email? }` [VERIFIED: src/dps.ts:38-55]; a foreign address has `country` (ISO alpha-2), `postalCode`, `city`, `region`, `street`, `number`, optional `complement`, `district` [VERIFIED: src/request.ts:65-76]. `export` is `ServiceExport`: `resultCountry`, `currency` (BACEN 3-digit code, **not** an ISO code, so do not feed it to `Intl` currency), `foreignValueCents`, `mode?`, `relationship?`, `issuerSupport?`, `takerSupport?`, `shareWithMdic?` [VERIFIED: src/dps.ts:61-78]. `request.replaces` is `{ id?, accessKey?, reasonCode, reason? }` [VERIFIED: src/notas.ts:26-31].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom modal markup + focus trap | `<dialog>.showModal()` | Baseline in all evergreen browsers | No library; Pico styles it |
| `hashchange` only | `popstate` + `hashchange` with an idempotent handler | Chrome fires both on a fragment link click [VERIFIED: Chrome 153] | One sync function covers every navigation path |

**Deprecated/outdated:** `limit` handling as written in `src/app.ts:130` (see Pitfall 9) is a known bug in `.planning/codebase/CONCERNS.md`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `URLSearchParams` parsing of the hash never throws on malformed `%` sequences | Standard Stack, Pattern 3 | A bad hash could throw in `sync()`; mitigate with a unit test and a try/catch around `parseLocation` |
| A2 | `<form method="dialog"><button>` closes the dialog natively | Pattern 2 | The Fechar button would do nothing; fall back to a `click` handler calling `dialog.close()` |
| A3 | Downloads via `<a download>` are not blocked by `connect-src` or other CSP directives | Pitfall 1 | PDF link fails under CSP; the headless UAT must click it |
| A4 | `display: block` on table parts can drop table semantics; explicit `role` attributes fix it | Pattern 7 | Slightly worse screen-reader output; low |
| A5 | The `notas_created` index plus a temp sort for ties is fast enough with the `ORDER BY created_at DESC, id DESC` change | Pattern 5 | Slow listing on a very large table; a migration `0002` index on `(created_at, id)` would fix it. Data size here is one issuer's notas |
| A6 | jsdom/happy-dom would not support `showModal()` well enough to be worth adding | Alternatives | A DOM test library could have been viable; the pure-function split already covers the logic |
| A7 | Firefox/Safari fire the same or a superset of history events as Chrome for fragment links | Pattern 3 | Mitigated by the idempotent `sync()` |
| A8 | Recommending the `limit` clamp as part of this phase is acceptable to the user | Pitfall 9 | The user may prefer to leave `/v1` untouched; it is optional and independent of the panel |

## Open Questions

1. **Should the `limit` clamp (Pitfall 9) and the `beforeId` cursor ship in this phase?**
   - What we know: D-04 only says the panel must not depend on the bug; the cursor fix is explicitly the planner's call.
   - What's unclear: whether the user wants `/v1` code changed at all in a panel phase.
   - Recommendation: include both as small, separate tasks with tests (the cursor fix is needed to make criterion 2 correct at page edges; the clamp is a one-liner closing a listed blocker). Call them out in the plan so the user can drop either.

2. **Should the default (no `?download=1`) PDF filename be sanitised?**
   - What we know: ids with non-Latin-1 characters make the default route answer 500 today (Pitfall 7).
   - What's unclear: whether any real client sends such ids.
   - Recommendation: out of scope for the panel; the new branch avoids the problem. Log it as a follow-up.

3. **Back-button entry after closing the dialog** leaves one extra history entry (Pattern 3). Accepted unless the user objects.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server, tests | ✓ | v22.23.5 (`engines >=22.18.0`) | — |
| pnpm | scripts | ✓ | 11.15.1 | — |
| Vitest (installed) | tests | ✓ | ^5.1.0, 53 tests green in the four relevant files | — |
| `xmllint`, `xmlsec1` | full suite (`dps`, `sign` tests) | ✓ | present on this machine | — |
| `google-chrome` | headless UAT of the browser script (not CI) | ✓ | 153.0.8010.12 | Manual check in any browser |
| Network to jsDelivr | Pico CSS in the UAT | ✓ | fetched in this session | Unstyled UI still works |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none. Chrome is only a verification aid and is not needed in CI.

## Validation Architecture

`workflow.nyquist_validation` is absent in `.planning/config.json`, so this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^5.1.0 (Node environment) |
| Config file | none (defaults; `src/**/*.test.ts` picked up automatically) |
| Quick run command | `pnpm exec vitest run src/admin.test.ts src/panel/format.test.ts src/repo.test.ts src/app.test.ts src/appSession.test.ts` |
| Full suite command | `pnpm test` (needs `xmllint`, `xmlsec1`, `openssl`) and `pnpm run typecheck` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PANEL-01 | `/admin` body has the table shell, filter, dialog, `<noscript>` and exactly one module script tag; no `API_TOKEN` in the page or the script | integration (`app.request`) | `pnpm exec vitest run src/admin.test.ts` | ✅ file, ❌ new cases (and 2 existing assertions to update) |
| PANEL-01 | `/admin/panel.js` and `/admin/format.js`: 200 `text/javascript` with a session, 303 to `/login` without, `nosniff` + CSP + `no-store`, body never contains the token | integration | same | ❌ Wave 0 |
| PANEL-01 | `PAGE_CSP` contains `connect-src 'self'` | unit | same | ✅ file, update exact-string test |
| PANEL-01 | Formatters: `R$ 1.234,56`, competence `2026-11-20` → `20/11/2026`, `createdAt` fallback in Brasília (incl. a 01:30Z case), CPF/CNPJ, taker cell (none / abroad / Brazil), number cell (NFS-e vs DPS), status labels | unit | `pnpm exec vitest run src/panel/format.test.ts` | ❌ Wave 0 |
| PANEL-02 | `listQuery` always has `limit=20`, adds `status`, `before`, `beforeId`; `parseLocation` rejects an unknown status | unit | `pnpm exec vitest run src/panel/format.test.ts` | ❌ Wave 0 |
| PANEL-02 | Repo cursor: order `created_at DESC, id DESC`; two notas with the same `createdAt` split across pages are neither skipped nor repeated; `before` alone behaves as before; both repos | unit | `pnpm exec vitest run src/repo.test.ts` | ✅ file, ❌ new cases |
| PANEL-02 | `GET /v1/notas?limit=-1` is capped; `beforeId` is passed through; status filter 400 unchanged | integration | `pnpm exec vitest run src/app.test.ts src/appSession.test.ts` | ✅ files, ❌ new cases |
| PANEL-03 | `detailSections`/`errorBox`/`statusNotice` per status: rejected shows "Erros na emissão" with code/message/detail, `cancelErrors` heading, Exportação only with `request.export`, Substituição only with `replaces`/`replacedBy` and the `#nota=` link, D-16a text for `pending`/`unknown`, D-20 "no longer valid" for canceled/replaced; API strings with `<script>` stay plain strings | unit | `pnpm exec vitest run src/panel/format.test.ts` | ❌ Wave 0 |
| PANEL-03 | Dialog opens from `#nota=`, closes on Esc/Fechar/Back, unknown id shows "Nota não encontrada." | headless-browser UAT (manual, not CI) | see UAT script below | ❌ Wave 0 (document in a VERIFICATION/UAT file) |
| PANEL-04 | `GET /v1/notas/:id/pdf` default stays `inline`; `?download=1` answers `attachment; filename="nfse-<number>.pdf"`; 404 for a nota without access key; works with the session cookie; `pdfHref` returns a relative `/v1/...` path only when `accessKey` is set | integration + unit | `pnpm exec vitest run src/app.test.ts src/appSession.test.ts src/panel/format.test.ts` | ❌ Wave 0 |

**Headless UAT sketch (manual, uses the installed Chrome):** start the server with a temp `DATABASE_PATH`, seed notas through `POST /v1/notas` with the Bearer token (or insert rows directly), log in through `/login`, then drive `google-chrome --headless=new --dump-dom` / a CDP script to check: rows render newest first; filter changes `?status=`; "Carregar mais" appends and keeps the filter; `#nota=<id>` deep link opens the dialog; the CSP produces no console violations; the PDF link downloads. The `fetch` and history behaviours in this research were verified this way.

### Sampling Rate
- **Per task commit:** the quick run command above (about 15 s; the scrypt-based files dominate)
- **Per wave merge:** `pnpm test` and `pnpm run typecheck`
- **Phase gate:** full suite green and the headless UAT done before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/panel/format.test.ts` and `src/panel/format.d.ts` — pure helpers (covers PANEL-01..04); `format.d.ts` is needed or `tsc` reports TS7016 [VERIFIED]
- [ ] Update `createMemoryRepo.list` (sort, `before`, `beforeId`) before any route-level pagination test
- [ ] Update `src/admin.test.ts:344-376` (script tag allowed on `/admin` only) and `:346-348` (new `PAGE_CSP`)
- [ ] A UAT checklist file for the browser-only behaviours (dialog, history, mobile cards, download)
- [ ] Framework install: none

## Security Domain

`security_enforcement` is absent in config, so this section is included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (done in Phase 1) | Session cookie from Phase 1; this phase adds no credential handling |
| V3 Session Management | yes (reuse) | The new `/admin/panel.js`, `/admin/format.js` and every `/v1` fetch ride the existing HttpOnly, SameSite=Strict cookie; 401 → `/login` |
| V4 Access Control | yes | Script routes live under the `/admin/*` guard; `/v1` keeps `requireAuth`; the shell must never embed `API_TOKEN` (assert in a test) |
| V5 Input Validation / Output Encoding | yes | `textContent`/`createElement` for every API string; `?status=` allow-list; `encodeURIComponent`/`URLSearchParams` for ids in URLs; `https:`-only `links.lookup` |
| V6 Cryptography | no | None added |
| V14 Config / Headers | yes | `PAGE_CSP` gains only `connect-src 'self'`; keep `script-src 'self'`, no `'unsafe-inline'`; `nosniff` and `no-store` stay |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS from a taker name, description or government message rendered in the admin's browser | Tampering / Elevation | `textContent` only, no `innerHTML`; CSP `script-src 'self'` as backstop; unit test with hostile strings |
| `javascript:` or foreign-scheme `href` from API data | Tampering | Render anchors only for script-built `#nota=` links and `https://` lookup URLs; never use API values for `href` otherwise |
| Header injection / 500 via `Content-Disposition` built from the free-form `id` | Tampering / DoS | New download branch uses the numeric NFS-e/DPS number (ASCII); existing inline branch unchanged |
| CSRF on the new reads | Spoofing | Not applicable: only GETs; the cookie is `SameSite=Strict`; Phase 3 adds writes with the existing `X-CSRF-Token` |
| `limit=-1` dumping the whole table | Information disclosure / DoS | Panel sends `limit=20`; optional server clamp |
| Script served without a session | Information disclosure | Low value (static code, no secrets), but it sits behind the same guard as `/admin` |
| Open redirect/handling of `#nota=` content | Tampering | The id is only used inside `fetch('/v1/notas/' + encodeURIComponent(id))` and `textContent` |

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `src/admin.ts`, `src/app.ts`, `src/repo.ts`, `src/notas.ts`, `src/request.ts` (id, competence, taker, replaces), `src/dps.ts` (Taker, ForeignTaker, ServiceExport, `brasiliaDate`), `src/danfse.ts` (`publicLookupUrl`), `src/session.ts`, `src/admin.test.ts`, `src/appSession.test.ts`, `src/repo.test.ts`, `Dockerfile`, `tsconfig.json`, `package.json`, `migrations/0001_init.sql`, `.planning/codebase/CONCERNS.md`, `CONVENTIONS.md`, `TESTING.md`, Phase 1 research and context.
- Pico CSS 2.1.1 classless build fetched from jsDelivr and grepped (dialog rules, variables, breakpoints, absence of `modal-is-open`).
- Headless Chrome 153.0.8010.12 runs: CSP `connect-src` fallback block/fix; `popstate`/`hashchange` firing on fragment click, `replaceState`, `pushState`, `back()`.
- Node 22.23.5 runs: `Intl` currency/date output and the UTC date-only shift; SQLite 3.54.1 row-value tuple comparison; `Response` header ByteString throw; `stripTypeScriptTypes` existence; Hono id round-trip through `encodeURIComponent`; `tsc` TS7016 and `.d.ts` fix; baseline `vitest` run.

### Secondary (MEDIUM confidence)
- MDN `<a>` element reference (`download` attribute: same-origin only; `Content-Disposition: filename` overrides the `download` name; `download` overrides `inline`) — developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a (fetched this session).

### Tertiary (LOW confidence)
- None beyond the items tagged `[ASSUMED]` in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every platform API and Pico rule used was checked in this session.
- Architecture: HIGH — follows the existing `PANEL_CSS`/`/panel.css` and guard patterns; the one structural risk (CSP) was reproduced and fixed empirically.
- Pitfalls: HIGH for CSP, date, ByteString, memory repo, test conflicts (all reproduced or read); MEDIUM for cross-browser history events and table accessibility (Chrome only).

**Research date:** 2026-11-20
**Valid until:** 2026-12-20 (stable stack: Hono 4, Pico 2.1.1 pinned, platform APIs); re-check only if Pico or Hono are bumped.
