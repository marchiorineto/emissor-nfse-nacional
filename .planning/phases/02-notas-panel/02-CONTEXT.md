# Phase 2: Notas Panel - Context

**Gathered:** 2026-11-20
**Status:** Ready for planning

<domain>
## Phase Boundary

A logged-in admin browses the notas on `/admin`:

- the list, newest first, loaded from `GET /v1/notas` through the session cookie;
- a status filter and a "Carregar mais" button for the next page;
- a details view of one nota, including the government's errors;
- a PDF download for every nota that has an access key.

Requirements: PANEL-01, PANEL-02, PANEL-03, PANEL-04. **PANEL-04 now covers only the PDF.** The user dropped the XML
download from the panel during this discussion, and REQUIREMENTS.md and ROADMAP.md were updated to match (see D-17).

Issue, cancel and duplicate belong to Phase 3. Nothing here changes fiscal state.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/REQUIREMENTS.md`: PANEL-01..04. PANEL-04 now covers the PDF only.
- `.planning/ROADMAP.md` § Phase 2: the 4 success criteria.
- `.planning/PROJECT.md` § Constraints:
  - no build step;
  - `API_TOKEN` never reaches the browser;
  - pt-BR UI.
- `.planning/STATE.md` § Blockers: the `limit=-1` concern, which D-04 addresses, and the XML route, which D-17 settles.

### Prior phase
- `.planning/phases/01-admin-password-and-login/01-CONTEXT.md`. Relevant decisions:
  - D-05: on 401, the JS sends the browser to `/login`;
  - D-11, D-12: `hono/html`, Pico classless, SRI;
  - D-13: the `/admin` skeleton;
  - D-16, D-18, D-19: CSRF and session scope.

### Code to follow and extend
- `src/admin.ts`:
  - `layout`, `adminPage` and the `<main id="notas">` slot;
  - `PAGE_CSP`, which allows `script-src 'self'` only and no inline styles;
  - `PANEL_CSS` and the `/panel.css` route, the pattern for serving the script;
  - `pageHeaders`;
  - the `/admin/*` session guard.
- `src/app.ts`:
  - `GET /v1/notas`: `status` validation, `limit` capped at `MAX_LIST = 100`, `before` cursor;
  - `GET /v1/notas/:id`;
  - `GET /v1/notas/:id/pdf`, which answers inline;
  - `view()` and `linksOf()`, which give the shape the panel receives.
- `src/notas.ts`: the `Nota`, `NotaStatus`, `IssueRequest`, `GovError` and `ReplaceRequest` types, and the meaning of
  each status.
- `src/dps.ts`: `Taker`, `ForeignTaker`, `ServiceExport`.
- `src/repo.ts`: `list` uses `created_at < ?` ordering, which matters for the cursor.
- `src/admin.test.ts`, `src/appSession.test.ts`: the test style for panel routes and session-authenticated `/v1` calls.
- `.planning/codebase/CONCERNS.md`: the `limit=-1` issue.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `layout()` and `adminPage()` in `src/admin.ts`: the shell, with the header, environment badge, Sair button and CSRF
  meta tag, already done.
- `PANEL_CSS` served at `/panel.css`: extend it for status emphasis, mobile cards and the error box.
- `formatCnpj` in `src/admin.ts`, a server-side helper. The browser script needs its own CPF/CNPJ formatter.
- `pageHeaders` middleware: the script route should go through it, or set equivalent headers.

### Established Patterns
- Every page is server-rendered with `hono/html`, which escapes values. No classes are needed thanks to Pico classless.
  The panel's own rules go in `/panel.css`.
- The CSP is `default-src 'none'; script-src 'self'; style-src 'self' cdn.jsdelivr`. This rules out inline `<script>`
  blocks and `style=""` attributes.
- `/v1` errors are JSON `{ error }`. An expired session gets 401 JSON on `/v1`, and `/admin*` redirects on the server.
- Tests build `createApp` with injected env, repo and gov, then call `app.request(...)`.

### Integration Points
- A new script route under `/admin/` is covered by the existing session guard and `pageHeaders`.
- `adminPage` gains a `<script type="module" src="/admin/panel.js">` and maybe a `<noscript>`.
- The PDF download may need an opt-in `?download=1` on `GET /v1/notas/:id/pdf` (D-18).
- The repo cursor might need an `id` tiebreak (Claude's Discretion).

</code_context>

<specifics>
## Specific Ideas

- The list feels like a simple fiscal ledger: competence, client (name over document), value, number, status, PDF.
- Deep links like `/admin?status=rejected#nota=abc` should reopen the same view.
- Rejected and unanswered notas should be easy to spot at a glance.

</specifics>

<deferred>
## Deferred Ideas

- XML download in the panel: dropped by the user. The XML stays available through the API and the signed links. Add
  it back as a requirement if an operator asks for it.
- Retry button for Pendente and Sem resposta notas: an action, so it belongs to Phase 3 or later.
- Search by client (PANEL-05), replacement from the panel (PANEL-06), and health and certificate status (PANEL-07) are
  already tracked as v2.

</deferred>

---

*Phase: 02-notas-panel*
*Context gathered: 2026-11-20*
