# Phase 3: Nota Actions - Research

**Researched:** 2026-11-21
**Domain:** Browser-side issue / cancel / retry / duplicate flows on a no-build Hono + vanilla-ES-module panel, over an idempotent fiscal API
**Confidence:** HIGH (almost everything is in-repo code read this session and probed with scripts; two external facts are MEDIUM)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Issue form**
- **D-01:** The form lives on **its own page, `/admin/emitir`**.
  - It is server-rendered with the same `layout()` shell and header as `/admin`, so it sits behind the existing `/admin/*` session guard and `pageHeaders`.
  - Its behavior is a same-origin module, for example `/admin/emitir.js`, or a shared module. The CSP has no inline script and no inline style.
  - `/admin` gets an "Emitir nota" link to `/admin/emitir`.
- **D-02:** The form **submits with JS `fetch` to `POST /v1/notas`**, sending JSON with the session cookie and `X-CSRF-Token` read from the `<meta name="csrf-token">`, as the roadmap says.
  - Fields are kept on failure.
  - The submit button is disabled while the request is in flight, which covers the double click.
  - A 401 sends the browser to `/login` (Phase 1, D-05).
- **D-03:** The **taker is Brazil only and optional**: CPF or CNPJ plus name, with email and phone optional; or no taker at all, which the API allows. There are no foreign-taker or export fields in the form.
- **D-04:** **Service code (6 digits, cTribNac), NBS code (9 digits, optional) and description are plain fields.** The browser remembers the last values used (`localStorage`, wrapped in try/catch) and pre-fills them in a new empty form, because most issuers sell the same few services.
- **D-05:** **The value is typed as Brazilian currency** (`1.234,56`, with or without `R$`). It is converted to an integer `valueCents` in the browser and must be greater than 0. **Competence is a date input that starts on today in Brasília time** (`America/Sao_Paulo`) and can be changed. It is sent as `YYYY-MM-DD`.

**Id, idempotency and resubmit**
- **D-06:** The **suggested id is `painel-AAAAMMDD-xxxxxx`**: today's date in Brasília time plus a random suffix of 6 characters from `[a-z0-9]`, made with `crypto.getRandomValues`. The field can be edited, for example to type the seller's own sale number. The API's limit is 1 to 200 characters.
- **D-07:** **The id lives in the URL so a reload never makes a second nota.**
  - Opening `/admin/emitir` without `?id=` generates an id and writes it with `history.replaceState` to `/admin/emitir?id=painel-…`.
  - A reload, or reopening that URL, keeps the same id, so a resubmit returns the nota already issued (ROADMAP criterion 2).
  - Editing the id field updates the URL.
  - Each fresh "Emitir nota" click from `/admin` gets a new id.
- **D-08:** **Where the result shows**:
  - When the answer is Emitida (200), Pendente or Sem resposta (202), the browser goes to `/admin#nota=<id>`. The existing details dialog shows the status, the notices and the PDF link.
  - When the answer is Rejeitada (422), the form stays on `/admin/emitir` with the government's errors (code, message, detail) and the fields kept. Resubmitting the same id after fixing the data resends it, because the API re-sends a rejected id with the new request.
  - When the answer is a 400 validation error, the form stays with the message shown and the fields kept.
- **D-09:** When the typed id **already belongs to an Emitida, Cancelada or Substituída nota**, the API returns that nota and ignores the new fields. The panel treats this as "already issued": it goes to that nota's details with a short notice: "Esta nota já foi emitida com este id."; there is no pre-check with `GET` before submitting. The planner decides how to detect it, for example by comparing the answer's `createdAt` with the submit time, or by comparing the answer with the request.
- **D-10:** **"Tentar de novo" in the details dialog** for Pendente and Sem resposta notas.
  - It resends `POST /v1/notas` with the same `id` and the nota's stored `request`, as returned by `GET /v1/notas/:id`. The server then checks the DPS before sending again, so it never issues twice.
  - The dialog and the list row refresh from the answer.
  - This replaces Phase 2's "text only" notice (Phase 2, D-16a); the notice text stays.

**Cancel flow**
- **D-11:** **"Cancelar" appears only for Emitida notas, in two places**: in the details dialog and as an action in each list row or card.
  - The row action is a link to `#nota=<id>&cancelar`, which opens the same details dialog with the cancel form already showing. There is one cancel UI.
  - The hash parsing from Phase 2 (`parseNotaHash`) must accept the extra `cancelar` flag. Closing the dialog clears it.
- **D-12:** **Choosing the reason**:
  - A select offers the API's codes with pt-BR labels: `1` Erro na emissão, `2` Serviço não prestado, `9` Outros.
  - A text field is pre-filled with a suggested pt-BR sentence for the chosen code and stays editable. For code 2, for example: "Serviço não prestado; valor devolvido ao cliente".
  - The 15 to 255 character limit is checked in the browser before sending.
  - The body is `{ reasonCode, reason }`.
- **D-13:** **The confirmation step**:
  - Clicking Cancelar shows the reason form inside the dialog, with a summary of the nota (number, client, value) and a distinct, danger-styled "Confirmar cancelamento" button.
  - **Nothing is sent before that click.** The button is disabled while the request is in flight.
  - A "Voltar" button closes the form without sending.
- **D-14:** **After the cancellation is sent**:
  - 200: the dialog re-renders as Cancelada, and the matching list row behind it updates in place. The pages added by "Carregar mais" stay.
  - 422: the dialog shows "Erros no cancelamento" from `cancelErrors`, which Phase 2 already renders.
  - 502 (the government did not answer): a pt-BR "try again" message, with the form kept.
  - 409 or 404: the API's message, in pt-BR wording.

**Duplicate**
- **D-15:** **Any nota can be duplicated, whatever its status**, including Rejeitada (to fix and reissue under a new id) and Cancelada (to reissue after cancelling a wrong one). A nota whose taker is abroad, or that has export data, is duplicated without that part, with a pt-BR notice, since the form is Brazil only (D-03).
- **D-16:** **What carries over**: the taker (CPF/CNPJ, name, email, phone), service code, NBS code, description and value.
  - The **id is a new `painel-…`** one.
  - The **competence resets to today**.
  - The duplicate **never sends `replaces`** and is a separate nota (ROADMAP criterion 4). Replacement stays PANEL-06.
- **D-17:** **"Duplicar" appears in the details dialog and in each list row or card**. It goes to `/admin/emitir?de=<id>`.
  - The form fetches `GET /v1/notas/<id>`, fills itself, then writes its own new id into the URL with `replaceState`, for example `/admin/emitir?de=<id>&id=painel-…`. A reload then keeps the same new id and does not create a third one.
  - An unknown `de` shows "Nota não encontrada." and an empty form.

