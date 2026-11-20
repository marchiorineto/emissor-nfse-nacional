# Phase 1: Admin Password and Login - Research

**Researched:** 2026-11-20
**Domain:** Password hashing (Node `crypto.scrypt`), stateless signed-cookie sessions, CSRF, login throttling, server-rendered HTML on Hono 4
**Confidence:** HIGH (everything is built from Node built-ins plus helpers already in the installed `hono`; the key behaviours were executed in this session)

## Summary

No new dependency is needed. Everything this phase requires ships with Node 22 (`node:crypto` scrypt, HMAC, `randomBytes`, `timingSafeEqual`) or with the installed `hono@4.13.18` (`hono/html`, `hono/cookie`, `hono/body-limit`, `hono/secure-headers`) and `@hono/node-server@2.1.6` (`getConnInfo`). The existing code already has the building blocks (`timingSafeEqual` in `src/app.ts`, `askHidden`/`setVar` in `scripts/certificate.mjs`). The work is wiring, plus a handful of traps that were found by running code, not by reading docs.

The traps that matter for planning: (1) `getConnInfo(c)` **throws** `TypeError` under `app.request(...)` (no `c.env.server`), so every test and the IP helper must wrap it; (2) Node's default scrypt `maxmem` is 32 MiB, so any `N >= 2^15` with `r=8` throws `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` unless `maxmem` is set; (3) the `$` in a `scrypt$...` hash is hostile: `setVar` copied with a string replacement would mangle it, and `docker compose` interpolates `$` in env files, so use a `$`-free hash format; (4) the package script loads `.env` into `process.env` before the script runs, so `process.env.ADMIN_PASSWORD` is already the **old hash**, which means the `CERT_PASSWORD`-style env-var input trick cannot reuse that name; (5) a stateless cookie cannot stop two parallel wrong-password requests from both passing a "not blocked" check, so mark the attempt in flight before awaiting scrypt.

**Primary recommendation:** Put the hash/verify code in one TypeScript module (`src/password.ts`) that BOTH `scripts/admin-password.mjs` and the server import (Node strips types natively, verified), put cookie/CSRF/rate-limit logic in `src/session.ts` with an injectable clock, put routes and pages in `src/admin.ts`, and change `requireToken` in `src/app.ts` into a combined middleware that checks `Authorization` first and only otherwise falls back to the cookie.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The session is a **stateless signed cookie**. There is no session table and no new migration. The cookie holds a random session id and an expiry, signed with HMAC-SHA256. The key is derived from the `ADMIN_PASSWORD` hash (for example `HMAC(hash, 'admin-session')`), so it never reuses `API_TOKEN`. Changing the hash invalidates every cookie automatically. — **Reversibility:** reversible — moving to a session table later only changes the cookie format, and existing sessions just log in again.
- **D-02:** A new password takes effect **only after the server restarts**, the same as `pnpm run certificate`. The server reads `.env` only at startup. The script must end by printing "Reinicie o servidor…". PASS-04 ("existing sessions stop working") holds because, after the restart, the HMAC key comes from the new hash.
- **D-03:** Expiry is **12 hours fixed from login**, with no sliding renewal. The expiry is checked on the server from the signed timestamp, and the cookie's Max-Age is also 12 h.
- **D-04:** **Logout only clears the cookie** (Max-Age=0). There is no revocation list, in memory or in the database. The user accepts that a copied cookie stays valid until its 12 h run out. Document this in the code.
- **D-05:** When the session has expired or is invalid:
  - `/v1` and `/health` answer **401 JSON**, the same as today without a token. The panel JS sends the browser to `/login`.
  - `/admin*` pages **redirect to `/login` on the server**.
- **D-06:** Cookie flags follow AUTH-04: HttpOnly, SameSite=Strict, Path=/, and Secure when the request comes over HTTPS. HTTPS means the request URL is `https:`, or `PUBLIC_URL` starts with `https://`, or the `X-Forwarded-Proto` header is `https`. The planner decides the exact detection.
- **D-07:** **Growing delay per IP**, with no hard lockout. Each consecutive failure increases the wait, for example 1 s, 2 s, 4 s and so on up to about 30 s. The counter lives in memory per IP, and is reset by a successful login or after a few minutes without failures. The map is pruned so it cannot grow without bound. The admin is never locked out for good.
- **D-08:** **No global limit.** The limit is per IP only.
- **D-09:** The client IP is **always read from `X-Forwarded-For`, using its LAST entry**, which is the one the nearest proxy appends. When the header is missing, the connection's IP is used (`@hono/node-server` `getConnInfo`). There is no new env var such as TRUST_PROXY. Accepted risk: when nothing sits in front of the server, an attacker can send a different fake XFF on each attempt to dodge the delay. The 12-character minimum plus scrypt still makes brute force impractical. Record this risk in a code comment.
- **D-10:** A wrong password shows only "Senha incorreta." (AUTH-03) and never says more.
- **D-11:** Pages are rendered on the server with Hono's **`html` tagged template (`hono/html`)**, which escapes values. There is no frontend build step and no static `public/` folder for HTML. Small JS for the panel can be inline or served by a Hono route. The planner chooses.
- **D-12:** The styling is **Pico.css from jsDelivr**, pinned to an exact version and loaded with an SRI `integrity` attribute and `crossorigin`. If the CDN fails, the pages show unstyled but still usable HTML, which is accepted. Nothing is vendored. Page markup stays classless or semantic, so it remains readable without CSS.
- **D-13:** In Phase 1, `/admin` is a **panel skeleton**: a header with the issuer's name or CNPJ and the environment badge (homologação/restrita vs produção); a "Sair" button; an empty main area where Phase 2 puts the notas list. All text is in Brazilian Portuguese.
- **D-14:** Login is a **classic form POST** that works without JS. A form on `GET /login` posts to `POST /login`. On success: a 303 redirect to `/admin`. On failure: `/login` is shown again with "Senha incorreta." and the field cleared. Return status 401 or 200, as the planner chooses. When a valid session already exists, `GET /login` may redirect to `/admin`.
- **D-15:** Logout is **`POST /logout`** from a form with the CSRF token. It clears the cookie and does a 303 redirect to `/login`. A GET does not log out.
- **D-16:** The CSRF token is **derived from the session** and needs no stored state: `csrf = HMAC(key, sessionId)`. The server puts it in a `<meta name="csrf-token">` on `/admin` pages and in a hidden field of server-rendered forms, such as logout. Panel JS sends it as the `X-CSRF-Token` header on POST calls to `/v1`. The server compares it in constant time.
- **D-17:** `POST /login` (made before any session exists) is protected by **checking `Origin`, or `Sec-Fetch-Site` when Origin is missing**. A cross-site value is refused. There is no pre-session token.
- **D-18:** A session can reach **`/v1/*` and `/health`**, the same reach as the Bearer token. CSRF is required on POSTs, which are the only write method today. If a `PUT`, `PATCH` or `DELETE` is ever added, it also needs CSRF.
- **D-19:** **The Bearer token takes priority.** If an `Authorization` header is present, only it is checked, exactly as today, and CSRF is not required. The cookie session is considered only when there is no `Authorization` header, and only when `ADMIN_PASSWORD` is set (AUTH-01). External systems see identical behavior: the existing `app.test.ts` Bearer tests must keep passing unchanged.
- **D-20:** `scripts/admin-password.mjs` follows `scripts/certificate.mjs`: run through a `package.json` script with the same node flags; uses `askHidden` for the two entries (no echo); uses `setVar` to replace or append `ADMIN_PASSWORD`, keeping every other line; creates `.env` from `.env.example` when missing and writes it with mode 0600; messages are in pt-BR. It rejects entries that differ, are empty, or have fewer than 12 characters, and leaves `.env` untouched in that case. Add `ADMIN_PASSWORD=` with a pt-BR comment to `.env.example`, and add `ADMIN_PASSWORD` to `src/env.ts`.

