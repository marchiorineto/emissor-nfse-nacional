# Phase 3: Nota Actions - Context

**Gathered:** 2026-11-21
**Status:** Ready for planning

<domain>
## Phase Boundary

A logged-in admin changes fiscal state from the panel, always through the existing `/v1` routes with the session cookie
and the `X-CSRF-Token` header. The admin can:

- **issue** a nota from a form on its own page, `/admin/emitir`, which posts to `POST /v1/notas`;
- **retry** a Pendente or Sem resposta nota with the same `id`;
- **cancel** an Emitida nota by choosing the reason and confirming, through `POST /v1/notas/:id/cancel`;
- **duplicate** any nota into a pre-filled form with a new suggested `id`.

Requirements: ACT-01, ACT-02, ACT-03. Core rule from PROJECT.md: no click, double click, reload or retry may ever
produce a second nota for the same sale.

Out of this phase:
- takers abroad and the export group in the form;
- replacing a nota from the panel (PANEL-06, v2);
- any change to the `/v1` contract for Bearer clients.

</domain>

<decisions>
## Implementation Decisions

### Issue form
- **D-01:** The form lives on **its own page, `/admin/emitir`**.
  - It is server-rendered with the same `layout()` shell and header as `/admin`, so it sits behind the existing
    `/admin/*` session guard and `pageHeaders`.
  - Its behavior is a same-origin module, for example `/admin/emitir.js`, or a shared module. The CSP has no inline
    script and no inline style.
  - `/admin` gets an "Emitir nota" link to `/admin/emitir`.
- **D-02:** The form **submits with JS `fetch` to `POST /v1/notas`**, sending JSON with the session cookie and
  `X-CSRF-Token` read from the `<meta name="csrf-token">`, as the roadmap says.
  - Fields are kept on failure.
  - The submit button is disabled while the request is in flight, which covers the double click.
  - A 401 sends the browser to `/login` (Phase 1, D-05).
- **D-03:** The **taker is Brazil only and optional**:
  - CPF or CNPJ plus name, with email and phone optional; or
  - no taker at all, which the API allows.

  There are no foreign-taker or export fields in the form.
- **D-04:** **Service code (6 digits, cTribNac), NBS code (9 digits, optional) and description are plain fields.** The
  browser remembers the last values used (`localStorage`, wrapped in try/catch) and pre-fills them in a new empty form,
  because most issuers sell the same few services.
- **D-05:** **The value is typed as Brazilian currency** (`1.234,56`, with or without `R$`). It is converted to an
  integer `valueCents` in the browser and must be greater than 0. **Competence is a date input that starts on today in
  Brasília time** (`America/Sao_Paulo`) and can be changed. It is sent as `YYYY-MM-DD`.

### Id, idempotency and resubmit
- **D-06:** The **suggested id is `painel-AAAAMMDD-xxxxxx`**: today's date in Brasília time plus a random suffix of 6
  characters from `[a-z0-9]`, made with `crypto.getRandomValues`. The field can be edited, for example to type the
  seller's own sale number. The API's limit is 1 to 200 characters.
- **D-07:** **The id lives in the URL so a reload never makes a second nota.**
  - Opening `/admin/emitir` without `?id=` generates an id and writes it with
    `history.replaceState` to `/admin/emitir?id=painel-…`.
  - A reload, or reopening that URL, keeps the same id, so a resubmit returns the nota already issued (ROADMAP
    criterion 2).
  - Editing the id field updates the URL.
  - Each fresh "Emitir nota" click from `/admin` gets a new id.
- **D-08:** **Where the result shows**:
  - When the answer is Emitida (200), Pendente or Sem resposta (202), the browser goes to `/admin#nota=<id>`. The
    existing details dialog shows the status, the notices and the PDF link.
  - When the answer is Rejeitada (422), the form stays on `/admin/emitir` with the government's errors (code, message,
    detail) and the fields kept. Resubmitting the same id after fixing the data resends it, because the API re-sends a
    rejected id with the new request.
  - When the answer is a 400 validation error, the form stays with the message shown and the fields kept.
- **D-09:** When the typed id **already belongs to an Emitida, Cancelada or Substituída nota**, the API returns that
  nota and ignores the new fields. The panel treats this as "already issued":
  - it goes to that nota's details with a short notice: "Esta nota já foi emitida com este id.";
  - there is no pre-check with `GET` before submitting.

  The planner decides how to detect it, for example by comparing the answer's `createdAt` with the submit time, or by
  comparing the answer with the request.
- **D-10:** **"Tentar de novo" in the details dialog** for Pendente and Sem resposta notas.
  - It resends `POST /v1/notas` with the same `id` and the nota's stored `request`, as returned by `GET /v1/notas/:id`.
    The server then checks the DPS before sending again, so it never issues twice.
  - The dialog and the list row refresh from the answer.
  - This replaces Phase 2's "text only" notice (Phase 2, D-16a); the notice text stays.