### Claude's Discretion
- How the panel code is split, for example `panel.js` plus `emitir.js` plus shared helpers in `format.js`. Pure helpers should be unit-tested like `src/panel/format.test.ts`. No build step. All API strings go into the DOM with `textContent`.
- The browser-side validation that mirrors `parseIssueRequest`, and how `/v1`'s English 400 messages (for example `taker.taxId: …`) are shown in pt-BR next to the right field. A mapping by field prefix is fine.
- The CPF and CNPJ input masks and check-digit validation: helpful, but the API's digit-count check is the authority.
- The list row layout with up to three actions (PDF, Cancelar, Duplicar) on desktop and on stacked mobile cards. Styles go in `/panel.css`.
- The exact pt-BR suggested reason texts for codes 1 and 9.
- How the row in the list updates after a cancellation or retry: re-render one row by id, or patch it.

### Deferred Ideas (OUT OF SCOPE)
- **Takers abroad and the export group in the issue form.** The API supports them, but they were left out (D-03). Duplicating such a nota drops that part with a notice.
- **Replacing a nota from the panel**, sending `replaces` (PANEL-06, v2).
- **Listing notas from the government side** (ADN distribution feed into new local tables): a new capability for a future phase.
- **Concern for the backlog, not this phase:** the government's DANFSe API (`GET adn…/danfse/{chave}`, used in `src/notas.ts` `pdf()`) was switched off on 03/08/2026 (NT 008 v1.02); worth its own quick task.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACT-01 | Admin can issue a nota from a form (id, client, service code, description, value, competence) that posts to `POST /v1/notas`, and sees the result or the validation and government errors | `/admin/emitir` page + `emitir.js`; status-code map (200/202/422/400/401/403); BRL parser, Brasília date and id helpers; resubmit idempotency (id in URL); "already issued" detection by `updatedAt` vs the `Date` header; **per-id server lock** (race confirmed by probe) |
| ACT-02 | Admin can cancel an issued nota, choosing the reason, after a confirmation step, through `POST /v1/notas/:id/cancel` | Cancel form inside the existing dialog, `#nota=<id>&cancelar` hash flag, status mapping 200/422/502/409/404/400/403, in-place row update, retry for Pendente/Sem resposta (D-10) incl. the `replaces` round-trip trap |
| ACT-03 | Admin can duplicate a nota, which opens the issue form filled with that nota's data and a new suggested `id` | `/admin/emitir?de=<id>`: `GET /v1/notas/:id`, `prefillFromNota()` dropping abroad taker/export/replaces, new id written with `replaceState` |
</phase_requirements>

## Summary

Phase 3 needs **no new package and no change to the `/v1` contract**. Both write routes already accept the session cookie plus `X-CSRF-Token` (AUTH-05, covered by `src/appSession.test.ts`). The work is: one new server-rendered page and a header link in `src/admin.ts`; new browser ES modules registered in `PANEL_SCRIPTS`; extensions to the Phase 2 dialog and rows in `panel.js`/`format.js`; CSS in `PANEL_CSS`; and tests (vitest for pure helpers and route shells, headless-Chrome smoke for behavior). The baseline is green: `pnpm test` 291 passed / 1 skipped, `pnpm run typecheck` clean, `scripts/panel-smoke.mjs` 24 passed (Chrome is at `/usr/bin/google-chrome`).

**One finding changes the plan's scope.** The roadmap's core guarantee ("without ever causing a second nota for the same sale", criterion 2 "double click, reload") is **not met by the server today** for a reload while the first request is still waiting on the government. I reproduced it with a probe: two concurrent `POST /v1/notas` with the same `id` against a gov stub that takes 200 ms produced **two `sendDps` calls, DPS numbers 1 and 2, both answered 200**, one stored row. This is the CONCERNS.md "Concurrent requests with the same id can issue twice" bug, and it is now reachable from the panel (reload during the up-to-30 s government wait, a second tab, or a second device on the same URL). The button-disabled guard (D-02) only covers a click in the same page. The fix is small and contract-neutral (serialize `issue` and `cancel` per id inside `createNotas`); I recommend including it as a Wave 1 task. It is the only server-logic change recommended.

Two other things the planner must know up front: (1) D-10's "resend the stored `request`" **fails with 400** for a nota that replaces another one, because the stored `replaces` carries both `id` and `accessKey` and the parser demands exactly one (reproduced); (2) D-09's suggested detection by `createdAt` is **wrong** for a Rejeitada/Pendente/Sem-resposta nota that gets issued on resubmit, because `createdAt` is kept from the first attempt. Use `updatedAt` compared against the server's `Date` response header (both verified below).

**Primary recommendation:** Build `src/panel/{api,form,dom}.js` (+ `.d.ts`, + vitest) as small testable modules, add `emitir.js`, extend `panel.js`/`format.js`, add the per-id lock in `src/notas.ts`, and extend `scripts/panel-smoke.mjs` with a programmable gov stub to prove criteria 1-4 in a real browser.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Issue form UI, field validation, BRL to cents, Brasília date, id suggestion | Browser / Client | Frontend Server (shell only) | Behavior is a same-origin ES module (D-01, D-02); the server only renders the empty shell behind the session guard |
| `/admin/emitir` page shell, header link, script serving | Frontend Server (Hono, `src/admin.ts`) | — | Same `layout()`, `pageHeaders`, `/admin/*` guard as `/admin` |
| Idempotency by `id` (one nota per sale) | API / Backend (`src/notas.ts issue`) | Browser (id kept in URL) | The server is the authority; the browser only keeps the id stable across reloads |
| Per-id serialization of concurrent issue/cancel | API / Backend (`createNotas`) | — | Must live where the read-then-send race happens; a browser guard cannot see a second tab |
| Authentication, CSRF on POST | API / Backend (`requireAuth`, `src/session.ts`) | Browser (sends meta token) | Already built (Phase 1); Phase 3 only consumes it |
| "Already issued" notice | Browser | API (supplies `updatedAt`, `Date` header) | D-09 forbids a pre-check GET; decided from the response |
| Cancel reason choice, confirmation, nothing-sent-before-confirm | Browser | API (validates `reasonCode`; pads `reason`) | Confirmation is pure UI state; the server cannot know a click was confirmed |
| Cancel/issue government calls, DPS checks | API / Backend (`notas.ts`, `gov.ts`) | — | Unchanged |
| Duplicate prefill | Browser (`GET /v1/notas/:id` then fill) | — | No server support needed |
| Row/dialog refresh after an action | Browser (`panel.js`) | — | Update from the POST answer, no list reload |
| pt-BR error wording for English 400s | Browser | — | `/v1` messages stay English for Bearer clients |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono + `hono/html` | `^4.13.18` (in `package.json`) | Server-rendered `/admin/emitir` shell | Already the panel's renderer; `html` escapes interpolations [VERIFIED: package.json, src/admin.ts:5] |
| Vanilla ES modules (no build) | — | `emitir.js`, `api.js`, `form.js`, `dom.js` | Locked project constraint: no build step [VERIFIED: .planning/REQUIREMENTS.md "Frontend build step or framework" out of scope] |
| Pico.css classless | 2.1.1 (CDN, SRI) | Form and dialog styling | Already pinned in `layout()` [VERIFIED: src/admin.ts:27-28] |
| vitest | `^5.1.0` | Unit tests of pure helpers, route shells | Existing runner [VERIFIED: package.json] |
| Headless Chrome over CDP | `/usr/bin/google-chrome` present | End-to-end of the four criteria | Existing `scripts/panel-smoke.mjs` harness (24 checks pass) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Browser `Intl.DateTimeFormat` (`en-CA`/`formatToParts`, `America/Sao_Paulo`) | built-in | Brasília "today" for competence and id | Always; never `Date#toISOString().slice(0,10)` (UTC shifts the day after 21:00 Brasília) |
| `crypto.getRandomValues` | built-in | Id suffix | Works on plain-HTTP installs; `crypto.randomUUID` does not [CITED: developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues: "getRandomValues() is the only member of the Crypto interface which can be used from an insecure context"] |
| `localStorage` in try/catch | built-in | D-04 service defaults | Store only serviceCode, nbsCode, description; never taker, value or tokens |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-id in-process lock | `INSERT ... ON CONFLICT DO NOTHING` reservation in SQLite | A DB reservation also covers multiple processes, but this app is one Node process on one SQLite file and the reservation needs a schema/`Repo` interface change; the lock is ~15 lines. Recommend the lock |
| `updatedAt` vs `Date` header for "already issued" | A new response header from the API (for example `X-Nota-Existing`) | Cleaner, but touches the `/v1` response surface that CONTEXT says not to change. Use the client-side rule |
| `crypto.randomUUID()` for ids | `getRandomValues` | randomUUID needs a secure context; local installs run on plain HTTP (cookie `Secure` is HTTPS-only) |

