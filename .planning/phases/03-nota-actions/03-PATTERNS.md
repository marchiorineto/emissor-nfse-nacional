# Phase 3: Nota Actions - Pattern Map

**Mapped:** 2026-11-21
**Files analyzed:** 17 (6 new modules/tests, 11 modified)
**Analogs found:** 17 / 17 (all analogs are git-tracked under `src/` and `scripts/`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/admin.ts` (modify: `panelHeader()`, `emitirPage()`, `GET /admin/emitir`, `PANEL_SCRIPTS`, "Emitir nota" link, footer, CSS) | route + page shell | request-response | itself, `adminPage` (l.~210-275) and `GET /admin` (l.446-453) | exact |
| `src/notas.ts` (modify: per-id lock around `issue`/`cancel`) | service | request-response / concurrency | itself (`issue` l.223-239, `cancel` l.241-262) | exact |
| `src/panel/emitir.js` (new) | component (DOM module) | request-response | `src/panel/panel.js` | role-match |
| `src/panel/api.js` + `api.d.ts` (new) | utility (fetch wrapper) | request-response | `api()` in `src/panel/panel.js` l.33-42 | exact |
| `src/panel/dom.js` + `dom.d.ts` (new) | utility (DOM builders) | transform | `text()`/`cell()` and error-box code in `panel.js` l.44-57, 162-175 | exact |
| `src/panel/form.js` + `form.d.ts` (new, pure) | utility | transform | `src/panel/format.js` + `format.d.ts` | exact |
| `src/panel/format.js` + `.d.ts` (modify: cancel flag, reasons) | utility | transform | itself (`parseNotaHash`/`notaHash` l.99-105) | exact |
| `src/panel/panel.js` (modify: row actions, dialog actions, cancel form, retry, row patch) | component | request-response | itself (`renderRow`, `renderNota`, `openNota`, `sync`) | exact |
| `src/panel/form.test.ts`, `api.test.ts` (new) | test | transform | `src/panel/format.test.ts` | exact |
| `src/panel/format.test.ts` (modify) | test | transform | itself l.257-270 | exact |
| `src/admin.test.ts` (modify, see Pitfall 9) | test | request-response | itself l.390-439 | exact |
| `src/notas.test.ts` (add concurrency test) | test | request-response | itself | exact |
| `scripts/panel-smoke.mjs` (extend, programmable gov stub) | test (headless Chrome) | event-driven | itself | exact |

## Pattern Assignments

### `src/admin.ts` (page shell, request-response)

**Analog:** itself.

**Script allow-list** (l.197-199), extend the array with every new module (a forgotten one is a 404 in the browser):
```ts
export const PANEL_SCRIPTS: ReadonlyMap<string, string> = new Map(
  ['panel.js', 'format.js'].map((name) => [name, readFileSync(new URL(`./panel/${name}`, import.meta.url), 'utf8')]),
)
```
New list: `['panel.js','format.js','api.js','dom.js','form.js','emitir.js']`. The route loop at ~l.440 serves them behind the guard, so no extra route is needed.

**Shell to extract into `panelHeader(cnpj, environment, csrf)`** (the `<header><nav>` block in `adminPage`):
```ts
html`<header>
  <nav>
    <ul><li><hgroup><h1>Emissor de NFS-e</h1><p>CNPJ ${cnpj} ${environmentBadge(environment)}</p></hgroup></li></ul>
    <ul><li><form method="post" action="/logout"><input type="hidden" name="csrf" value="${csrf}"><button>Sair</button></form></li></ul>
  </nav>
</header>`
```
The "Emitir nota" link goes in this nav (an `<a href="/admin/emitir">`). `adminPage` ends with `layout(title, html, csrf)`, where `layout` renders the meta csrf-token. Reuse `layout` and the header for `emitirPage`.

**Route** (l.446-453, copy for `/admin/emitir`; the `/admin/*` guard at l.425-429 already covers it, but keep the in-handler check):
```ts
app.get('/admin', (c) => {
  const session = sessionOf(getCookie(c, SESSION_COOKIE))
  if (!session) return c.redirect('/login', 303)
  return c.html(adminPage(formatCnpj(env.ISSUER_CNPJ), env.NFSE_ENVIRONMENT, csrfToken(key, session.id)))
})
```
Register it BEFORE or alongside; there is no conflict with `/admin/:name` script routes because those are literal names.

**Dialog footer** (currently `<footer><form method="dialog"><button>Fechar</button></form></footer>`). New actions go in the footer; add them as buttons/links filled by `panel.js` and keep the Fechar form (the `admin.test.ts` line 409-439 asserts this string, so update or keep it). Rules enforced by tests: no `class` or `style` attribute anywhere, `<main id="notas">` has exactly one `<script>` (the module tag sits outside `main`, after the dialog).

**CSP and errors:** `PAGE_CSP` has `connect-src 'self'` and `script-src 'self'`, with no change needed. The form needs `method="post"` and no `action`, as RESEARCH says. `form-action 'self'` is already allowed.

---

### `src/notas.ts` (service, per-id lock)

**Analog:** itself. Wrap bodies of `issue` (l.223-239) and `cancel` (l.241-262), which today are plain `async` functions with `repo.get` then `send`. `createNotas` is rebuilt per request (`const notas = () => createNotas(...)`, `src/app.ts:50`), so key the lock by the shared `repo` (RESEARCH Pattern 4):
```ts
const locks = new WeakMap<Repo, Map<string, Promise<unknown>>>()
const serialized = <T>(repo: Repo, id: string, fn: () => Promise<T>): Promise<T> => {
  const chain = locks.get(repo) ?? locks.set(repo, new Map()).get(repo)!
  const run = (chain.get(id) ?? Promise.resolve()).catch(() => undefined).then(fn)
  const tail = run.finally(() => { if (chain.get(id) === tail) chain.delete(id) })
  chain.set(id, tail)
  return run
}
// const issue = (request) => serialized(repo, request.id, async () => { ...existing body... })
// const cancel: Notas['cancel'] = (id, reason) => serialized(repo, id, async () => { ...existing body... })
```
Existing error style to keep: `throw notaError(404, 'nota not found')`, `notaError(409, ...)`, `notaError(502, 'government did not answer; try again')`; `app.onError` maps `isNotaError` to `{ error }` (`src/app.ts:123-125`). `Repo` is imported from `src/repo.ts` (check the actual import already in `notas.ts`).

---

### `src/panel/api.js` (utility, request-response)

**Analog:** `src/panel/panel.js` l.33-42.
```js
const api = async (path) => {
  const res = await fetch(path, { credentials: 'same-origin', headers: { accept: 'application/json' } })
  if (res.status === 401) {
    location.assign('/login')
    throw new Error('unauthorized')
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
```
Keep this GET `api()` behavior (same error message strings `'unauthorized'`, `` `HTTP ${status}` ``, which `loadPage`/`openNota` test by `error.message`). Add `createApi({fetch, csrf, redirect}).request(method, path, payload)` per RESEARCH Pattern 1: returns `{status, body, date, elapsedMs}` for 4xx/422 and throws only on network failure and 401. `csrf()` reads `document.querySelector('meta[name="csrf-token"]').content` (confirm the meta name in `layout()`). The server contract is `src/app.ts:94-96`: 401 `{error:'unauthorized'}`, 403 `{error:'invalid csrf token'}`.
**Injectable `fetch`/`redirect`** so `api.test.ts` can run in vitest without a DOM, like the pure helpers in `format.js`.

---

### `src/panel/dom.js` (utility)

**Analog:** `panel.js` l.44-57 and l.162-175. Extract and share:
```js
const text = (tag, value) => { const el = document.createElement(tag); el.textContent = value; return el }
```
and the error section builder:
```js
const section = document.createElement('section')
section.dataset.errors = ''
section.append(text('h3', box.heading))
const list = document.createElement('ul')
for (const error of box.errors) {
  const item = document.createElement('li')
  item.append(text('strong', error.code), ' ', error.message)
  if (error.detail) item.append(' ', text('small', error.detail))
  list.append(item)
}
section.append(list)
```
Source boxes from `errorBoxes(nota)` in `format.js` (l.~195). Rule: only `textContent`, never `innerHTML`; no `class`/`style`.

---

### `src/panel/form.js` (+ `form.d.ts`, pure helpers)

**Analog:** `src/panel/format.js` (pure, no DOM, JSDoc line before each export, uses `Intl.DateTimeFormat` with `timeZone: 'America/Sao_Paulo'`, see l.~108 `dateTime`). `format.d.ts` shows the typing convention (header comment explaining no `allowJs`; `import type { Taker } from '../dps.ts'`; `import type { Nota } from '../notas.ts'`; one-line JSDoc per `export function`).
```js
const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
/** An instant as DD/MM/YYYY, HH:MM in America/Sao_Paulo; ... */
export const formatDateTime = (value) => (...)
```
Contents to implement (all in RESEARCH "Code Examples"): `parseBrl`, `brasiliaToday`, `suggestId`, `validateForm`, `buildIssueBody` (omit empty `email`/`phone`/`nbsCode`/taker; Pitfall 12), `prefillFromNota`, `retryBody` (delete `replaces.accessKey` when `replaces.id`; Pitfall 2), `isAlreadyIssued` (`updatedAt` vs `Date` header minus `elapsedMs`), `issueErrorMessage` (prefix to pt-BR), `CANCEL_REASONS`, `reasonProblem`. Request field names and server messages to mirror: `src/request.ts:10-17, 99-104`.

---

### `src/panel/format.js` (modify, cancel flag)

**Analog:** itself, l.99-105. Keep these unchanged (existing tests l.257-270 must stay green) and ADD new functions:
```js
export const parseNotaHash = (hash) => new URLSearchParams(hash.replace(/^#/, '')).get('nota') ?? ''
export const notaHash = (id) => `#${new URLSearchParams({ nota: id })}`
```
Add `parseCancelFlag(hash)` (`new URLSearchParams(...).has('cancelar')`) and `notaHash(id, { cancelar })` as an optional second arg that keeps the old output when absent. Mirror in `format.d.ts`. `statusNotice` (l.~212) text for pending/unknown must stay as is (D-10); its docstring "Never an action" should be updated.

---

### `src/panel/panel.js` (modify)

**Analog:** itself.
- **Imports** (l.3-21): add the new names from `./format.js`, plus `./api.js`, `./dom.js`, `./form.js`.
- **Row actions** in `renderRow` (l.89-98): the PDF cell is built via `cell('PDF')` + `text('a', ...)`. Add an actions cell the same way with `cell('Ações')` containing a Cancelar link (`href = notaHash(nota.id, {cancelar:true})`, only `nota.status === 'issued'`) and a Duplicar link (`/admin/emitir?de=` + `encodeURIComponent(nota.id)`). Update the `<th>` list in `admin.ts` and the `admin.test.ts` column assertion to match.
- **Generation counters** (l.114, 117-145, 210-225): `view.generation`, `view.dialogGeneration`; `if (generation !== view.dialogGeneration) return`. Reuse for cancel/retry, but per Anti-Pattern the row patch must NOT be dropped by the counter, only the dialog render.
- **sync()** (l.228-244): extend with `view.cancel` from `parseCancelFlag(location.hash)`; toggling the flag re-renders without refetching.
- **Dialog close** (l.247-257): `history.replaceState(null, '', location.pathname + location.search)` clears the hash, so it also clears the flag. Backdrop click: switch to a pointerdown-target check (Pitfall 7).
- **Link safety** (l.188-207): `LINK_PREFIXES = ['#nota=', '/v1/notas/', 'https://']`. Any new link in the dialog body must start with an allowed prefix or be built outside `detailValue`.
- **Error handling** pattern (l.220-224): `error.message === 'unauthorized'` returns silently, `HTTP 404` shows "Nota não encontrada.".

---

### `src/panel/emitir.js` (DOM module, request-response)

**Analog:** `src/panel/panel.js` for structure: top-of-file comment stating "Every API string reaches the DOM through textContent", module-level `getElementById` constants, `say()` status line (l.103-106), in-flight `disabled` plus `aria-busy` (l.126-143, `finally` re-enables), `location.assign('/login')` on 401. URL as source of truth: `history.replaceState(null, '', location.pathname + search)` as in l.251. Flow in RESEARCH diagram: boot (`?id` or `suggestId()` then `replaceState`; `?de=` then `GET /v1/notas/:id` then `prefillFromNota`), submit (validate, `request('POST','/v1/notas',body)`, branch on 401/403/400/422/network/200/202), success `location.replace('/admin#nota=' + id)`.

---

### Tests

**`src/panel/form.test.ts`, `api.test.ts`** analog `src/panel/format.test.ts`: `import { describe, expect, it } from 'vitest'`, import the types from `../dps.ts`, named imports from `./format.ts`-style path (the file imports the `.js` with a `.d.ts` beside it), `describe('parseNotaHash and notaHash', () => { it('...') })` style; English test names.

**`src/admin.test.ts`** edit points: l.390-407 (serves `['panel.js','format.js']`, then 404 for `format.d.ts`/`nope.js`; add every new module and keep the 404 loop, adding `form.d.ts`), l.409-439 shell assertions, l.351-380 (no class/style, one absolute URL, `not.toContain('<script')` branch needs an emitir page case). `src/appSession.test.ts` already covers session + CSRF on POST.

**`src/notas.test.ts`**: add a concurrency case with a slow gov stub asserting a single `sendDps` call (follow existing stub setup in that file, which I did not excerpt; the planner should read it).

**`scripts/panel-smoke.mjs`**: lines 634, 767 use `#nota-dialog form button` (scope to `footer form button`), lines 741-743 assert that pending/unknown has only Fechar and no link: replace.

## Shared Patterns

### Session + CSRF on browser POST
**Source:** `src/app.ts:94-96` (server) and the meta tag emitted by `layout()` in `src/admin.ts`. **Apply to:** every `POST` in `api.js`/`emitir.js`/`panel.js`. Send `credentials: 'same-origin'` and `x-csrf-token`, never `Authorization`.

### 401 goes to login
**Source:** `panel.js` l.36-39. **Apply to:** all requests, via the shared `api.js`.

### textContent-only rendering, no class/style
**Source:** `panel.js` l.44-57 and `src/admin.test.ts` l.351-380. **Apply to:** `emitir.js`, `panel.js`, `dom.js`.

### Status code map of /v1
**Source:** `src/app.ts:27` `STATUS_CODE` (issued/canceled/replaced 200, rejected 422, pending/unknown 202), cancel 200 or 422 (l.177), 400 `{error}` (l.132), notaError 404/409/502. **Apply to:** result branching in `emitir.js` and the cancel/retry handlers.

### No build step, pure helpers get a `.d.ts` and a vitest file
**Source:** `src/panel/format.d.ts` + `format.test.ts`. **Apply to:** `api.js`, `dom.js`, `form.js` (only the ones imported by `.ts` tests).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Programmable gov stub in `scripts/panel-smoke.mjs` | test fixture | event-driven | Today's stub always answers `unreached` (per RESEARCH); the extension is new design within the same script |
| Per-id lock (`serialized`) | service | concurrency | No existing mutual exclusion in `src/`; use RESEARCH Pattern 4 |
| `<form>` for issue + cancel reason inside the dialog | component | request-response | The panel has no existing editable form besides login; for markup conventions read `loginPage` in `src/admin.ts` (not excerpted here) |

## Metadata

**Analog search scope:** `src/`, `src/panel/`, `scripts/`. All were confirmed tracked by `git ls-files`.
**Files read:** `src/panel/panel.js` (full), `src/panel/format.js` (l.90-224), `src/admin.ts` (l.185-335, 420-454), `src/notas.ts` (l.215-277), `src/app.ts` (l.120-185), `src/admin.test.ts` (l.395-445), `src/panel/format.d.ts` and `format.test.ts` (heads, l.250-272).
**Pattern extraction date:** 2026-11-21
