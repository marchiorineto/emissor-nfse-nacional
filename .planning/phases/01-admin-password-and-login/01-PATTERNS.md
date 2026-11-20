# Phase 1: Admin Password and Login - Pattern Map

**Mapped:** 2026-11-20
**Files analyzed:** 13 (7 new src/script, 4 modified, 2 docs)
**Analogs found:** 10 / 13 (all analogs are git-tracked; verified via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/admin-password.mjs` | CLI script | file-I/O | `scripts/certificate.mjs` | exact |
| `package.json` (script `admin-password`) | config | - | `package.json` line 15 (`certificate`) | exact |
| `.env.example` (+`ADMIN_PASSWORD=`) | config | - | `.env.example` CERT_* block | exact |
| `src/env.ts` (+`ADMIN_PASSWORD`) | config | transform | `src/env.ts` itself | exact |
| `src/password.ts` | utility | transform (async KDF) | none in repo (research Pattern 1 sketch) | no analog |
| `src/session.ts` | utility | transform / in-memory state | `linkSignature` + `timingSafeEqual` in `src/app.ts` | partial |
| `src/admin.ts` | route + SSR pages | request-response | route block in `src/app.ts` (public `/notas/...` route) | role-match |
| `src/app.ts` (combined auth middleware, `now` dep, registerAdmin) | middleware | request-response | `requireToken` in `src/app.ts` | exact (self) |
| `src/password.test.ts`, `src/session.test.ts`, `src/admin.test.ts` | test | request-response | `src/app.test.ts` | exact |
| `src/server.ts` (startup log) | config | - | `src/server.ts` | self (not read; keep small) |
| `README.md` / `docs/` | docs | - | existing pt-BR sections | n/a |

## Pattern Assignments

### `scripts/admin-password.mjs` (script, file-I/O)

**Analog:** `scripts/certificate.mjs`

**Header/root/fail** (lines 6-18):
```javascript
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const ROOT = join(import.meta.dirname, '..')
const ENV_FILE = join(ROOT, '.env')
const ENV_EXAMPLE = join(ROOT, '.env.example')
const fail = (message) => {
  console.error(`\nErro: ${message}`)
  process.exit(1)
}
```

**askHidden** (lines 20-47): copy verbatim (raw-mode TTY, rejects when `!stdin.isTTY`). Change the reject message (no `CERT_PASSWORD`). Per RESEARCH Pattern 5, branch BEFORE calling it: when stdin is not a TTY read two lines with `node:readline`. Do NOT read the password from `process.env.ADMIN_PASSWORD` (it holds the old hash).

**setVar** (lines 85-90) keep the function replacement:
```javascript
const setVar = (text, name, value) => {
  const line = `${name}=${value}`
  const pattern = new RegExp(`^${name}=.*$`, 'm')
  return pattern.test(text) ? text.replace(pattern, () => line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`
}
```

**Write .env** (lines 96, 99-100):
```javascript
const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : existsSync(ENV_EXAMPLE) ? readFileSync(ENV_EXAMPLE, 'utf8') : ''
writeFileSync(ENV_FILE, setVar(current, 'ADMIN_PASSWORD', hash), { mode: 0o600 })
chmodSync(ENV_FILE, 0o600)
```
Order: ask twice -> `validatePassword` (from `../src/password.ts`) -> compare -> `hashPassword` -> single write. Skip the quoting logic (hash is `$`-free). End with pt-BR "Reinicie o servidor..." (cf. lines 103-104).

### `package.json`
Copy line 15 with the new name and path:
`"admin-password": "node --openssl-legacy-provider --disable-warning=ExperimentalWarning --env-file-if-exists=.env scripts/admin-password.mjs"`

### `.env.example`
Follow the CERT_* style: pt-BR comment line(s) above, empty value. Example place: after `API_TOKEN=` / `CERT_PASSWORD=` block:
```
# Certificado A1 (e-CNPJ) em base64 e a senha. Preenchidos pelo `pnpm run certificate`.
CERT_PFX_B64=
CERT_PASSWORD=
```
Add e.g. `# Senha do painel (/admin), como hash. Preenchida pelo `pnpm run admin-password`. Vazio desliga o painel.` then `ADMIN_PASSWORD=`.

### `src/env.ts` (config)
Add to interface (doc-comment style, lines 12-16) and `envFrom` (line 33-35 style). RESEARCH Open Q2: trim whitespace.
```typescript
/** Salted scrypt hash of the panel password, written by `pnpm run admin-password`; empty turns the panel off. */
ADMIN_PASSWORD: string
// envFrom:
ADMIN_PASSWORD: (vars.ADMIN_PASSWORD ?? '').trim(),
```

### `src/app.ts` modifications (middleware)

**Existing code to replace** (lines 54-62):
```typescript
const requireToken: MiddlewareHandler = async (c, next) => {
  const token = c.req.header('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!env.API_TOKEN || !timingSafeEqual(token, env.API_TOKEN)) return c.json({ error: 'unauthorized' }, 401)
  await next()
}
app.use('/v1/*', requireToken)
app.use('/health', requireToken)
```
Replace with the combined `requireAuth` from RESEARCH Pattern 3 (Authorization header present -> Bearer branch only, identical behavior; else session cookie + `X-CSRF-Token` on non-GET/HEAD; 401 `{ error: 'unauthorized' }`, 403 for CSRF). Keep `app.use('/v1/*', ...)` and `app.use('/health', ...)`.

**AppDeps** (lines 11-16): add optional `now?: () => number`; destructure with default `Date.now`.
**timingSafeEqual** (lines 22-26): move to `session.ts` (export) and import back, behavior unchanged; or export from `app.ts`-independent module to avoid circular imports.
**Key derivation precedent** (line 32): `createHmac('sha256', \`links:${env.API_TOKEN}\`)` — session key must use a different secret/label (`HMAC(ADMIN_PASSWORD,'admin-session')`).
**Conditional registration:** `const admin = env.ADMIN_PASSWORD ? { key: sessionKey(env.ADMIN_PASSWORD) } : undefined; if (admin) registerAdmin(app, {...})`. Register before the `onError` (line 81) or after; admin routes must not be registered when disabled (404 identical to today).
**Imports style** (lines 1-9): relative imports with `.ts` extension, `node:` prefix, `type` modifiers.
**Error handling:** `app.onError` (lines 81-85) returns JSON `{ error }`; admin routes should handle their own outcomes (HTML), not throw.

### `src/session.ts` (utility, transform + in-memory state)

**Analog:** `src/app.ts` lines 1, 22-26, 32 (HMAC + constant-time compare). Use RESEARCH Pattern 2 (cookie `id.exp.sig`, `csrfToken`), Pattern 4 (`createLoginThrottle` with injected `now`, `inFlight`, pruning, `clientIp` wrapping `getConnInfo` in try/catch with D-09 risk comment), Pattern 9 (`isHttps`). Code and comments in English (project convention); `/** ... */` doc comments per export, as in `app.ts`.

### `src/admin.ts` (routes + pages, request-response)

**Analog:** public route in `src/app.ts` lines 125-139 (non-JSON routes, plain pt-BR text errors `c.text('Link inválido.', 403)`, `timingSafeEqual` on a signature). Use: `registerAdmin(app: Hono, deps)`, `hono/html` templates (RESEARCH Pattern 6), `hono/cookie` (`setCookie/deleteCookie/getCookie`, Code Examples), `hono/body-limit`, headers (Pattern 7), origin check (Pattern 8), `/admin/*` guard (redirect 303 to `/login`). Routes: `GET /login`, `POST /login` (429+Retry-After when throttled, 401 + "Senha incorreta."), `POST /logout` (csrf form field, 303), `GET /admin`. All UI text pt-BR. Pico CSS link with SRI from RESEARCH Pattern 6.

### `src/password.ts` (utility, no analog)
Use RESEARCH Pattern 1 sketch (`scrypt:N:r:p:saltB64url:hashB64url`, N=65536 r=8 p=2, maxmem 256 MiB, async `crypto.scrypt`, bounds on parse, `validatePassword` pt-BR messages). Must live in `src/` (Dockerfile copies only `src`) and be importable from the `.mjs` script.

### Tests (`src/*.test.ts`)

**Analog:** `src/app.test.ts` lines 1-39 and 46-50.
```typescript
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { envFrom } from './env.ts'
import { createMemoryRepo } from './repo.ts'
const env = envFrom({ NFSE_ENVIRONMENT: 'restricted', ISSUER_CNPJ: '11222333000181', ISSUER_CITY_CODE: '3550308', API_TOKEN: TOKEN, /* ... */ })
const setup = (overrides: Partial<typeof env> = {}) =>
  createApp({ env: { ...env, ...overrides }, repo: createMemoryRepo(), gov, certificate: () => ({ error: '...' }) })
const app = setup(); await app.request('http://api.test/v1/notas', { headers: { authorization: 'Bearer wrong' } })
```
Reuse the `gov` stub (lines 22-26 of the test) and `setup`. Compute one hash per file in `beforeAll`. Drive client IP via `x-forwarded-for` (getConnInfo throws under `app.request`). `src/app.test.ts` Bearer tests must pass unchanged. Script test: temp dir with copied `scripts/admin-password.mjs`, `src/password.ts`, `.env.example`; run with piped stdin.

## Shared Patterns

### Constant-time compare
**Source:** `src/app.ts` lines 22-26. Apply to: session signature check, CSRF compare, Bearer check.

### HMAC with label separation
**Source:** `src/app.ts` line 32 (`createHmac('sha256', ...).update(...)`). Apply to session key, cookie signature, CSRF (labels `session:` / `csrf:`).

### Language and style
Code/comments English, UI/docs/script messages pt-BR; ESM with `.ts` import extensions; no semicolons, single quotes, 2-space indent, `/** */` doc comments on exports; no new dependencies.

### Script messages
`fail()` prints `Erro: ...` and exits 1 (certificate.mjs lines 15-18); final reminders to restart the server.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/password.ts` | utility | async KDF | No password hashing exists; use RESEARCH Pattern 1 |
| HTML pages in `src/admin.ts` | SSR templates | request-response | No HTML-rendering routes exist; use RESEARCH Pattern 6/7 |
| Login throttle in `src/session.ts` | in-memory state | event | No rate limiting exists; use RESEARCH Pattern 4 |

## Metadata

**Analog search scope:** `src/`, `scripts/`, `.env.example`, `package.json`
**Files read:** `src/app.ts` (1-140), `scripts/certificate.mjs`, `src/env.ts`, `src/app.test.ts` (1-50), `.env.example` (tail)
**Pattern extraction date:** 2026-11-20
**Note:** `src/server.ts`, `README.md` and `docs/` were not read; the planner should open them when planning those edits. The RESEARCH.md Validation Architecture section (past line 510) was not read.
