# Phase 2: Notas Panel - Pattern Map

**Mapped:** 2026-11-20
**Files analyzed:** 11 (4 new, 7 modified)
**Analogs found:** 10 / 11 (all analogs are git-tracked: admin.ts, app.ts, repo.ts, notas.ts and the three test files verified with `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/admin.ts` (modify: `PAGE_CSP`, `adminPage` shell, `PANEL_CSS`, script routes) | route/config/view | request-response | itself (`/panel.css` route, `PANEL_CSS`, `adminPage`) | exact |
| `src/panel/panel.js` (new) | component (browser module) | request-response + event-driven (URL/history) | none in repo (no browser code) | no analog |
| `src/panel/format.js` (new) | utility (pure) | transform | `formatCnpj` / `environmentLabel` in `src/admin.ts:75-80` | role-match |
| `src/panel/format.d.ts` (new) | config (types) | n/a | none; RESEARCH verified the TS7016 fix | no analog |
| `src/panel/format.test.ts` (new) | test | transform | `src/repo.test.ts` (pure vitest style) and `src/admin.test.ts` | role-match |
| `src/app.ts` (modify: `limit` clamp, `beforeId`, `?download=1`) | controller | request-response | itself, lines 127-145 | exact |
| `src/repo.ts` (modify: `list` tiebreak, `createMemoryRepo.list` parity) | model/repo | CRUD | itself, lines 66-92 | exact |
| `src/notas.ts` (modify: `list` options gain `beforeId?`) | service types | CRUD | itself, lines 72 and 95 | exact |
| `src/admin.test.ts` (modify: CSP string, script-tag rule, new route tests) | test | request-response | itself, lines 344-386 | exact |
| `src/repo.test.ts` (add cursor cases, both repos) | test | CRUD | itself, lines 40-48 | exact |
| `src/app.test.ts` / `src/appSession.test.ts` (add limit, beforeId, download cases) | test | request-response | `src/appSession.test.ts` setup, lines 1-40 | exact |

## Pattern Assignments

### `src/admin.ts` (route + config, request-response)

**Analog:** itself. Imports are at lines 1-8 (`Context, Hono, MiddlewareHandler`, `hono/html`, `hono/cookie`, `.ts` relative imports).

**Headers and guard order** (lines 214-222, 256-259). New script routes under `/admin/` are covered by these two existing registrations, so no new `app.use`:
```typescript
app.use('/login', pageHeaders)
app.use('/logout', pageHeaders)
app.use('/admin/*', pageHeaders)
app.use('/panel.css', pageHeaders)

app.get('/panel.css', (c) => c.body(PANEL_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8' }))
...
app.use('/admin/*', async (c, next) => {
  if (!sessionOf(getCookie(c, SESSION_COOKIE))) return c.redirect('/login', 303)
  await next()
})
```
Add the script route AFTER the guard (so no session gives 303), copying the shape of the `/panel.css` line with `Content-Type: text/javascript; charset=utf-8` (RESEARCH Pattern 1: `readFileSync(new URL('./panel/<name>', import.meta.url), 'utf8')` into a module-level `Map`, route `/admin/:file{(panel|format)\\.js}`). Note that `format.js` is imported by `panel.js` as `./format.js`, resolved by the browser to `/admin/format.js`.

**CSP change** (lines 62-65). Append `; connect-src 'self'` and update the stale comment "room for a Phase 2 script route":
```typescript
export const PAGE_CSP =
  "default-src 'none'; style-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
```

**Shell pattern** (`adminPage`, ends at line ~159 with `<main id="notas"></main>`, wrapped by `layout(title, html\`...\`, csrf)`). Keep `hono/html` tagged templates (they escape), no `class=` or `style=` attributes (existing test forbids them), semantic markup only. Add inside `<main id="notas">` the `<noscript>`, `<select id="status">`, `<table>`, "Carregar mais" button; add `<dialog id="nota-dialog"><article>...` and the single `<script type="module" src="/admin/panel.js"></script>`. The `layout()` at lines 80-94 has no script slot; either add the script tag inside the `adminPage` content or give `layout` an optional param. Do not add a script to login/refusal pages.

**PANEL_CSS pattern** (line 32 onward): a template-literal string, selectors via data attributes (`main[data-card]`), no inline styles. Extend with `[data-status=...]` rules, mobile-card `@media (max-width: 767px)`, `html:has(dialog[open]) { overflow: hidden }`, `dd { overflow-wrap: anywhere }` (RESEARCH code examples and Pitfalls 12-13). Existing tests regex-match this string (`admin.test.ts:~390`), so do not alter the `main[data-card]` rules.

**Pure helper pattern** (lines 75-80), the style for `format.js`:
```typescript
/** NN.NNN.NNN/NNNN-NN for 14 digits, otherwise the value as given. */
export const formatCnpj = (cnpj: string): string => cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

export const environmentLabel = (environment: string): string =>
  environment === 'restricted' ? 'Homologação (produção restrita)' : environment === 'production' ? 'Produção' : environment
```

---

### `src/panel/format.js` (utility, transform)

**Analog:** `formatCnpj`/`environmentLabel` above for style (arrow `export const`, JSDoc in English, pt-BR user text, 2 spaces, no semicolons, single quotes, trailing commas). Plain JS, no types, no DOM, no top-level side effects. Copy the CNPJ regex and add the CPF variant. Use the verified formatter code in RESEARCH "Code Examples" (`formatBrl`, `formatDateTime`, `formatCompetence`, `listDate`, `formatTaxId`, `listQuery`). Never `new Date(competence)`. Status vocabulary must equal `NOTA_STATUSES` in `src/app.ts:24`.

### `src/panel/panel.js` (browser module, request-response + event-driven)

**No analog** (the repo has no browser code). Use RESEARCH Patterns 2, 3, 6 and 7, Pitfalls 4-6 and the "401 handling and fetch wrapper" example. Rules: `createElement` + `textContent` only, no `innerHTML`; `tr.dataset.status` not `style`; one idempotent `sync()` on load, `popstate`, `hashchange`; generation counter against stale responses; `fetch(path, { credentials: 'same-origin' })`, 401 goes to `location.assign('/login')`; PDF anchor `href` is the relative `/v1/notas/<encodeURIComponent(id)>/pdf?download=1`, never `links.pdf`.

### `src/panel/format.d.ts` (types)

**No analog.** Sibling declarations for each `format.js` export, required because `tsconfig` has `include: ["src"]` with no `allowJs` (otherwise `TS7016`, verified in RESEARCH).

### `src/panel/format.test.ts` (test, transform)

**Analog:** `src/repo.test.ts` and `src/admin.test.ts` (vitest, co-located `<module>.test.ts`, `import { describe, expect, it } from 'vitest'`, relative imports with `.ts`/`.js` extension). Expected strings: `R$ 1.234,56` uses U+00A0 after `R$`. Include a `createdAt` near 01:30Z case, hostile `<script>` strings, `parseLocation` with a malformed `%` hash.

---

### `src/app.ts` (controller, request-response)

**Analog:** itself.

**List route to change** (lines 127-134):
```typescript
app.get('/v1/notas', async (c) => {
  const status = c.req.query('status') as NotaStatus | undefined
  if (status && !NOTA_STATUSES.includes(status)) return c.json({ error: `status: one of ${NOTA_STATUSES.join(', ')}` }, 400)
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, MAX_LIST)
  const list = await notas().list({ status, limit, before: c.req.query('before') })
  const origin = originOf(c.req.url)
  return c.json({ notas: list.map((nota) => view(origin, nota)) })
})
```
Changes: clamp `Math.min(Math.max(1, Math.trunc(Number(q) || 50)), MAX_LIST)`; pass `beforeId: c.req.query('beforeId')`.

**PDF route to change** (lines 141-145):
```typescript
app.get('/v1/notas/:id/pdf', async (c) => {
  const pdf = await notas().pdf(c.req.param('id'))
  if (!pdf) return c.json({ error: 'nota not issued' }, 404)
  return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="nfse-${c.req.param('id')}.pdf"` } })
})
```
Add a `?download=1` branch (RESEARCH Pattern 6): `attachment; filename="nfse-<nfseNumber ?? dpsNumber>.pdf"`, default stays `inline`. The public signed route near lines 163-169 already names files from the number, use it as the naming reference. Error shape is `c.json({ error }, status)`.

### `src/repo.ts` (repo, CRUD)

**Analog:** itself. SQL list (lines 66-72):
```typescript
list: async ({ status, limit, before }) => {
  const filters = [status ? 'status = ?' : '', before ? 'created_at < ?' : ''].filter(Boolean)
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const params = [status, before].filter((value): value is string => Boolean(value))
  const rows = db.prepare(`SELECT data FROM notas ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, limit)
  return rows.map((row) => JSON.parse(String(row.data)) as Nota)
},
```
Replace using RESEARCH Pattern 5 (`(created_at, id) < (?, ?)` when both `before` and `beforeId`, else the old `created_at < ?`; `ORDER BY created_at DESC, id DESC`). Memory repo (line 90) must mirror it, currently:
```typescript
list: async ({ status, limit }) => [...notas.values()].filter((nota) => !status || nota.status === status).slice(0, limit),
```
Make it sort by `createdAt` desc then `id` desc and apply `before`/`beforeId`. Do this before any route-level pagination test.

### `src/notas.ts` (service types)

Both `Repo.list` (line 72) and `Notas.list` (line 95) have the signature `list(options: { status?: NotaStatus; limit: number; before?: string }): Promise<Nota[]>`. Add `beforeId?: string` to both. Line 271 forwards `options` unchanged, so no other change.

---

### Tests

**`src/admin.test.ts`** must change:
- Lines 344-349: the exact `PAGE_CSP` string; add `connect-src 'self'`.
- Lines 351-376: loop asserts `not.toContain('<script')` for every body, including the two `/admin` bodies. Allow exactly one `<script type="module" src="/admin/panel.js">` in `/admin` bodies only; keep `class=`/`style=` bans and `urls` equal to `[PICO_CSS_URL]`.
- Add tests next to lines 379-386, copying this shape for `/admin/panel.js` and `/admin/format.js` (also a no-session 303 case):
```typescript
const res = await setup().request('http://api.test/panel.css')
expect(res.status).toBe(200)
expect(res.headers.get('content-type')).toBe('text/css; charset=utf-8')
expect(res.headers.get('x-content-type-options')).toBe('nosniff')
```
Use `session(app)` for the cookie and pass `{ headers: { cookie } }` as in line 357.

**`src/repo.test.ts`** (lines 40-48): extend the "lists the newest first" test for tie cases. Pattern:
```typescript
const repo = createSqliteRepo(openDatabase(':memory:'))
await repo.save(nota('old', '2026-11-01T00:00:00Z'))
expect((await repo.list({ limit: 10, before: '2026-11-03T00:00:00Z' })).map((n) => n.id)).toEqual(['mid', 'old'])
```
Run each new case against both `createSqliteRepo(openDatabase(':memory:'))` and `createMemoryRepo()`.

**`src/appSession.test.ts`** setup (lines 1-40): `createApp({ env: { ...env, ADMIN_PASSWORD: HASH, ...overrides }, repo: createMemoryRepo(), gov, ... })`, injected `gov` stub, `clock`, `beforeAll` hash, `issueSession(key, now)` cookie. Copy for session-cookie `GET /v1/notas?limit=-1`, `beforeId`, and `/pdf?download=1`.

## Shared Patterns

### Output safety and CSP
**Source:** `src/admin.ts` `PAGE_CSP` and `pageHeaders` (lines 62-65, 207-213). Apply to every panel page and script response: `Cache-Control: no-store`, CSP, `Referrer-Policy`, `nosniff`. In the browser, API strings go only through `textContent`; no inline script or `style=`; links only `#nota=` or `https://` lookup.

### Session guard on `/v1`
**Source:** `requireAuth` in `src/app.ts` (~line 84, GET/HEAD exempt from CSRF). The panel fetch needs only the cookie; 401 JSON goes to `/login` client side.

### Code style
2-space indent, no semicolons, single quotes, trailing commas, `export const x = (...) =>`, English comments, pt-BR user text, relative imports with `.ts` extension in TS, tests co-located. Gate: `pnpm run typecheck` (strict, `noUncheckedIndexedAccess`).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/panel/panel.js` | browser module | request-response + event-driven | No client-side code exists; use RESEARCH Patterns 2, 3, 6, 7 |
| `src/panel/format.d.ts` | type declarations | n/a | No `.d.ts` precedent; needed to avoid TS7016 |

## Metadata

**Analog search scope:** `src/` (admin, app, repo, notas, tests), `.planning/phases/02-notas-panel`.
**Files scanned:** 8 source files, partially read by line range (admin.ts 55-275, app.ts 20-150, repo.ts 55-92, repo.test.ts 30-55, admin.test.ts 335-390, appSession.test.ts 1-40).
**Pattern extraction date:** 2026-11-20