**Installation:** none. No package is added.

**Version verification:** n/a, no external package. The existing devDependency versions come from `package.json` and the lockfile is untouched.

## Package Legitimacy Audit

No external packages are installed by this phase, so the audit does not apply. `research-plan`/`package-legitimacy` seam calls were skipped for that reason; the domain is entirely in-repo plus browser built-ins.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                        /admin (list)                              /admin/emitir (form)
 link "Emitir nota" ──► GET /admin/emitir ──► [session guard + pageHeaders] ──► shell (header, form, meta csrf)
 row/dialog "Duplicar"──► GET /admin/emitir?de=<id>                                 │ script: /admin/emitir.js (module)
                                                                                    ▼
   emitir.js boot:  id := ?id  or  suggestId()  ──replaceState──► ?id=painel-…   (reload keeps id)
                    ?de=<id> ──► GET /v1/notas/<id> ──► prefillFromNota() (drops abroad/export/replaces, notice)
                    else      ──► localStorage defaults (service, NBS, description)
                                                                                    │ submit (flag + disabled button)
                                                                                    ▼
   validateForm() ──fail──► field errors (pt-BR), nothing sent
        │ ok
        ▼
   api.request('POST','/v1/notas', body)  [cookie + X-CSRF-Token from <meta>]
        │
        ├─ 401 ─────────► location.assign('/login')
        ├─ 403 ─────────► "sessão mudou, recarregue" (stale CSRF; same id kept in URL)
        ├─ 400 {error} ─► map prefix → pt-BR next to field, fields kept
        ├─ 422 rejected ► errorBoxes(nota) in form, fields kept, same id resendable
        ├─ network/5xx ─► "não foi possível confirmar; reenvie com o mesmo id" (safe: idempotent)
        └─ 200 / 202 ───► isAlreadyIssued(nota, Date header, elapsed)? ──► location.replace('/admin#nota=<id>' [+ notice])
                                                                                    │
 SERVER:  POST /v1/notas ─► withLock(repo,id) ─► issue(): get ─► (issued|canceled|replaced → return as is)
                                                          └─► pending/rejected/unknown → send → gov ─► save
 /admin#nota=<id>[&cancelar]  (panel.js dialog)
   GET /v1/notas/<id> ─► renderNota ─► footer actions by status:
        issued          → Cancelar (opens reason form, nothing sent) · Duplicar · PDF
        pending/unknown → Tentar de novo (POST /v1/notas, request minus replaces.accessKey) · Duplicar
        any             → Duplicar
   Confirmar cancelamento ─► POST /v1/notas/<id>/cancel {reasonCode, reason}
        200 → dialog = Cancelada + row patched in place · 422 → cancelErrors box · 502/409/404/400/403 → pt-BR message, form kept
```

### Recommended Project Structure
```
src/
├── admin.ts                 # + panelHeader() extracted, emitirPage(), GET /admin/emitir, PANEL_SCRIPTS list, "Emitir nota" link, CSS
├── notas.ts                 # + per-id lock around issue() and cancel()
└── panel/
    ├── format.js (+ .d.ts)  # + parseCancelFlag, notaHash(id,{cancelar}), reason labels, statusNotice stays
    ├── api.js    (+ .d.ts)  # createApi({fetch, csrf, redirect}): request() returns {status, body, date, elapsedMs}; GET api() kept
    ├── dom.js    (+ .d.ts)  # text(), errorSection(box): shared by panel.js and emitir.js (textContent only)
    ├── form.js   (+ .d.ts)  # PURE: parseBrl, formatBrlInput, brasiliaToday, suggestId, validateForm, buildIssueBody,
    │                        #   prefillFromNota, retryBody, isAlreadyIssued, issueErrorMessage, cancelDefaults, cpf/cnpj digits
    ├── emitir.js            # DOM: boot, submit, result handling
    ├── panel.js             # + row actions, dialog footer actions, cancel form, retry, row patch
    └── *.test.ts            # form.test.ts, api.test.ts, + additions to format.test.ts