### Cancel flow
- **D-11:** **"Cancelar" appears only for Emitida notas, in two places**: in the details dialog and as an action in each
  list row or card.
  - The row action is a link to `#nota=<id>&cancelar`, which opens the same details dialog with the cancel form
    already showing. There is one cancel UI.
  - The hash parsing from Phase 2 (`parseNotaHash`) must accept the extra `cancelar` flag. Closing the dialog clears it.
- **D-12:** **Choosing the reason**:
  - A select offers the API's codes with pt-BR labels: `1` Erro na emissão, `2` Serviço não prestado, `9` Outros.
  - A text field is pre-filled with a suggested pt-BR sentence for the chosen code and stays editable. For code 2, for
    example: "Serviço não prestado; valor devolvido ao cliente".
  - The 15 to 255 character limit is checked in the browser before sending.
  - The body is `{ reasonCode, reason }`.
- **D-13:** **The confirmation step**:
  - Clicking Cancelar shows the reason form inside the dialog, with a summary of the nota (number, client, value) and a
    distinct, danger-styled "Confirmar cancelamento" button.
  - **Nothing is sent before that click.** The button is disabled while the request is in flight.
  - A "Voltar" button closes the form without sending.
- **D-14:** **After the cancellation is sent**:
  - 200: the dialog re-renders as Cancelada, and the matching list row behind it updates in place. The pages added by
    "Carregar mais" stay.
  - 422: the dialog shows "Erros no cancelamento" from `cancelErrors`, which Phase 2 already renders.
  - 502 (the government did not answer): a pt-BR "try again" message, with the form kept.
  - 409 or 404: the API's message, in pt-BR wording.

### Duplicate
- **D-15:** **Any nota can be duplicated, whatever its status**, including Rejeitada (to fix and reissue under a new id)
  and Cancelada (to reissue after cancelling a wrong one).
  - A nota whose taker is abroad, or that has export data, is duplicated without that part, with a pt-BR notice, since
    the form is Brazil only (D-03).
- **D-16:** **What carries over**: the taker (CPF/CNPJ, name, email, phone), service code, NBS code, description and
  value.
  - The **id is a new `painel-…`** one.
  - The **competence resets to today**.
  - The duplicate **never sends `replaces`** and is a separate nota (ROADMAP criterion 4). Replacement stays PANEL-06.
- **D-17:** **"Duplicar" appears in the details dialog and in each list row or card**. It goes to
  `/admin/emitir?de=<id>`.
  - The form fetches `GET /v1/notas/<id>`, fills itself, then writes its own new id into the URL with `replaceState`,
    for example `/admin/emitir?de=<id>&id=painel-…`. A reload then keeps the same new id and does not create a third
    one.
  - An unknown `de` shows "Nota não encontrada." and an empty form.

### Decided after research (2026-11-22)
- **D-18:** **Serialize `issue` and `cancel` per id on the server.** Research reproduced two concurrent
  `POST /v1/notas` calls with the same id sending the DPS twice. Phase 3 adds a per-id lock in `src/notas.ts`, keyed by
  the shared `repo` (not inside the per-request `createNotas` object), plus a concurrency regression test that asserts
  one `sendDps`. This is internal behavior with no `/v1` contract change. It assumes one Node process owns the SQLite
  file (research assumption A5).
- **D-19:** **With a status filter active, a row whose status no longer matches after a cancel or retry is removed
  from the list.** Without a filter, the row is patched in place (D-14).

### Claude's Discretion
- How the panel code is split, for example `panel.js` plus `emitir.js` plus shared helpers in `format.js`. Pure helpers
  should be unit-tested like `src/panel/format.test.ts`. No build step. All API strings go into the DOM with
  `textContent`.
- The browser-side validation that mirrors `parseIssueRequest`, and how `/v1`'s English 400 messages (for example
  `taker.taxId: …`) are shown in pt-BR next to the right field. A mapping by field prefix is fine.
- The CPF and CNPJ input masks and check-digit validation: helpful, but the API's digit-count check is the authority.
- The list row layout with up to three actions (PDF, Cancelar, Duplicar) on desktop and on stacked mobile cards. Styles
  go in `/panel.css`.
- The exact pt-BR suggested reason texts for codes 1 and 9.
- How the row in the list updates after a cancellation or retry: re-render one row by id, or patch it.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/REQUIREMENTS.md`: ACT-01, ACT-02, ACT-03.
- `.planning/ROADMAP.md` § Phase 3: the 4 success criteria.
- `.planning/PROJECT.md`:
  - § Core Value: exactly one nota per sale;
  - § Constraints: no build step, `API_TOKEN` never reaches the browser, pt-BR UI;
  - § Context: the CONCERNS.md double-issue paths.

### Prior phases
- `.planning/phases/01-admin-password-and-login/01-CONTEXT.md`:
  - D-05: on 401, the JS sends the browser to `/login`;
  - D-11, D-12: `hono/html`, Pico, SRI;
  - D-16: CSRF token in a meta tag, sent as `X-CSRF-Token`;
  - D-18, D-19: session scope and the Bearer token taking priority.
- `.planning/phases/02-notas-panel/02-CONTEXT.md`:
  - D-01: same-origin script, CSP;
  - D-09: pt-BR status labels;
  - D-10: mobile cards;
  - D-13, D-14: the details `<dialog>` and the `#nota=<id>` hash;
  - D-15, D-16: details sections and error boxes;
  - D-16a: the Pendente notice, now gaining a retry.