### Claude's Discretion

- The hash string format stored in `ADMIN_PASSWORD`. It must carry its own salt and scrypt parameters (for example `scrypt$N$r$p$saltB64$hashB64`). It must also be safe in `.env` without quoting: no spaces, quotes or `#`.
- The scrypt parameters (N, r, p, key length), within Node's default memory limit or with `maxmem` set explicitly.
- The exact backoff curve, the reset window and the pruning strategy for the rate limiter.
- How the delay is applied: wait before answering, or answer 429 with Retry-After.
- The cookie name and encoding, and the exact HTTPS detection.
- How to split the new code across modules, for example `src/admin.ts` for the routes and pages and `src/session.ts` for the cookie, CSRF and hashing, as long as they stay testable through `createApp` deps.
- What the script does without a TTY: fail with a clear message, or read from an env var as `certificate.mjs` does with `CERT_PASSWORD`.

### Deferred Ideas (OUT OF SCOPE)

None. The discussion stayed within the phase scope. (PANEL-07, health and certificate status on the panel, is already tracked for v2. D-18 makes `/health` reachable by the session so it is ready for that.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PASS-01 | `pnpm run admin-password` asks twice without echo | Reuse `askHidden` (raw-mode TTY) verbatim; add a piped-stdin branch for tests (see Pattern 5). New `package.json` script with the same node flags as `certificate`. |
| PASS-02 | Mismatch / empty / <12 chars exits with error, `.env` unchanged | Validate in shared `validatePassword()` BEFORE any `writeFileSync`; the script has exactly one write at the end. |
| PASS-03 | Stores only a salted scrypt hash; creates `.env` from `.env.example`; keeps other lines | `hashPassword()` in `src/password.ts`; `setVar` with a **function** replacement (hash is `$`-free but keep the function form); `chmodSync 0600`. |
| PASS-04 | Re-running replaces hash and old sessions stop working | Session key = `HMAC(ADMIN_PASSWORD, 'admin-session')` computed at `createApp` time; a new hash after restart gives a new key. Test by building two apps with different hashes. |
| AUTH-01 | Empty `ADMIN_PASSWORD`: `/login`, `/admin` 404; `/v1` Bearer only | Do not register the admin routes and skip the cookie branch when `!env.ADMIN_PASSWORD`. Hono's unmatched route gives the same `404 Not Found` as today (verified). |
| AUTH-02 | `/login` then land on `/admin` | `GET/POST /login` + 303 to `/admin`; `verifyPassword()` with async scrypt. |
| AUTH-03 | Wrong password: bare error; repeated failures slowed | Fixed text "Senha incorreta."; per-IP backoff with 429 + `Retry-After` (Pattern 4). |
| AUTH-04 | HttpOnly, SameSite=Strict, Secure on HTTPS, 12 h | `setCookie` from `hono/cookie` with `httpOnly`, `sameSite: 'Strict'`, `maxAge: 43200`, `secure`; signed expiry timestamp checked server-side. |
| AUTH-05 | Cookie works on `/v1`; POST needs CSRF; Bearer unchanged | Combined middleware (Pattern 3). |
| AUTH-06 | Logout; `/admin` without session redirects | `POST /logout` clears cookie + 303; `app.use('/admin/*', ...)` guard (matches `/admin` too, verified). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Password hash creation | CLI script (operator shell) | Shared `src/password.ts` | Operator has shell access; hash written to `.env`, plaintext never stored. |
| Password verification | API / Backend | — | Server holds the hash; scrypt runs server-side only. |
| Session issue/verify (signed cookie) | API / Backend | Browser (stores cookie, HttpOnly) | Stateless HMAC; the browser JS never sees the cookie. |
| CSRF token derivation and check | API / Backend | Browser (echoes token in header/field) | Token is `HMAC(key, sessionId)`; browser only relays it. |
| Login throttling | API / Backend (in-memory map) | Reverse proxy (supplies XFF) | State lives in the Node process; proxy supplies the client IP. |
| `/login` and `/admin` pages | Frontend Server (Hono SSR via `hono/html`) | CDN (Pico.css) | Server-rendered, no build step; CDN only serves CSS with SRI. |
| `/v1` auth (Bearer or cookie) | API / Backend | — | One middleware decides; Bearer path is untouched. |
| Redirect to `/login` on expiry | Frontend Server (pages) / Browser JS (for fetch 401s, Phase 2) | — | D-05. Phase 1 has no fetch calls from the panel, so no JS is required yet. |

## Standard Stack

### Core

No new packages. All verified present in this session.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` (Node 22.23.5 here; `engines >=22.18.0`) | built-in | `scrypt`, `createHmac`, `randomBytes`, `timingSafeEqual` | Already used in `src/app.ts`; D-01 and PROJECT prefer Node built-ins. [VERIFIED: package.json `"node": ">=22.18.0"`; `node --version` = v22.23.5] |
| `hono` | 4.13.18 (installed) | `hono/html`, `hono/cookie`, `hono/body-limit`, `hono/secure-headers` | Already the web framework. [VERIFIED: `node_modules/hono/package.json` version 4.13.18] |
| `@hono/node-server` | 2.1.6 (installed) | `getConnInfo` from `@hono/node-server/conninfo` | Fallback client IP. [VERIFIED: node_modules; `conninfo.mjs` read] |
| Pico.css | 2.1.1 (CDN, not an npm install) | Classless styling | Locked by D-12. [VERIFIED: `npm view @picocss/pico version` = 2.1.1, jsDelivr `tags.latest` = 2.1.1] |

### Supporting

None.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom `HMAC(exp)` cookie | `setSignedCookie` from `hono/cookie` | Hono's signed cookie signs only the value; expiry would still need to be inside the value, and its key is a raw secret string. Custom is ~25 lines and matches D-01/D-03 exactly. |
| `hono/csrf` middleware | Own Origin/Sec-Fetch-Site check on `POST /login` | Hono's `hono/csrf` defaults to "only same origin as the request URL" (breaks behind a proxy that rewrites Host/scheme) and allows the request if EITHER the origin OR the Sec-Fetch-Site validation passes, which is weaker than D-17. [VERIFIED: `node_modules/hono/dist/middleware/csrf/index.js` header comments read]. Own check can also use `PUBLIC_URL`. |
| `argon2` / `bcrypt` packages | `crypto.scrypt` | D-01/PROJECT: Node built-ins; native modules would break the "simple to run" constraint. Not applicable. |

**Installation:** none. `pnpm install` is unchanged.

**Version verification:** `hono` 4.13.18 and `@hono/node-server` 2.1.6 are the versions in `node_modules` (read). No version bump is needed.

## Package Legitimacy Audit

No external packages are installed by this phase, so the legitimacy gate does not apply.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none installed)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

Pico.css is loaded from jsDelivr at runtime under SRI, not installed.

## Architecture Patterns

### System Architecture Diagram

```
 OPERATOR SHELL                                   BROWSER                         EXTERNAL SYSTEM
 pnpm run admin-password                          GET /login                      Authorization: Bearer <API_TOKEN>
   | askHidden x2 (TTY) or 2 stdin lines            |                                   |
   v                                                v                                   v
 validatePassword (>=12, equal, <=max) --fail--> exit 1, .env untouched
   | ok                                        +--------------------- Hono app (createApp) ----------------------+
   v                                           |                                                                 |
 hashPassword (scrypt, random salt)            |  admin enabled? (env.ADMIN_PASSWORD non-empty)                  |
   v                                           |    no  -> routes not registered -> 404 (as today)               |
 setVar(.env, ADMIN_PASSWORD, hash), chmod 600 |    yes ->                                                       |
   v                                           |  GET /login --valid session--> 303 /admin                       |
 "Reinicie o servidor..."                      |  POST /login: bodyLimit -> origin/sec-fetch check               |
        (server restart reads .env)            |     -> throttle(ip)? --blocked--> 429 + Retry-After             |
                                               |     -> mark in-flight -> verifyPassword (async scrypt)          |
                                               |        fail: failures++ , blockedUntil -> 401 "Senha incorreta."|
                                               |        ok:   clear ip entry, Set-Cookie session -> 303 /admin   |
                                               |  /admin/*: valid cookie? no -> 303 /login ; yes -> skeleton HTML|
                                               |  POST /logout: csrf ok -> delete cookie -> 303 /login           |
                                               |                                                                 |
                                               |  /v1/* and /health (combined middleware)                        |
                                               |    Authorization header present? -> Bearer check ONLY (today)   |
                                               |    else admin enabled + valid cookie?                           |
                                               |         GET/HEAD -> next ; other methods need X-CSRF-Token      |
                                               |    else 401 {"error":"unauthorized"}                            |
                                               +-----------------------------------------------------------------+
```

### Recommended Project Structure

```
src/
├── password.ts        # hashPassword, verifyPassword, parseHash, validatePassword (shared with the script)
├── session.ts         # sessionKey, issue/verify cookie value, csrfToken, createLoginThrottle, clientIp, isHttps
├── admin.ts           # registerAdmin(app, deps): GET/POST /login, POST /logout, /admin guard + page, page templates
├── app.ts             # AppDeps gains optional `now`; requireToken becomes combined middleware; calls registerAdmin
├── env.ts             # + ADMIN_PASSWORD
├── password.test.ts   # hash round trip, parse limits, validation
├── session.test.ts    # cookie sign/verify/expiry/tamper, csrf, throttle curve, pruning
└── admin.test.ts      # app.request flows (login, 404 when disabled, CSRF, Bearer priority, logout, key change)
scripts/
└── admin-password.mjs # imports ../src/password.ts; copies askHidden/setVar from certificate.mjs
```

Note `tsconfig.json` includes only `src`, so `scripts/*.mjs` is not type-checked; keep the script thin and put logic under `src/`.

### Pattern 1: Hash format (`$`-free, self-describing)

**What:** `scrypt:<N>:<r>:<p>:<saltB64url>:<hashB64url>`. Characters are `[a-z0-9:_-]` only: no `$`, space, quote, `#`, `=` (base64url without padding).
**Why not `$`:** (a) `String.replace(pattern, text)` treats `$1`, `$&` in the replacement as special; the current `setVar` avoids it only because it passes a function `() => line` (verified in `scripts/certificate.mjs`); (b) Docker Compose interpolates `$` in unquoted/double-quoted env values and needs `$$` or single quotes [CITED: docs.docker.com/compose/how-tos/environment-variables/variable-interpolation]. README documents `docker run --env-file`, which does not interpolate, but a Compose user is plausible. A `$`-free format removes the whole class. Node's own `--env-file` parser kept `scrypt$16384$8$1$abc-_DEF$ghi-_JKL` verbatim in a test, so `$` would also work with `pnpm start`, but there is no benefit to taking the risk. [VERIFIED: ran `node --env-file` this session; printed `"scrypt$16384$8$1$abc-_DEF$ghi-_JKL"`]
**Parameters:** `N=65536, r=8, p=2, keylen=32, salt=16 random bytes`. This is one of OWASP's listed equivalent scrypt configurations (2^16, r=8, p=2) [CITED: cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html lists N=2^17/r=8/p=1 as the minimum, with N=2^16/p=2 down to N=2^13/p=10 as alternatives]. Measured here: ~365 ms, 64 MiB; N=2^17/p=1 is ~430 ms and 128 MiB, which is heavier under concurrent attempts on a small VPS. [VERIFIED: timing run this session: `65536 2 365ms`, `131072 1 428ms`]
**maxmem:** Node default is 32 MiB and `N=32768,r=8` already fails with `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` [VERIFIED: ran this session]. Always pass `maxmem: 256 * 1024 * 1024`.
**Verify-side bounds:** when parsing a stored hash, reject `N` that is not a power of two, `N > 2^20`, `r > 16`, `p > 16`, or wrong salt/hash lengths, so a corrupted `.env` cannot trigger a huge allocation. Fail closed (login always fails) and warn at startup.

```typescript
// src/password.ts (sketch). Source: node:crypto scrypt docs + measurements in this research.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 1024 // bounds the work a request can make us do
const PARAMS = { N: 65536, r: 8, p: 2, keylen: 32 }
const MAXMEM = 256 * 1024 * 1024

const derive = (password: string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, keylen, { N, r, p, maxmem: MAXMEM }, (error, key) => (error ? reject(error) : resolve(key))),
  )

/** Why a password is not acceptable, in pt-BR for the script; undefined when it is fine. */
export const validatePassword = (password: string): string | undefined => {
  const length = [...password].length // code points, not UTF-16 units
  if (!password) return 'a senha não pode ser vazia.'
  if (length < MIN_PASSWORD_LENGTH) return `a senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (length > MAX_PASSWORD_LENGTH) return `a senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`
  return undefined
}

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16)
  const key = await derive(password, salt, PARAMS.N, PARAMS.r, PARAMS.p, PARAMS.keylen)
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), key.toString('base64url')].join(':')
}

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parsed = parseHash(stored) // undefined when malformed or outside the bounds
  if (!parsed || [...password].length > MAX_PASSWORD_LENGTH) return false
  const key = await derive(password, parsed.salt, parsed.N, parsed.r, parsed.p, parsed.hash.length)
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash)
}
```

Use the **async** `crypto.scrypt`, never `scryptSync`, on the server: ~0.35 s of `scryptSync` blocks the event loop and therefore every `/v1` call and every in-flight government request. The script may use either.

Unicode: `normalize('NFKC')` before hashing in both hash and verify (same function, so they cannot diverge). OWASP only requires accepting all code points and not mangling input [CITED: cheatsheetseries.owasp.org Password Storage]; the NFKC choice itself is [ASSUMED] (it follows NIST 800-63B guidance from training knowledge) and is optional; if the planner prefers zero transformation, drop it in the single `derive` helper.

### Pattern 2: Signed stateless session cookie + derived CSRF

**What:** `key = HMAC-SHA256(ADMIN_PASSWORD, 'admin-session')` computed once in `createApp`. Cookie value `"<id>.<expSeconds>.<sig>"` where `id = randomBytes(16).toString('base64url')`, `exp = floor(now/1000) + 43200`, `sig = base64url(HMAC(key, 'session:' + id + '.' + exp))`. CSRF `= base64url(HMAC(key, 'csrf:' + id))`. The distinct `session:`/`csrf:` labels stop one HMAC output from being valid as the other.
**Cookie name:** `nfse_admin` (plain). Do not use the `__Host-` prefix: it forces `Secure`, which a plain-HTTP local install would silently lose. All characters in the value (`[A-Za-z0-9_.-]`) survive Hono's cookie encode/decode unchanged.
**Verify:** split into exactly 3 parts, regex-check each, recompute sig, `timingSafeEqual` (the existing helper), then `exp * 1000 > now()`. Return `{ id } | undefined`.
**D-04 comment to include in code:** logout only clears the cookie; a copied cookie stays valid until `exp`; accepted by the user.

```typescript
// src/session.ts (sketch)
import { createHmac, randomBytes } from 'node:crypto'
export const SESSION_SECONDS = 12 * 60 * 60
export const sessionKey = (adminHash: string): Buffer => createHmac('sha256', adminHash).update('admin-session').digest()
const sign = (key: Buffer, label: string): string => createHmac('sha256', key).update(label).digest('base64url')

export const issueSession = (key: Buffer, nowMs: number): { value: string; id: string } => {
  const id = randomBytes(16).toString('base64url')
  const exp = Math.floor(nowMs / 1000) + SESSION_SECONDS
  return { id, value: `${id}.${exp}.${sign(key, `session:${id}.${exp}`)}` }
}
export const readSession = (key: Buffer, value: string | undefined, nowMs: number): { id: string } | undefined => {
  const match = /^([A-Za-z0-9_-]{22})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value ?? '')
  if (!match) return undefined
  const [, id = '', exp = '', sig = ''] = match
  if (!safeEqual(sig, sign(key, `session:${id}.${exp}`))) return undefined
  return Number(exp) * 1000 > nowMs ? { id } : undefined
}
export const csrfToken = (key: Buffer, id: string): string => sign(key, `csrf:${id}`)
```

(`safeEqual` = the existing `timingSafeEqual(a, b)` from `src/app.ts`; export it from a small shared place or move it into `session.ts` and import it back into `app.ts`. Moving it must not change its behaviour.)

CSRF design is consistent with OWASP's guidance that the strongest token variant is an HMAC bound to the session with a server secret, compared in constant time, and that unbound signed tokens give little protection [CITED: cheatsheetseries.owasp.org CSRF Prevention Cheat Sheet].

### Pattern 3: Combined auth middleware (D-18, D-19)

```typescript
// in createApp, replacing requireToken (Bearer branch must stay byte-for-byte the same behaviour)
const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('authorization')
  if (header !== undefined) {                       // present (even empty): Bearer only, as today
    const token = header.replace(/^Bearer /, '')
    if (!env.API_TOKEN || !timingSafeEqual(token, env.API_TOKEN)) return c.json({ error: 'unauthorized' }, 401)
    return next()
  }
  const session = admin ? readSession(admin.key, getCookie(c, COOKIE), now()) : undefined
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const safe = c.req.method === 'GET' || c.req.method === 'HEAD'
  if (!safe && !safeEqual(c.req.header('x-csrf-token') ?? '', csrfToken(admin.key, session.id))) {
    return c.json({ error: 'invalid csrf token' }, 403)
  }
  return next()
}
app.use('/v1/*', requireAuth)
app.use('/health', requireAuth)
```

Decisions baked in:
- "Not GET/HEAD requires CSRF" (rather than "POST requires") satisfies D-18's "if PUT/PATCH/DELETE is ever added" with no later change.
- Missing/wrong CSRF answers **403**, not 401, so Phase 2/3 JS can tell "log in again" (401) from "bad token" (403). D-05 only specifies 401 for expired/invalid sessions.
- Today `c.req.header('authorization')` for a missing header returns `undefined`; keep the `!== undefined` test so an empty `Authorization:` header stays on the Bearer path and gets 401 like today.
- `admin` is `undefined` when `ADMIN_PASSWORD` is empty, so the cookie branch is dead code and `/v1` is identical to today (AUTH-01).
- The existing tests in `src/app.test.ts` must pass untouched; run them first after the change.

### Pattern 4: Login throttle (D-07..D-10) and client IP

**Recommendation: answer 429 + `Retry-After` and do NOT verify the password while blocked.** Waiting inside the handler (setTimeout then answer) lets an attacker fire many parallel requests, each of which still runs scrypt after its delay; rejecting blocked attempts before scrypt both slows and bounds CPU. The login page re-renders with "Muitas tentativas. Tente de novo em N s." (a different state from "wrong password", and it reveals nothing about correctness because the password was not checked).

State per IP: `{ failures, blockedUntil, lastFailureAt, inFlight }`.
- Delay after the n-th consecutive failure: `min(2^(n-1), 30)` seconds (1, 2, 4, 8, 16, 30, 30...).
- A failure older than 10 minutes resets `failures` to 0 before counting (D-07 "after a few minutes").
- Success deletes the entry.
- **`inFlight`:** set to true before `await verifyPassword`, cleared in `finally`. A second concurrent attempt from the same IP gets the 429 path. Without this, N parallel requests all pass the `blockedUntil` check before the first failure is recorded (async scrypt makes this real).
- Pruning: on every call drop entries whose `blockedUntil` and `lastFailureAt + 10 min` have both passed (cheap scan only when `map.size > 100`), plus a hard cap of 10 000 entries evicting the oldest (`Map` keeps insertion order). Cap key length (`slice(0, 64)`).
- Inject the clock (`now`) so tests assert the curve without sleeping.

**Client IP (D-09):** `x-forwarded-for` split on `,`, last entry trimmed; else `getConnInfo(c).remote.address`; else `'unknown'`. **`getConnInfo` throws a `TypeError` when called through `app.request()` (no `c.env.server`)**, so it must be wrapped in `try/catch`. [VERIFIED: ran it: `THROWS Cannot read properties of undefined (reading 'server')`; source read in `node_modules/@hono/node-server/dist/conninfo.mjs`]. Tests drive the IP with the `X-Forwarded-For` header. Put the D-09 accepted-risk comment next to this helper. Two further caveats worth a code comment: behind two chained proxies (for example a CDN then Caddy) the last entry is the CDN edge, so users behind the same edge share one counter; with the 30 s cap that is tolerable for a single-operator install.

### Pattern 5: Script (`scripts/admin-password.mjs`)

- Imports `validatePassword`, `hashPassword` from `../src/password.ts`. A plain `.mjs` can import a `.ts` file with no flag beyond what the package script already passes (Node 22.18+ strips types by default; ExperimentalWarning is silenced by `--disable-warning=ExperimentalWarning`). [VERIFIED: ran an `.mjs` importing a `.ts` with those flags this session; printed `3`]
- `package.json`: `"admin-password": "node --openssl-legacy-provider --disable-warning=ExperimentalWarning --env-file-if-exists=.env scripts/admin-password.mjs"`. (`--openssl-legacy-provider` is unnecessary for this script but keeping the same flags is what D-20 asks for and it is harmless.)
- **`process.env.ADMIN_PASSWORD` is the old hash** because the package script loads `.env` before the script runs. Do not read the new password from `ADMIN_PASSWORD` the way `certificate.mjs` reads `CERT_PASSWORD`.
- No-TTY behaviour (discretion): **when stdin is not a TTY, read two lines from stdin** with `node:readline` (`printf 'pw\npw\n' | pnpm run admin-password`). This avoids a password-in-env-var and makes PASS-01..03 testable with `execFileSync(..., { input })`. [VERIFIED: readline over piped stdin returned both lines]. With a TTY use `askHidden` unchanged (it rejects when `!stdin.isTTY`, so branch before calling it).
- Order of operations: read both entries, `validatePassword`, compare, `hashPassword`, only then read `.env` (or `.env.example`) and write once. Any failure `fail(...)` exits before the write, so `.env` is byte-identical (PASS-02).
- Do not `trim()` the password; spaces are legitimate. Reject `\r`/`\n` only if reading piped input could include them (readline strips the line terminator).
- `setVar` must keep the function replacement `text.replace(pattern, () => line)`. Existing `.env.example` gets `ADMIN_PASSWORD=` so the replace path is the common one; the append path covers an older `.env`.
- `writeFileSync(ENV_FILE, text, { mode: 0o600 })` only applies the mode when the file is created, so keep the following `chmodSync(ENV_FILE, 0o600)` as `certificate.mjs` does. A single-file Docker bind mount of `.env` rules out write-then-rename; keep the plain overwrite.
- Final messages (pt-BR): confirm what was written, then "Reinicie o servidor para usar esta senha. As sessões abertas deixam de valer." (D-02).
- Script integration test without any production seam: in a temp dir create `scripts/` and `src/`, copy `scripts/admin-password.mjs`, `src/password.ts` and `.env.example`, run `node <flags> scripts/admin-password.mjs` with `cwd` there and piped stdin. The script derives its root from `import.meta.dirname/..`, so it writes to the temp `.env`, never the real one.

### Pattern 6: Pages with `hono/html` (D-11..D-15)

- `c.html(html\`...\`)` escapes every interpolated value; literal template text is not escaped, nested `html\`\`` is not double-escaped. [VERIFIED: ran it: `${'<script>x</script>'}` rendered `&lt;script&gt;x&lt;/script&gt;`, nested `${'&"'}` rendered `&amp;&quot;`]. Content type is `text/html; charset=UTF-8` (verified).
- Layout shell: `<!doctype html><html lang="pt-BR">`, `<meta charset>`, viewport, `<meta name="color-scheme" content="light dark">`, and the Pico link:

```html
<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/@picocss/pico@2.1.1/css/pico.min.css"
  integrity="sha384-L1dWfspMTHU/ApYnFiMz2QID/PlP1xCW9visvBdbEkOLkSSWsP6ZJWhPw6apiXxU"
  crossorigin="anonymous">
```
  [VERIFIED: downloaded `https://cdn.jsdelivr.net/npm/@picocss/pico@2.1.1/css/pico.min.css` (83 319 bytes) and computed `sha384` with `openssl dgst -sha384 -binary | openssl base64 -A`]. Re-verify the hash if the version is ever bumped; if SRI mismatches, the browser blocks the stylesheet (page stays usable, per D-12).
- Pico v2 is classless-friendly with `<main class="container">` being the only class recommended; a bare `<main>`, `<header>`, `<form>`, `<input>`, `<button>` look decent without classes. [ASSUMED: from Pico docs knowledge; not fetched this session]. The `class="container"` attribute is harmless if the planner wants it; D-12 says markup "stays classless or semantic", so prefer `<body><header><main>` semantic tags.
- `/login` form: `<form method="post" action="/login">`, `<input type="password" name="password" autocomplete="current-password" required autofocus>`, a `<button>Entrar</button>`, an error `<p role="alert">` only when needed. The field is naturally empty after the re-render (nothing echoed).
- `/admin` skeleton: `<header>` with the issuer CNPJ formatted `NN.NNN.NNN/NNNN-NN` (the Env has `ISSUER_CNPJ` only, no company name [VERIFIED: `src/env.ts` read; there is no name field]), an environment badge from `NFSE_ENVIRONMENT` (`restricted` shows "Homologação (produção restrita)", `production` shows "Produção"; [VERIFIED: `.env.example` documents `"restricted"` and `"production"`]), a logout form (`method=post action=/logout` with `<input type=hidden name=csrf value=...>` and `<button>Sair</button>`), `<meta name="csrf-token" content="...">` in `<head>`, and an empty `<main>` for Phase 2.
- Phase 1 needs **no panel JavaScript** (login and logout are form posts). Phase 2 will add a script; plan it as a Hono route (for example `GET /admin/app.js`) rather than inline so a strict CSP can stay `script-src 'self'`.

### Pattern 7: Response headers for the HTML routes

Apply to `/login` and `/admin*` (a `app.use` with `hono/secure-headers` configured per route, or set by hand):
- `Cache-Control: no-store` (the page embeds the CSRF token; a login page must not be cached).
- `Content-Security-Policy: default-src 'none'; style-src https://cdn.jsdelivr.net; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`. `img-src data:` is required because Pico's CSS embeds 14 `data:image/svg+xml` URLs for form icons. [VERIFIED: `grep -o 'url(...)'` on the downloaded `pico.min.css`: 13 + 1 `data:image/svg+xml` occurrences]. `hono/secure-headers` exposes `contentSecurityPolicy` with `formAction` and `frameAncestors`. [VERIFIED: `secure-headers.d.ts` lines 16-17, 53]. If Pico's `font`/other loads break the page in a manual check, relax only that directive.
- `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.

### Pattern 8: `POST /login` cross-site check (D-17)

Order: (1) if `Sec-Fetch-Site` is present, accept only `same-origin` (and `none`, a user-typed navigation); refuse `cross-site` and `same-site`; (2) else if `Origin` is present, compare it with the allowed origins; (3) else (neither header: curl, very old browsers) accept. `Origin: null` is a mismatch, never allowlisted. OWASP names `Sec-Fetch-Site` as the primary signal, with Origin as the fallback, warns that missing headers do not prove same-origin, and says `null` must not be allowlisted [CITED: cheatsheetseries.owasp.org CSRF Prevention Cheat Sheet]. D-17 literally says "Origin, or Sec-Fetch-Site when Origin is missing"; checking Sec-Fetch-Site first is a superset that refuses everything D-17 refuses, and it is robust to a proxy that rewrites `Host`. Surface this ordering to the planner as a deliberate refinement of D-17.
Allowed origins for the Origin fallback: `PUBLIC_URL` origin if set, else `new URL(c.req.url).origin`, plus the `X-Forwarded-Proto` + `X-Forwarded-Host` pair if present. (Origin is only consulted when Sec-Fetch-Site is absent, so this fallback matters mostly for old browsers.)
Login CSRF here is low-impact (one operator, SameSite=Strict session), which is why D-17 rejects a pre-session token; OWASP does recommend pre-sessions for login forms in general, so keep the Origin check strict. [CITED: same OWASP page]
Also add `hono/body-limit` (about 4 KB) on `POST /login` and the `MAX_PASSWORD_LENGTH` check before hashing, and parse with `await c.req.parseBody()`; treat a non-string `password` as a failure.

### Pattern 9: HTTPS detection for `Secure` (D-06)

`secure = new URL(c.req.url).protocol === 'https:' || env.PUBLIC_URL.startsWith('https://') || /(^|,)\s*https\s*(,|$)/i.test(c.req.header('x-forwarded-proto') ?? '')`. Any single positive signal is enough. A spoofed `https` over plain HTTP only makes the browser discard the attacker's own cookie, and nothing in this design lets an attacker force `Secure` off for a victim. Chrome and Firefox accept `Secure` cookies on `http://localhost`; Safari does not, so a local Safari test over HTTP may not keep the session if a proxy header lies. [ASSUMED: browser behaviour from training knowledge]

### Anti-Patterns to Avoid

- **`scryptSync` on the request path:** blocks the event loop ~0.35 s per attempt; use `crypto.scrypt`.
- **Sleeping before replying as the throttle:** parallel requests all still run scrypt; reject blocked attempts first.
- **A string replacement in `setVar`:** `$` sequences are interpreted; keep the `() => line` function form.
- **Reusing `API_TOKEN` for the session key or CSRF:** D-01 forbids it; links already derive from `API_TOKEN` (`links:` label) and must stay independent.
- **Registering admin routes unconditionally and returning 404 inside them:** diverges from "exactly as today" (response headers, 404 body); do not register.
- **Calling `getConnInfo` bare:** throws in tests and when `c.env` has no `server`.
- **Putting the CSRF token in a cookie or localStorage:** it is rendered in the page (`<meta>`/hidden field) per D-16.
- **Echoing `Origin`/`Host`/`X-Forwarded-*` into HTML:** never interpolate request headers into pages (the `html` template would escape them, but there is no reason to).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password KDF | Iterated SHA-256 or a home-made stretch | `crypto.scrypt` (async) with random salt | Memory-hard, built into Node, already the locked choice. |
| Constant-time compare | `===` on secrets | Existing `timingSafeEqual(a, b)` in `src/app.ts` (length-checked wrapper over `crypto.timingSafeEqual`) | Raw `crypto.timingSafeEqual` throws on unequal lengths. |
| Cookie header serialization | String-concatenated `Set-Cookie` | `setCookie`/`deleteCookie`/`getCookie` from `hono/cookie` | Handles attribute casing, validation (Max-Age cap, SameSite values), parsing. [VERIFIED: `node_modules/hono/dist/helper/cookie/index.js` read] |
| HTML escaping | Template strings with manual `replace` | `html` from `hono/html` | Escapes interpolations automatically (verified). |
| Request body size cap | Reading the stream by hand | `bodyLimit` from `hono/body-limit` [VERIFIED: `node_modules/hono/dist/middleware/body-limit/index.js` exists] | Standard middleware. |
| Security headers | Hand-set strings everywhere | `secureHeaders` from `hono/secure-headers` [VERIFIED: `.d.ts` read] or one small `app.use` | Fewer typos in CSP. |
| `.env` line replacement | New parser | Existing `setVar` (copy) | Already handles replace-or-append, CRLF (`.` stops before `\r`), and does not match `ADMIN_PASSWORD_X`. |

**Key insight:** every security-sensitive primitive here already exists in Node or Hono; the risk is in composing them (async races, test-time `getConnInfo`, `$` handling, `maxmem`), not in writing crypto.

## Runtime State Inventory

Not a rename/refactor/migration phase. Skipped as instructed. One adjacent note: there is **no stored runtime state** introduced (no DB, no migration, per D-01), only the in-memory throttle map, which a restart clears by design.

## Common Pitfalls

### Pitfall 1: `getConnInfo` throws outside a real server
**What goes wrong:** `TypeError: Cannot read properties of undefined (reading 'server')` in every `app.request()` test (and any non-Node adapter).
**Why:** it reads `c.env.server ?? c.env`, then `.incoming.socket`. [VERIFIED: source + run]
**How to avoid:** `try { return getConnInfo(c).remote.address ?? 'unknown' } catch { return 'unknown' }`; tests set `X-Forwarded-For`.
**Warning signs:** 500s on `/login` only in tests.

### Pitfall 2: scrypt `maxmem`
**What goes wrong:** `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` for `N >= 32768, r = 8` with default options; login and the script both crash. [VERIFIED: ran]
**How to avoid:** pass `maxmem: 256 MiB` in the single `derive` helper; bound `N/r/p` on parse.

### Pitfall 3: `.env` value mangling
**What goes wrong:** `$` in the hash eaten by `String.replace` or by Compose interpolation; `#` starting a comment; `=`/`+`/`/` from standard base64 surprising other parsers.
**How to avoid:** `$`-free, base64url, no padding. Add a test: `setVar` round-trip of a hash into a text with other lines (CRLF too) and `--env-file` style parse check with `util.parseEnv` [VERIFIED: `typeof require('node:util').parseEnv` is `function` on Node 22.23.5].

### Pitfall 4: Parallel guesses bypass the throttle
**What goes wrong:** 50 concurrent POSTs from one IP all see `failures = 0`.
**How to avoid:** `inFlight` flag per IP (Pattern 4); test with `Promise.all` of several wrong passwords and assert at most one reaches `verifyPassword` (inject a counting verifier, or assert the others get 429).

### Pitfall 5: The old hash is in `process.env` when the script runs
**What goes wrong:** a copied `process.env.CERT_PASSWORD`-style shortcut would read the previous hash as the "plaintext".
**How to avoid:** no env-var input; TTY via `askHidden`, otherwise two stdin lines.

### Pitfall 6: Sessions "not stopping" after re-running the script
**What goes wrong:** the operator runs the script but does not restart, and old cookies keep working (the process still holds the old key).
**Why:** the key is derived at `createApp` time from the startup env (D-02).
**How to avoid:** the script's last lines must say to restart and that sessions end then; README must say it too; PASS-04 test builds two apps (old hash, new hash) and shows the cookie from the first is refused by the second.

### Pitfall 7: Wrong password and expired cookie must not look different from "no session" to the API
`/v1` must return exactly `{ error: 'unauthorized' }` 401 for expired, tampered or missing cookies (D-05). A distinct message would leak whether a cookie was well-formed. Only the CSRF failure uses 403.

### Pitfall 8: Stale CSRF meta after re-login
The CSRF token is bound to the cookie's `id`, which changes on every login, so a page rendered under an older session carries a token that no longer matches. Normal flow (login then render `/admin`) is fine; the Phase 2 JS should treat 403 `invalid csrf token` as "reload the page".

### Pitfall 9: Redirect loops
`GET /login` redirects to `/admin` when the session is valid, and `/admin` redirects to `/login` when not. Both decisions use the same `readSession`, so they cannot disagree; do not add a second check.

### Pitfall 10: Dockerfile does not copy `scripts/`
[VERIFIED: `Dockerfile` copies only `package.json`, lockfile, `migrations`, `src`] so `pnpm run admin-password` cannot run inside the container image. The operator runs it on the host (like `pnpm run certificate`) and starts the container with `--env-file .env` (README line 150). Document this in the README section; no Dockerfile change is required, but `src/password.ts` must stay inside `src/` so the server image has it.

## Code Examples

### Cookie options (Hono)
```typescript
// Source: node_modules/hono/dist/helper/cookie/index.js (setCookie/deleteCookie read this session)
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
setCookie(c, 'nfse_admin', value, { httpOnly: true, sameSite: 'Strict', path: '/', maxAge: SESSION_SECONDS, secure: isHttps(c) })
deleteCookie(c, 'nfse_admin', { path: '/', secure: isHttps(c) }) // sets Max-Age=0
```

### Conditional registration (AUTH-01)
```typescript
// In createApp: `admin` is undefined when ADMIN_PASSWORD is empty; routes are then never registered,
// so Hono's own 404 answers /login and /admin, exactly like any unknown path today.
const admin = env.ADMIN_PASSWORD ? { key: sessionKey(env.ADMIN_PASSWORD) } : undefined
if (admin) registerAdmin(app, { env, key: admin.key, now })
```

### Guard for the pages
```typescript
// `/admin/*` also matches `/admin` itself (verified); `/admin/` with a trailing slash is a 404 in Hono's default router.
app.use('/admin/*', async (c, next) => {
  if (!readSession(key, getCookie(c, COOKIE), now())) return c.redirect('/login', 303)
  await next()
})
```
[VERIFIED: ran a Hono app: `/admin` -> middleware ran, 200; `/admin/` -> 404; `/admin/x` -> middleware ran; `/adminx` -> 404 without middleware]. Note: the `/admin/` (trailing slash) 404 means an unauthenticated visitor to `/admin/` sees 404, not a redirect; acceptable, or register `app.get('/admin/', c => c.redirect('/admin'))` inside the admin block.

### Test style (matches `src/app.test.ts`)
```typescript
const app = createApp({ env: { ...env, ADMIN_PASSWORD: await hashPassword('correct horse battery') }, repo: createMemoryRepo(), gov, certificate, now: () => clock })
const res = await app.request('http://api.test/login', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.9', 'sec-fetch-site': 'same-origin' },
  body: new URLSearchParams({ password: 'correct horse battery' }),
})
expect(res.status).toBe(303)
const cookie = res.headers.get('set-cookie')!.split(';')[0]
```
Hash in tests costs ~0.4 s each at production parameters; create it once per file (`beforeAll`), or let `hashPassword` take optional lower `N` for tests only if the planner wants speed (not recommended: it adds a production parameter path). Prefer one shared hash per test file.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Origin-only CSRF checks | `Sec-Fetch-Site` first, Origin fallback | OWASP guidance now calls Sec-Fetch-Site the primary signal | Pattern 8 order. [CITED: OWASP CSRF cheat sheet] |
| Sync KDF calls | Async `crypto.scrypt` | long-standing | Keeps the event loop free. |
| Lax cookies by default | `SameSite=Strict` explicit | browsers default to Lax now; D-06 wants Strict | `Strict` also blocks the cookie on top-level cross-site navigations, so a link from another site to `/admin` lands without the cookie and redirects to `/login` once; accepted trade-off. |

**Deprecated/outdated:** nothing relevant; Pico 2.1.1 is the current `latest` on npm and jsDelivr (published 2025-03-15 per registry `time.modified`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | NFKC normalization before hashing is desirable (NIST guidance) | Pattern 1 | Low; optional, one-line removal. Must be identical in hash and verify. |
| A2 | Pico bare semantic tags look fine without classes | Pattern 6 | Low; cosmetic. |
| A3 | Chrome/Firefox keep `Secure` cookies on `http://localhost`, Safari does not | Pattern 9 | Low; affects local manual testing only. |
| A4 | 401 (not 200) on wrong password is acceptable although RFC 9110 expects `WWW-Authenticate` with 401 | Pattern 4/Login | Low; D-14 leaves 401/200 to the planner. Recommend 401 for clarity in tests and logs. |

## Open Questions (RESOLVED)

1. **Does the planner accept the refinement of D-17 (Sec-Fetch-Site first, Origin fallback, accept when both are absent)?**
   - What we know: it refuses a superset of what D-17 refuses and survives a proxy rewriting `Host`.
   - What's unclear: whether "accept when neither header exists" is wanted (curl tests need it).
   - Recommendation: accept, and cover all three branches in tests.
   - **RESOLVED:** accepted. `POST /login` checks `Sec-Fetch-Site` first (`same-origin` and `none` pass; `cross-site` and `same-site` get 403 `Pedido recusado.`), falls back to `Origin` only when `Sec-Fetch-Site` is absent (`null` and foreign origins refused), and proceeds when neither header exists. Implemented by plan 01-03 Task 3 (`sameOriginLogin`), with tests for all three branches.
2. **Should a malformed non-empty `ADMIN_PASSWORD` disable the panel or fail closed with login always failing?**
   - Recommendation: keep the routes (so the operator sees `/login`), make every login fail, and log a startup warning in `src/server.ts` ("nfse: ADMIN_PASSWORD is not a valid hash; run pnpm run admin-password"). Whitespace-only value should be treated as empty (`.trim()` in `envFrom`).
   - **RESOLVED:** fail closed, panel stays registered. `parseHash`/`verifyPassword` reject a malformed hash with `false` (plan 01-01 Task 2); routes stay registered for a non-empty value and a whitespace-only value counts as empty via `.trim()` in `envFrom` (plan 01-02); the startup notice logs the "not a valid hash" warning without printing the hash (plan 01-04: `adminPanelNotice` in Task 2, logged at startup in Task 3).
3. **Phase 2 JS 401 handling:** out of scope here, but the 401/403 split chosen in Pattern 3 is the contract Phase 2 will rely on.
   - **RESOLVED (out of scope for Phase 1):** Phase 2 owns the client-side 401 handling. Phase 1 only fixes the contract it relies on: a missing or expired session answers 401 and a CSRF failure answers 403 `{ error: 'invalid csrf token' }` (plan 01-04).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server, script, tests | ✓ | v22.23.5 | — |
| pnpm | `pnpm run ...` | ✓ | 12.21.0 via corepack (project pins `pnpm@11.15.1`; corepack tried to download 12.21.0, but `pnpm test` and `typecheck` ran fine) | `node ...` directly |
| `xmllint`, `xmlsec1`, `openssl` | existing test suite (not this phase's tests) | ✓ | present | — |
| Network to `cdn.jsdelivr.net` | SRI hash computation (done); runtime browser load | ✓ at research time | — | pages degrade to unstyled (D-12) |
| Interactive TTY | manual check of the no-echo prompt | ✗ in this agent environment | — | Planner should add a manual verification item for "no echo" (PASS-01); the piped-stdin path covers the rest automatically |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** TTY (manual verify for the hidden-input behaviour).

Baseline: `pnpm test` = 9 files, 100 passed, 1 skipped; `pnpm run typecheck` clean. [VERIFIED: ran both this session]

## Validation Architecture

`.planning/config.json` does not exist, so `workflow.nyquist_validation` is treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^5.1.0 (installed; tests pass) |
| Config file | none (defaults pick up `src/**/*.test.ts`) |
| Quick run command | `pnpm exec vitest run src/password.test.ts src/session.test.ts src/admin.test.ts src/app.test.ts` |
| Full suite command | `pnpm test && pnpm run typecheck` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PASS-01 | Script prompts twice (no echo) | manual (TTY) + integration with piped stdin | `pnpm exec vitest run src/adminPasswordScript.test.ts` (tmp-dir copy, piped stdin) | ❌ Wave 0 |
| PASS-02 | Mismatch, empty, <12 chars: exit non-zero, `.env` byte-identical | integration | same file | ❌ Wave 0 |
| PASS-03 | Hash written, other lines kept, `.env` created from `.env.example`, mode 0600, no plaintext in file | integration + unit (`setVar`) | same file | ❌ Wave 0 |
| PASS-04 | Cookie from old hash refused by app built with new hash | unit/app | `pnpm exec vitest run src/admin.test.ts -t "new hash"` | ❌ Wave 0 |
| AUTH-01 | Empty `ADMIN_PASSWORD`: `/login`, `/admin`, `POST /login`, `POST /logout` are 404; `/v1` cookie ignored; Bearer works | app | `pnpm exec vitest run src/admin.test.ts -t "disabled"` | ❌ Wave 0 |
| AUTH-02 | Correct password: 303 to `/admin`, page renders issuer + badge + Sair | app | `-t "login"` | ❌ Wave 0 |
| AUTH-03 | Wrong password: 401 with exactly "Senha incorreta."; second attempt within the delay: 429 + `Retry-After`; curve 1,2,4..30; reset after window; parallel attempts; pruning cap | session + app (injected clock) | `pnpm exec vitest run src/session.test.ts src/admin.test.ts -t "throttle"` | ❌ Wave 0 |
| AUTH-04 | `Set-Cookie` has `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=43200`; `Secure` for https URL, `PUBLIC_URL=https`, `X-Forwarded-Proto: https`; absent otherwise; expiry enforced at 12 h + 1 s via injected `now` | app | `-t "cookie"` | ❌ Wave 0 |
| AUTH-05 | Cookie GET `/v1/notas` 200; cookie POST `/v1/notas` without token 403, with token 200; Bearer POST without CSRF 200; Bearer + bad cookie unaffected; bad Bearer + good cookie still 401 (D-19) | app | `-t "csrf"` and `src/app.test.ts` unchanged | partial (app.test.ts exists) |
| AUTH-06 | `/admin` without/expired/tampered cookie: 303 `/login`; `POST /logout` with token: cookie cleared + 303; GET `/logout` is 404/405 | app | `-t "logout"` | ❌ Wave 0 |

Cross-site checks for `POST /login` (D-17): `sec-fetch-site: cross-site` refused; `origin: https://evil.example` with no Sec-Fetch-Site refused; `origin: null` refused; same-origin accepted; neither header accepted.

### Sampling Rate
- **Per task commit:** the quick run command above
- **Per wave merge:** `pnpm test && pnpm run typecheck`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/password.test.ts`: hash format (regex `^scrypt:\d+:\d+:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$`), round trip, wrong password, malformed/out-of-bounds hash returns false, `validatePassword` cases (empty, 11 vs 12 code points, emoji counted once, max)
- [ ] `src/session.test.ts`: sign/verify/tamper/expiry/key change, CSRF derivation, throttle curve and pruning
- [ ] `src/admin.test.ts`: all `app.request` flows above, one shared hash in `beforeAll`
- [ ] script integration test (tmp-dir copy of `scripts/admin-password.mjs`, `src/password.ts`, `.env.example`; piped stdin; assert exit code, file bytes, mode)
- [ ] manual check list: no echo on a real TTY; browser shows Pico styling with SRI; cookie flags in devtools over HTTPS

## Security Domain

`security_enforcement` is not set to false (no config file), so this section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | scrypt salted hash, min length 12 / max 1024, generic failure message, throttling |
| V3 Session Management | yes | HttpOnly + SameSite=Strict + Secure-over-HTTPS cookie, fixed 12 h expiry checked server-side, HMAC-signed, key bound to the hash. Known accepted gap: no server-side revocation (D-04) |
| V4 Access Control | yes | Bearer wins; cookie only when no `Authorization`; admin routes 404 when disabled; pages redirect |
| V5 Input Validation | yes | `bodyLimit` on `POST /login`, password length bound before scrypt, cookie value regex before use, hash parse bounds |
| V6 Cryptography | yes | `crypto.scrypt`, `createHmac('sha256')`, `randomBytes`, `timingSafeEqual`; no custom primitives; distinct HMAC labels (`admin-session`, `session:`, `csrf:`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Online password guessing | Spoofing | Per-IP growing delay with 429 before scrypt; 12-char minimum. Residual: fake `X-Forwarded-For` bypass when no proxy (D-09, documented) |
| CPU/memory exhaustion via scrypt | Denial of Service | Async scrypt, per-IP in-flight cap, body and password length caps, `maxmem` fixed. Residual: spoofed-XFF floods (accepted by D-08/D-09) |
| CSRF on `/v1` writes | Tampering | `SameSite=Strict` + session-bound HMAC token in `X-CSRF-Token`, constant-time compare |
| Login CSRF | Tampering | Sec-Fetch-Site/Origin check on `POST /login` |
| Cookie theft by XSS | Information disclosure | HttpOnly; `hono/html` escaping; CSP `script-src 'self'`; no inline script |
| Cookie forgery | Spoofing / Elevation | HMAC-SHA256 with key from the hash; constant-time verify; strict value regex |
| Stolen `.env` | Information disclosure | `.env` mode 0600 (script chmods); note: the hash string is also the HMAC key seed, so whoever reads `.env` can forge sessions (they could already use `API_TOKEN` from the same file) |
| Clickjacking | Spoofing | CSP `frame-ancestors 'none'` |
| CDN compromise (Pico) | Tampering | SRI sha384 pin on an exact version |
| Timing side-channel on hash compare | Information disclosure | `timingSafeEqual` on equal-length buffers |
| User enumeration | Information disclosure | Single-user; the same fixed message for every failure; 429 does not check the password |

## Sources

### Primary (HIGH confidence)
- Local source read this session: `src/app.ts`, `src/app.test.ts`, `src/env.ts`, `src/server.ts`, `scripts/certificate.mjs`, `package.json`, `.env.example`, `Dockerfile`, `tsconfig.json`, `node_modules/hono/dist/helper/cookie/index.js`, `node_modules/@hono/node-server/dist/conninfo.mjs`, `node_modules/hono/dist/types/middleware/secure-headers/secure-headers.d.ts`
- Executed experiments this session: scrypt memory/time table, `--env-file` handling of the hash, `getConnInfo` under `app.request`, Hono routing for `/admin/*`, `hono/html` escaping, `.mjs` importing `.ts`, readline on piped stdin, baseline `pnpm test` and `typecheck`
- Registry/CDN: `npm view @picocss/pico version` (2.1.1); jsDelivr package listing; SRI computed locally from the downloaded file

### Secondary (MEDIUM confidence)
- OWASP Password Storage Cheat Sheet (scrypt parameter table): https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP CSRF Prevention Cheat Sheet (Sec-Fetch-Site primary, Origin fallback, `null`, login CSRF, session-bound HMAC tokens): https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- Docker Compose interpolation of `$` in env values: https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/ (search summary; the dedicated `env_file` page was not read)

### Tertiary (LOW confidence)
- Items listed in the Assumptions Log (A1-A4)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; versions read from `node_modules`.
- Architecture: HIGH - follows locked decisions; the risky parts (`getConnInfo`, `maxmem`, routing, `$` handling) were executed.
- Pitfalls: HIGH for the verified ones (1, 2, 5, 10), MEDIUM for Compose interpolation and Safari cookie behaviour.

**Research date:** 2026-11-20
**Valid until:** 2026-12-20 (stable stack; re-verify the Pico SRI hash only if the pinned version changes)

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` or `.claude/CLAUDE.md` exists in the repository root, and there are no project skills under `.claude/skills` or `.agents/skills`. The binding conventions come from `.planning/codebase/CONVENTIONS.md` and the code itself:
- TypeScript runs through Node type stripping: no enums or parameter properties (`erasableSyntaxOnly`), imports use the `.ts` extension, `verbatimModuleSyntax` (inline `type` imports), `noUncheckedIndexedAccess` (handle `T | undefined`).
- Style: 2 spaces, no semicolons, single quotes, trailing commas, `export const name = (...) =>`, SCREAMING_SNAKE_CASE module constants, factories named `create*`, predicates `is*`/`has*`, parsers `parse*`.
- Language: code and comments in English; UI text, script messages and docs in pt-BR (`'Link inválido.'` style for plain pages).
- Tests co-located as `src/<module>.test.ts`, using `createApp` with injected deps and `app.request(...)`.
- `scripts/*.mjs` is plain JS and not type-checked; keep logic in `src/`.
- PROJECT constraints (from CONTEXT canonical refs): no build step, `API_TOKEN` never reaches the browser, prefer Node built-ins, pt-BR UI.
- Docs to update: `.env.example` (pt-BR comment for `ADMIN_PASSWORD`), `README.md` (install step for `pnpm run admin-password`, `/admin`, Docker note from Pitfall 10, the "Segurança" section), and `docs/` as relevant.