scripts/panel-smoke.mjs      # + scenario with programmable gov stub; update the assertions listed in Pitfall 9
```

### Pattern 1: Status-aware POST helper (never throws on HTTP errors)
**What:** One `request(method, path, body)` that returns `{ status, body, date, elapsedMs }` for every HTTP answer (4xx and 422 included), throws only on network failure, and handles 401 exactly like the current `api()`.
**When to use:** issue, retry, cancel.
**Example:**
```js
// Source: derived from src/panel/panel.js:34-42 (existing api) and src/app.ts:95 (csrf contract)
export const createApi = ({ fetch, csrf, redirect }) => ({
  async request(method, path, payload) {
    const started = Date.now()
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(payload === undefined ? {} : { 'content-type': 'application/json' }), ...(method === 'GET' ? {} : { 'x-csrf-token': csrf() }) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    })
    if (res.status === 401) { redirect('/login'); throw new Error('unauthorized') }
    const body = await res.json().catch(() => null) // a proxy 502 can be HTML
    return { status: res.status, body, date: res.headers.get('date'), elapsedMs: Date.now() - started }
  },
})
```

### Pattern 2: "Already issued" from the response, no pre-check (D-09)
**What:** `issue()` returns an existing issued/canceled/replaced nota **without saving it**, so its `updatedAt` stays old; any path that really issued in this call saved it, so `updatedAt` is at or after the request start. The request start on the server clock is `Date header - elapsedMs` (elapsed measured in the browser, so no client/server clock skew).
**Example:**
```js
// Source: src/notas.ts:225-226 (early returns, no save), :136 (markIssued saves via save()), probe 2026-11-21 (Date header present)
export const isAlreadyIssued = (nota, { date, elapsedMs }) => {
  if (!['issued', 'canceled', 'replaced'].includes(nota.status)) return false
  const serverNow = Date.parse(date ?? '')
  if (Number.isNaN(serverNow)) return false // fail soft: just show the nota
  return Date.parse(nota.updatedAt) < serverNow - elapsedMs
}
```
The `Date` header has 1 s resolution (floor), so `serverNow` is at most 1 s low, which only makes the test more conservative: a freshly issued nota is never misclassified. A resubmit within the same second of the first can show no notice; that is harmless (identical nota).

### Pattern 3: URL as the single source of truth for the dialog (extends Phase 2)
`#nota=<id>` opens the dialog; `#nota=<id>&cancelar` opens it with the cancel form. `URLSearchParams('nota=x&cancelar').get('nota')` already returns `x`, so `parseNotaHash` keeps working; add a separate `parseCancelFlag(hash)` and track `view.cancel` in `sync()` so toggling the flag re-renders without refetching. "Voltar" and closing use `history.replaceState` (as the existing close handler does) so the history does not fill with entries.

### Pattern 4: Per-id serialization in `createNotas`
**What:** a `WeakMap<Repo, Map<string, Promise<unknown>>>` chain so concurrent `issue`/`cancel` for one id run one after the other. `createNotas` is called per request (`const notas = () => createNotas(...)`, src/app.ts:50), so the lock cannot live inside the returned object; key it by the shared `repo`.
```ts
// Source: probe 2026-11-21; src/app.ts:50 shows notas() is rebuilt per request
const locks = new WeakMap<Repo, Map<string, Promise<unknown>>>()
const serialized = <T>(repo: Repo, id: string, fn: () => Promise<T>): Promise<T> => {
  const chain = locks.get(repo) ?? locks.set(repo, new Map()).get(repo)!
  const run = (chain.get(id) ?? Promise.resolve()).catch(() => undefined).then(fn)
  const tail = run.finally(() => { if (chain.get(id) === tail) chain.delete(id) })
  chain.set(id, tail)
  return run
}
```
Wrap the body of `issue` and `cancel` (`serialized(repo, request.id, ...)`). Test: two concurrent `issue` of one id with a slow gov stub must call `sendDps` once and return the same nota (the probe shows 2 calls today).

### Anti-Patterns to Avoid
- **Deciding "already issued" from `createdAt`:** `issue()` keeps `createdAt` when it re-sends a rejected/pending/unknown nota (`{ ...existing, ... }`, src/notas.ts:234), so a retried-then-issued nota would show a false "já foi emitida". Use `updatedAt`.
- **A `<form>` inside `#nota-body` for the cancel reason without updating the smoke selectors:** `document.querySelector('#nota-dialog form button')` in `scripts/panel-smoke.mjs` (lines 634, 767) matches the first form button in document order, which would become the cancel form's button because `#nota-body` precedes the footer. Either scope those selectors to `#nota-dialog footer form button` or render the reason UI without a nested `<form>`.
- **Generating the id on submit:** it must exist before the first submit and live in the URL (D-07); never regenerate on a failed submit.
- **Dropping the row update when the dialog moved on:** the generation counter must retire only the *dialog render* of a stale response, not the *row patch*. A cancel that succeeded changed fiscal state whether or not the admin still looks at that dialog.
- **Floats for money:** `Math.round(parseFloat(x) * 100)` is avoidable; parse the digit string.
- **Putting taker data in the URL:** only the id (`?id=`) and the source nota id (`?de=`) belong in the query string.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Brasília calendar day | `new Date()` arithmetic with `-3h` | `Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'})` (or `formatToParts`) | Verified: `2026-11-21T02:30:00Z` formats as `2026-11-20`; `format.js` already uses the same timezone approach |
| Random id suffix | `Math.random()` | `crypto.getRandomValues` with rejection sampling (accept bytes `< 252`, then `% 36`) | 256 mod 36 = 4 would bias the first 4 characters; trivial to avoid |
| Currency text to cents | float math | string parse of `^\d{1,3}(\.\d{3})*(,\d{1,2})?$` or `^\d+(,\d{1,2})?$` after stripping `R$` and (non-breaking) spaces | Float `19.9*100` is `1990.0000000000002`; and `1.234` must not silently mean 1,234 reais |
| Cancel/issue request dedupe | A client-side queue | Server per-id lock + idempotent `issue()` | The only place that sees every tab and device |
| Escaping API strings | `innerHTML` with manual escaping | `textContent` (existing `text()` helper) | Project rule; smoke tests assert a hostile `<img onerror>` stays text |
| Session/CSRF | New token logic | Existing `csrfToken` + `<meta name="csrf-token">` | Phase 1 contract; POST routes already enforce it |
| Government error rendering | A second renderer | Extract the existing `errorBoxes` + section builder from `renderNota` into `dom.js` and reuse it on the form | One look, one escaping path |

**Key insight:** every fiscal guarantee in this phase is a server guarantee (idempotent `issue`, per-id lock). The browser's job is to make the id stable (URL), never send before confirmation, and report honestly when it cannot confirm the answer.

## Common Pitfalls

### Pitfall 1: Concurrent same-id requests issue twice (confirmed)
**What goes wrong:** Reload (or second tab/device) while the first `POST /v1/notas` is still waiting on the government makes a second request that also sees no nota, reserves another DPS number and sends again. **Probe result:** `RACE statuses [200,200] sendDps calls 2 notas 1`, DPS numbers 1 and 2.
**Why it happens:** `issue()` is `get` then (`nextNumber` + `save`) then `send`, all `await`s, with no mutual exclusion; `createNotas` is rebuilt per request so there is no shared state [VERIFIED: src/notas.ts:223-239, src/app.ts:50].
**How to avoid:** Pattern 4 (per-id lock) plus a vitest regression test; keep the disabled-button guard as defense in depth.
**Warning signs:** two DPS numbers for one `id`; two `nfse: issue` log lines within seconds.