### Code to follow and extend
- `src/app.ts`:
  - `POST /v1/notas`: statuses map to 200 issued/canceled/replaced, 202 pending/unknown and 422 rejected; a 400
    returns `{ error }`;
  - `POST /v1/notas/:id/cancel`: `reasonCode` `1`/`2`/`9` and `reason`; 200 when canceled, 422 with `cancelErrors`;
  - `GET /v1/notas/:id`;
  - `view()`, which gives the shape returned.
- `src/request.ts`: `parseIssueRequest`, the validation rules and messages the form must satisfy.
- `src/notas.ts`:
  - `issue`: idempotent on `id`. An issued id returns the existing nota; a rejected or pending id is re-sent with the
    new request; an unknown id checks the DPS first;
  - `cancel`: 409 unless issued; 502 when the government is unreachable; "already canceled" is treated as success;
  - `IssueRequest`.
- `src/dps.ts`: `CancellationInput` (`xMotivo` is 15 to 255 characters) and the `Taker` type.
- `src/admin.ts`: `layout`, `adminPage`, `PAGE_CSP`, `PANEL_CSS` and `/panel.css`, the `/admin/panel.js` route
  pattern, the session guard and the CSRF meta tag.
- `src/panel/panel.js` and `src/panel/format.js`: `api()`, the dialog, `sync()` with the URL, `parseNotaHash` and
  `notaHash`, `renderRow` and the generation counters.
- `src/session.ts`: how the CSRF token is checked on POST.
- Tests: `src/admin.test.ts`, `src/appSession.test.ts`, `src/panel/format.test.ts` and `scripts/panel-smoke.mjs`
  (headless Chrome).
- `.planning/codebase/CONCERNS.md`: the two double-issue paths (concurrent retries, and a 2xx answer without an access
  key). These are relevant to D-07 and D-10.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `api()` in `panel.js`: a cookie-only fetch that handles 401. It needs a POST variant that adds `X-CSRF-Token`
  and a JSON body, and that returns the 4xx/422 body instead of throwing on it.
- `format.js`:
  - `formatBrl`, `takerCell`, `statusLabel`;
  - `errorBoxes`, which already renders `errors` and `cancelErrors`;
  - `notaHash` and `parseNotaHash`, which need the `cancelar` flag;
  - `statusNotice`.
- `layout()` and the header from `adminPage()`, which `/admin/emitir` can reuse.

### Established Patterns
- Server-rendered shells with `hono/html`, plus a same-origin ES module that fills them. There is no inline JS or CSS.
- The URL is the single source of truth: `sync()` drives the dialog from the hash. The new `?id=` and `?de=` parameters
  on `/admin/emitir` follow the same idea.
- Generation counters drop stale responses. Reuse them for the cancel and retry requests.

### Integration Points
- New page route `GET /admin/emitir`, and the script for it, under the existing `/admin/*` guard.
- The details dialog footer gains Cancelar, Duplicar and, for Pendente or Sem resposta, Tentar de novo.
- List rows or cards gain the Cancelar link (Emitida only) and the Duplicar link.
- `/v1` needs no change. Both POST routes already accept the session with CSRF.

</code_context>

<specifics>
## Specific Ideas

- It should feel like the existing panel: one header, Pico classless, short pt-BR text.
- The cancel button should look dangerous and never fire on the first click.
- A duplicate is "the same sale again": same client and service, today's date, new id.

</specifics>

<deferred>
## Deferred Ideas

- **Takers abroad and the export group in the issue form.** The API supports them, but they were left out (D-03).
  Duplicating such a nota drops that part with a notice.
- **Replacing a nota from the panel**, sending `replaces` (PANEL-06, v2).
- **Listing notas from the government side**, which the background research covered. The government has no list
  endpoint. The only route is copying the ADN distribution feed (`GET /contribuintes/DFe/{NSU}` on the ADN hosts, mTLS
  with the same A1 certificate, 50 documents per page, wait at least 1 h once caught up) into new local tables. That is
  a new capability for a future phase.
- **Concern for the backlog, not this phase:** the government's DANFSe API (`GET adn…/danfse/{chave}`, used in
  `src/notas.ts` `pdf()`) was switched off on 03/08/2026, according to NT 008 v1.02. Every PDF now falls back to the
  local renderer, possibly after a wait of up to 30 s. Removing the call, and checking the local layout against NT 008,
  is worth its own quick task.

</deferred>

---

*Phase: 03-nota-actions*
*Context gathered: 2026-11-21*