### Pitfall 2: Retry with the stored `request` returns 400 when the nota has `replaces`
**What goes wrong:** `issue()` stores `replaces: { id, reasonCode, accessKey }` (it adds `accessKey` after resolving the id). Posting that stored request back fails `parseReplaces` with `replaces: id or accessKey, one of the two`. **Probe:** first post 202, retry with the stored request 400 `{"error":"replaces: id or accessKey, one of the two"}`.
**How to avoid:** `retryBody(nota)`: copy `nota.request`; if `replaces.id` is set, delete `replaces.accessKey`. Panel-issued notas never have `replaces`, but API-created Pendente/Sem-resposta notas shown in the same list can. Unit-test it. (For status `unknown` the server ignores the new body and keeps `existing.request` anyway; for `pending` it uses the new body.)

### Pitfall 3: `createdAt` is the wrong "freshness" signal (D-09)
See Pattern 2 and Anti-Patterns. A rejected nota fixed and resubmitted is issued with its old `createdAt`.

### Pitfall 4: Stale CSRF token after another login (403)
**What goes wrong:** The token in `<meta name="csrf-token">` is bound to the session id at render time (`csrfToken(admin.key, session.id)`). Logging in again in another tab replaces the cookie with a new session id, so the old tab's POST answers `403 {"error":"invalid csrf token"}` [VERIFIED: src/app.ts:95-96, src/session.ts csrfToken]. The same happens after the 12 h expiry (that one is a 401).
**How to avoid:** map 403 to "A sessão mudou. Recarregue a página e envie de novo." with a reload button; the id is in the URL so the reload is safe (same id).

### Pitfall 5: A request whose answer was lost
**What goes wrong:** `fetch` rejects (network, proxy 502 HTML, 5xx) after the server may already have issued.
**How to avoid:** never say "failed". Say: "Não foi possível confirmar o resultado. Envie de novo: o mesmo identificador não gera uma segunda nota." Keep the form, keep the id, re-enable the button. Because `issue()` is idempotent (and now serialized), resubmitting is safe.

### Pitfall 6: 2xx from the government without an access key is stored as `rejected`
**What goes wrong:** `send()` falls through to `govErrors` when `result.status < 300` but `chaveAcesso` is empty, saving `status: 'rejected'` with code `HTTP 200`; the admin then "fixes and resubmits" and `issue()` treats a rejected id as a new request (new DPS number path) [VERIFIED: src/notas.ts:210-213, CONCERNS.md "A nota can be marked rejected when the government actually accepted it"]. Rare, and a server fix (treat as `unknown`) is out of this phase's stated scope.
**How to avoid in the panel:** when a Rejeitada nota's `errors` contain a code matching `/^HTTP 2\d\d$/`, show an extra pt-BR warning ("o governo pode ter emitido esta nota; confira na consulta pública antes de reenviar"). Flag to the planner as optional hardening; fixing `send()` is the real cure.

### Pitfall 7: Backdrop-click handler eats the cancel reason
`dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close() })` closes when a text selection drag starts inside the reason input and is released outside the article (the click target becomes the common ancestor). With a typed reason this loses input. Track `pointerdown`/`mousedown` target and close only if it also started on the dialog. [ASSUMED: standard browser behavior; verify in the smoke run by dragging from the input to the backdrop.]

### Pitfall 8: Silent truncation by the DPS builder
`buildDps` slices without error: `taker.name` to 300, `email` to 80, `description` to 2000 [VERIFIED: src/dps.ts:166, 169, 205]; `cancel` pads a short reason with `.` to 15 and slices to 255 [VERIFIED: src/dps.ts:280]. The form must set `maxlength` (300, 80, 2000, 255) and enforce the reason minimum of 15 itself, otherwise the fiscal document differs from what the admin typed.

### Pitfall 9: Existing tests that Phase 3 must edit (do not discover at execution time)
- `src/admin.test.ts:409-439` asserts the shell: `<th>…PDF</th>` as the last column, six columns, the footer `<form method="dialog"><button>Fechar</button></form>`, `<main id="notas">` carrying exactly one `<script>`. A new column/actions and an `/admin/emitir` page change these.
- `src/admin.test.ts:351-380`: "no page has a class or style attribute", exactly one absolute URL (Pico), and `else expect(body).not.toContain('<script')`: the emitir page (with its own script) needs its own branch.
- `src/admin.test.ts:390-407`: serves `['panel.js','format.js']`; extend with every new module. `PANEL_SCRIPTS` is the allow-list (`['panel.js', 'format.js'].map(...)`, src/admin.ts:197-199); a forgotten new module is a 404 in the browser, not a build error.
- `scripts/panel-smoke.mjs:741-743` asserts that a pending/unknown dialog has only the `Fechar` button and no `<a>` in the body: replace with the new action set. Lines 634 and 767 use `#nota-dialog form button`.
- `src/panel/format.test.ts` covers `parseNotaHash`/`notaHash` (lines 257-270): keep them green; add the flag as new functions, not a changed return type.
- Phase 2 D-16a text "A nota será verificada quando o sistema de origem reenviar este id." stays (CONTEXT D-10) but the smoke assertion about "no buttons" does not.

### Pitfall 10: Midnight edge between competence and `dhEmi`
The server sends `dhEmi` as now minus 60 s (`CLOCK_SKEW_MS`), and the form's competence defaults to today in Brasília [VERIFIED: src/notas.ts:189, 112]. Between 00:00:00 and 00:00:59 Brasília a competence of "today" is later than the DPS emission date, which rule E0015 rejects ("a data de competência informada na DPS deve ser anterior ou igual à data de emissão") [CITED: buscadorncm.com.br/nfse/erros/e0015, third-party mirror of the official Anexo I; MEDIUM]. Effect: a 422 that fixes itself on resubmit one minute later (same id). Cheap mitigation: set `max` on the date input to today and mention E0015 in the 422 display; do not engineer around the minute.

### Pitfall 11: Alphanumeric CNPJ takers cannot be issued through this API
The Receita started issuing alphanumeric CNPJs on 2026-07-31 [CITED: gov.br/fazenda … "receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico"]. The restricted XSD accepts `[0-9A-Z]{14}` for `TSCNPJ` while the production XSD still has `[0-9]{14}` [VERIFIED: schemas/restricted/tiposSimples_v1.01.xsd, schemas/production/tiposSimples_v1.01.xsd]. `parseTaker` strips non-digits (`taxId.replace(/\D/g, '')`, src/request.ts:16), so such a taker would fail or be corrupted. Out of scope (D-03/API). Keep the field digits-only, and say so in one line of help text; add to the backlog.

### Pitfall 12: Empty optional fields must be omitted, not sent as `''`
`phone: ''` fails `taker.phone: 6 to 20 digits` (the check is `phone !== undefined`), while `email: ''` is accepted but meaningless [VERIFIED: src/request.ts:11-14]. `buildIssueBody` must drop empty `email`, `phone`, `nbsCode`, and the whole `taker` when both CPF/CNPJ and name are empty; require both when either is filled (server: `taker.name: required`, `taker.taxId: a CPF or CNPJ…`).

## Code Examples

### Server: the page, the header link and the script allow-list
```ts
// Source: src/admin.ts:197-199, 270-331, 446-453 (existing patterns to extend)
export const PANEL_SCRIPTS = new Map(
  ['panel.js', 'format.js', 'api.js', 'dom.js', 'form.js', 'emitir.js'].map((name) => [name, readFileSync(new URL(`./panel/${name}`, import.meta.url), 'utf8')]),
)
// extract panelHeader(cnpj, environment, csrf) from adminPage(); emitirPage() = layout('Emitir nota – Emissor de NFS-e', html`${panelHeader(...)}<main id="emitir">…</main><script type="module" src="/admin/emitir.js"></script>`, csrf)
app.get('/admin/emitir', (c) => {
  const session = sessionOf(getCookie(c, SESSION_COOKIE))
  if (!session) return c.redirect('/login', 303)
  return c.html(emitirPage(formatCnpj(env.ISSUER_CNPJ), env.NFSE_ENVIRONMENT, csrfToken(key, session.id)))
})
```
The form should carry `method="post"` with no `action`: if the module has not run yet, a native submit would otherwise put taker data in a GET query string; a POST to `/admin/emitir` is a harmless 404.

### Brasília day, id suggestion, BRL parsing (pure, injectable for tests)
```js
// Source: verified with node probe 2026-11-21 (en-CA of 2026-11-21T02:30Z in America/Sao_Paulo → 2026-11-20)
const dayParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
export const brasiliaToday = (now = new Date()) => {
  const p = Object.fromEntries(dayParts.formatToParts(now).map(({ type, value }) => [type, value]))
  return `${p.year}-${p.month}-${p.day}`
}
export const suggestId = (now = new Date(), bytes = (n) => crypto.getRandomValues(new Uint8Array(n))) => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let suffix = ''
  while (suffix.length < 6) for (const b of bytes(12)) if (b < 252 && suffix.length < 6) suffix += alphabet[b % 36]
  return `painel-${brasiliaToday(now).replaceAll('-', '')}-${suffix}`
}
export const parseBrl = (input) => {
  const t = input.replace(/R\$|[\s ]/g, '')
  if (!/^(\d{1,3}(\.\d{3})*|\d+)(,\d{1,2})?$/.test(t)) return undefined // "1234.56" is rejected on purpose (ambiguous)
  const [whole, frac = ''] = t.replaceAll('.', '').split(',')
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 && whole.length <= 13 ? cents : undefined // TSDec15V2 allows 15 digits; stay well inside
}
```
The restricted and production XSD both define `TSDec15V2` with pattern `0|0\.[0-9]{2}|[1-9]{1}[0-9]{0,14}(\.[0-9]{2})?` [VERIFIED: schemas/restricted/tiposSimples_v1.01.xsd:1452], so 13 integer digits is a safe cap.

### Reason defaults and labels (D-12)
```js
export const CANCEL_REASONS = [
  { code: '1', label: 'Erro na emissão', suggestion: 'Nota emitida com erro; será emitida novamente corrigida' },
  { code: '2', label: 'Serviço não prestado', suggestion: 'Serviço não prestado; valor devolvido ao cliente' },
  { code: '9', label: 'Outros', suggestion: 'Cancelamento solicitado pelo emitente' },
]
export const reasonProblem = (text) => { const n = text.trim().length; return n < 15 || n > 255 ? 'O motivo deve ter de 15 a 255 caracteres.' : '' }
```
(Suggestion texts for 1 and 9 are Claude's discretion per CONTEXT; each is at least 15 characters.)

## In-repo contract reference (verbatim, read this session)

| Item | Verbatim | Source |
|------|----------|--------|
| HTTP status per nota status | `const STATUS_CODE: Record<NotaStatus, 200 \| 202 \| 422> = { issued: 200, canceled: 200, replaced: 200, rejected: 422, pending: 202, unknown: 202 }` | src/app.ts:27 |
| Nota statuses | `export type NotaStatus = 'pending' \| 'unknown' \| 'issued' \| 'rejected' \| 'canceled' \| 'replaced'` | src/notas.ts:45 |
| CSRF refusal | `return c.json({ error: 'invalid csrf token' }, 403)` | src/app.ts:96 |
| 401 | `return c.json({ error: 'unauthorized' }, 401)` | src/app.ts:94 |
| Cancel route | `if (body.reasonCode && !['1', '2', '9'].includes(body.reasonCode)) return c.json({ error: 'reasonCode: 1, 2 or 9' }, 400)`; answers `nota.status === 'canceled' ? 200 : 422` | src/app.ts:174, 177 |
| Cancel errors | `throw notaError(404, 'nota not found')`; ``throw notaError(409, `nota is ${nota.status}, not issued`)``; `throw notaError(502, 'government did not answer; try again')`; error body is `{ error }` via `isNotaError` | src/notas.ts:243, 245, 255; src/app.ts:123-125 |
| Cancel is idempotent | `if (nota.status === 'canceled') return nota` | src/notas.ts:244 |
| Issue early returns (no save) | `if (existing?.status === 'issued') return markReplaced(existing)`; `if (existing?.status === 'canceled' \|\| existing?.status === 'replaced') return existing` | src/notas.ts:225-226 |
| Re-send keeps `createdAt` | ``const nota: Nota = existing ? { ...existing, request: isNewRequest ? await resolveReplacement(request) : existing.request } : …`` | src/notas.ts:234-236 |
| Issue validation messages | `'id: a string up to 200 characters'`, `'competence: YYYY-MM-DD'`, `'serviceCode: the 6-digit national code (cTribNac)'`, `'nbsCode: the 9-digit NBS code'`, `'description: required'`, `'valueCents: a positive integer'`, `'taker.name: required'`, `'taker.phone: 6 to 20 digits'`, `'taker.taxId: a CPF or CNPJ (or taker.abroad for a taker outside Brazil)'` | src/request.ts:99-104, 10, 12, 17 |
| 400 body shape | `if (typeof request === 'string') return c.json({ error: request }, 400)` | src/app.ts:132 |
| Silent truncation | `el('xNome', text(taker.name, 300))`, `opt('email', taker.email && text(taker.email, 80))`, `const description = input.description.trim().slice(0, 2000)`, `el('xMotivo', input.reason.trim().padEnd(15, '.').slice(0, 255))` | src/dps.ts:166, 169, 205, 280 |
| Script allow-list | `['panel.js', 'format.js'].map((name) => [name, readFileSync(new URL(`./panel/${name}`, import.meta.url), 'utf8')])` | src/admin.ts:197-199 |
| CSP | `"default-src 'none'; style-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; connect-src 'self'"` | src/admin.ts:190-191 |
| Hash helpers | `export const parseNotaHash = (hash) => new URLSearchParams(hash.replace(/^#/, '')).get('nota') ?? ''`; ``export const notaHash = (id) => `#${new URLSearchParams({ nota: id })}` `` | src/panel/format.js:102, 105 |
| Static-session guard | `app.use('/admin/*', async (c, next) => { if (!sessionOf(getCookie(c, SESSION_COOKIE))) return c.redirect('/login', 303)` | src/admin.ts:426-429 |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Numeric-only CNPJ | Alphanumeric CNPJ for new registrations | 2026-07-31 | Taker CNPJ field is digits-only here; production XSD still `[0-9]{14}` (Pitfall 11) |
| Government DANFSe API | Local renderer fallback | 2026-08-03 (NT 008 v1.02, per CONTEXT deferred note) | Not part of this phase; PDF links still work via fallback |

**Deprecated/outdated:** nothing in the chosen approach. Native `<dialog>` and `history.replaceState` are the same primitives Phase 2 already uses.

## Runtime State Inventory

Not a rename/refactor/migration phase. Omitted.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A drag from inside an input released outside the dialog article produces a `click` whose target is the dialog and so would close it | Pitfall 7 | Low: the guard is cheap and harmless if the behavior does not occur; confirm in the smoke run |
| A2 | Rule E0015 compares dates (not instants) between competence and `dhEmi`, so only the first minute after Brasília midnight is affected | Pitfall 10 | Low: worst case the window is wider and a 422 shows the government's own message |
| A3 | Pico classless styles `<a role="button">` as a button and gives `<button>` in a `<footer>` sensible widths without classes | Recommended structure (header link, footer actions) | Medium for looks only: planner should budget a CSS pass checked with the smoke screenshots (`PANEL_SMOKE_SHOTS`) |
| A4 | Behind a reverse proxy the `Date` header is still the server's time (same host clock) | Pattern 2 | Low: failure mode is "no notice", the nota is still shown |
| A5 | A single Node process owns the SQLite file (Docker/one container), so an in-process lock is sufficient | Pattern 4 | Medium: with several processes on one DB file the lock would not serialize; a DB-level reservation would be needed. README/Dockerfile describe one server; confirm with the owner |

## Open Questions

1. **Include the per-id lock in this phase?**
   - What we know: the race is real and reachable from the panel (probe); the lock is small, adds no API contract change, and is what makes ROADMAP criterion 2 true for reload-during-flight and multi-tab.
   - What's unclear: CONTEXT lists "any change to the `/v1` contract" as out of scope, and the CONCERNS.md items are named only as "relevant".
   - Recommendation: include it as the first task (it is internal behavior, not contract). If the owner declines, the plan must at least list the residual risk in the phase verification.

2. **Should an active status filter drop a row whose status no longer matches after cancel/retry?**
   - What we know: D-14 says update in place; with `?status=issued`, a canceled row no longer belongs in the list.
   - Recommendation: patch in place when there is no filter or it still matches; otherwise remove the row (the pagination cursor lives in `view.last`, not in the DOM) and show "Nenhuma nota encontrada." if the list empties.

3. **Id character set.** The API accepts any 1-200 character string and the probe shows ids with `/`, space, `#`, `?`, `%` round-trip through `GET /v1/notas/:id` when encoded. Recommendation: trim whitespace in the field, require 1-200, no further restriction; the hash/URL helpers already encode through `URLSearchParams`.

4. **No UI-SPEC exists** (ROADMAP says UI hint: yes). Row layout with three actions, footer layout and the danger button are Claude's discretion; consider `/gsd-ui-phase 3` before planning, or let the plan budget a styling task verified by screenshots.

5. **Alphanumeric CNPJ takers** cannot be issued by this API (Pitfall 11). Backlog item, not a blocker.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | server, vitest, smoke | ✓ | v22.23.5 (`engines` `>=22.18.0`) | — |
| pnpm | scripts | ✓ | 11.15.1 | — |
| google-chrome | `scripts/panel-smoke.mjs` | ✓ | `/usr/bin/google-chrome` (smoke ran: 24 passed) | `CHROME` env var for another binary |
| xmllint, xmlsec1, openssl | existing `dps`/`sign` tests | ✓ | present; full suite 291 passed | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

(`workflow.nyquist_validation` is absent from `.planning/config.json`, so it is treated as enabled.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^5.1.0` (unit/route) + headless-Chrome CDP script (browser behavior) |
| Config file | none (vitest defaults; `src/**/*.test.ts`) |
| Quick run command | `pnpm exec vitest run src/panel src/admin.test.ts src/notas.test.ts` |
| Full suite command | `pnpm test` then `pnpm run typecheck`; browser: `node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACT-01 | `parseBrl`, `brasiliaToday` (incl. 21:00-23:59 edge), `suggestId` shape and bias, `validateForm`, `buildIssueBody` omits empties | unit | `pnpm exec vitest run src/panel/form.test.ts` | ❌ Wave 0 |
| ACT-01 | `/admin/emitir` guarded (303 without session), shell, one script, no class/style, headers, `emitir.js` served | route | `pnpm exec vitest run src/admin.test.ts` | ✅ (extend) |
| ACT-01 | Submit sends JSON + `X-CSRF-Token` + cookie, no Authorization; button disabled in flight; 422 keeps fields and shows codes; 400 message under field; 401 goes to `/login`; 403 shows reload message; network failure keeps id | browser | smoke scenario "emitir-*" | ❌ extend script |
| ACT-01 | Reload keeps `?id=`; resubmit of an issued id lands on `/admin#nota=<id>` with the notice; second tab concurrent | browser + unit | smoke "emitir-resubmit"; `notas.test.ts` concurrency | ❌ |
| ACT-01 | Concurrent `issue` of one id sends once | unit | `pnpm exec vitest run src/notas.test.ts -t "concurrent"` | ❌ Wave 0 |
| ACT-01 | `isAlreadyIssued` for issued/canceled/replaced stale vs fresh, rejected-then-issued (old `createdAt`), missing/invalid `Date` | unit | `src/panel/form.test.ts` | ❌ Wave 0 |
| ACT-02 | `parseCancelFlag`/`notaHash(id,{cancelar})`, `reasonProblem`, `CANCEL_REASONS`; existing `parseNotaHash` tests stay green | unit | `pnpm exec vitest run src/panel/format.test.ts` | ✅ (extend) |
| ACT-02 | Nothing sent before "Confirmar cancelamento" (assert zero POSTs after opening the form and after Voltar); disabled while in flight; 200 re-renders Cancelada + patches row, "Carregar mais" rows kept; 422 box; 502 keeps form | browser | smoke scenario "cancel-*" with programmable gov | ❌ |
| ACT-02 | Row action link `#nota=<id>&cancelar` opens dialog with the form; closing clears flag | browser | smoke "cancel-row-link" | ❌ |
| ACT-02 (D-10) | `retryBody` strips `replaces.accessKey`; Tentar de novo refreshes dialog and row for 200/202/422 | unit + browser | `form.test.ts`; smoke "retry" | ❌ |
| ACT-03 | `prefillFromNota`: carries taker/service/NBS/description/value, resets competence, drops abroad taker, export, replaces, flags notice | unit | `src/panel/form.test.ts` | ❌ Wave 0 |
| ACT-03 | `?de=` prefill, new id in URL, reload keeps it, unknown `de` shows "Nota não encontrada.", submit creates a separate nota (different id, no `replaces` in the request body) | browser | smoke "duplicate-*" | ❌ |
| All | API strings stay text (hostile name in the form's error box and prefill) | browser | extend `HOSTILE` fixtures | ❌ |

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run src/panel src/admin.test.ts src/notas.test.ts` (seconds)
- **Per wave merge:** `pnpm test && pnpm run typecheck`
- **Phase gate:** full suite green, smoke script green (it is a local aid, not CI), then `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/panel/form.test.ts` and `src/panel/form.d.ts` (+ `api.d.ts`, `dom.d.ts` where imported by tests): the folder has no `allowJs`, so tsc needs a `.d.ts` for every `.js` a `.ts` test imports (same as `format.d.ts`)
- [ ] `src/panel/api.test.ts`: fake `fetch`, asserts headers, 401 redirect, HTML-body tolerance, elapsed/date passthrough
- [ ] Concurrency regression test in `src/notas.test.ts` (gov stub with a delay; assert one `sendDps`)
- [ ] `scripts/panel-smoke.mjs`: a scenario factory with a **programmable gov** (today's stub always answers `unreached`, so no issue/cancel can succeed) and a recorder of POST bodies; update the assertions in Pitfall 9

## Security Domain

(`security_enforcement` is not set to false in config, so it applies.)

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (Phase 1) | Existing scrypt login; Phase 3 only uses the session |
| V3 Session Management | yes (consumed) | HttpOnly SameSite=Strict cookie; 401 redirects to `/login`; 403 handled as stale session |
| V4 Access Control | yes | New route lives under the `/admin/*` guard; `/admin/emitir.js` etc. only served to a session via `PANEL_SCRIPTS` allow-list |
| V5 Input Validation | yes | Client mirror of `parseIssueRequest` for UX; server remains the authority; `maxlength` to prevent silent truncation |
| V6 Cryptography | no | `crypto.getRandomValues` only for non-secret id suffix |
| V13/API CSRF | yes | `X-CSRF-Token` from the meta tag on every POST (server compares in constant time) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via government messages, taker names, descriptions rendered in dialog/form | Tampering / Elevation | `textContent` only; CSP `script-src 'self'`; smoke hostile-string checks extended to the form |
| CSRF on issue/cancel | Tampering | Session cookie SameSite=Strict + `X-CSRF-Token` (existing) |
| Accidental or malicious cancel on first click | Tampering | Cancel only through the confirmation button; row link only opens the form (D-13) |
| Duplicate fiscal document via double click / reload / second tab | Tampering | Stable id in URL + disabled button + **server per-id lock** + idempotent `issue()` |
| Sensitive data in URL/history/referrer | Information disclosure | Only ids in the query/hash; `Referrer-Policy: no-referrer` and `Cache-Control: no-store` from `pageHeaders` |
| `localStorage` leakage | Information disclosure | Persist only service code, NBS, description; never taker data or tokens; try/catch |
| Open redirect through `?de=`/`?id=` | Spoofing | Values are used only in `fetch` paths via `encodeURIComponent` and as field values; redirects go to fixed `/admin#nota=…` and `/login` |
| Clickjacking | Spoofing | `frame-ancestors 'none'` (existing CSP) |

## Sources

### Primary (HIGH confidence)
- In-repo, read in full this session: `src/app.ts`, `src/request.ts`, `src/notas.ts`, `src/admin.ts`, `src/panel/panel.js`, `src/panel/format.js`, `src/panel/format.d.ts`, `scripts/panel-smoke.mjs`, `src/repo.ts`, `tsconfig.json`, `package.json`, `.planning/{REQUIREMENTS,STATE,ROADMAP}.md`, `.planning/codebase/CONCERNS.md`, `README.md` (API sections); partial: `src/dps.ts`, `src/session.ts`, `src/admin.test.ts`, `src/appSession.test.ts`
- Executed probes (scratchpad, not committed): concurrent-issue race, `replaces` retry round-trip, id-with-special-chars GET, `Date` header on `@hono/node-server`, `en-CA` Brasília formatting; baseline `pnpm exec vitest run` (291 passed), `pnpm run typecheck`, `scripts/panel-smoke.mjs` (24 passed)
- [MDN Crypto.getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues): usable from an insecure context
- `schemas/restricted/tiposSimples_v1.01.xsd`, `schemas/production/tiposSimples_v1.01.xsd`: `TSCNPJ`, `TSDec15V2` patterns

### Secondary (MEDIUM confidence)
- [Receita Federal gera o primeiro CNPJ em formato alfanumérico (gov.br/fazenda)](https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico/) and [Agência Gov: implantação a partir de 31 de julho](https://agenciagov.ebc.com.br/noticias/202607/implantacao-do-cnpj-alfanumerico-ocorrera-a-partir-de-31-de-julho)
- [NCM Buscador: NFS-e erro E0015](https://buscadorncm.com.br/nfse/erros/e0015): third-party mirror of the official rule text

### Tertiary (LOW confidence)
- Browser behavior of drag-release click targets and Pico classless widths for `<a role="button">`/footer buttons (A1, A3): training knowledge, to be confirmed in the smoke screenshots

## Project Constraints (from CLAUDE.md)

No `CLAUDE.md` or `.claude/CLAUDE.md` exists, and there is no `.claude/skills` or `.agents/skills` directory. Binding constraints come from `.planning/PROJECT.md`/CONTEXT instead: no build step; `API_TOKEN` never reaches the browser; pt-BR UI text; every API string enters the DOM through `textContent`; no inline script or style (CSP); panel markup uses no `class` or `style` attributes (enforced by `src/admin.test.ts`); tests in English, co-located; commit messages follow the repo's `docs(…)`/`test(…)`/`fix(…)` style.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, nothing new; all pieces exist and run green here
- Architecture: HIGH, extends the Phase 2 patterns the code already uses; race and round-trip pitfalls reproduced by probes
- Pitfalls: HIGH for the in-repo ones (1-6, 8, 9, 12); MEDIUM for E0015 timing and CNPJ rollout (external, third-party/news); LOW for browser/Pico specifics (A1, A3)

**Research date:** 2026-11-21
**Valid until:** 2026-12-21 (in-repo findings hold until `src/notas.ts`/`src/admin.ts` change; external facts are slow-moving)
