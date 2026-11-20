# Phase 1: Admin Password and Login - Context

**Gathered:** 2026-11-20
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers two things:

- A `pnpm run admin-password` script that writes a salted scrypt hash to `ADMIN_PASSWORD` in `.env`.
- A password login at `/login` that opens a cookie session to a skeleton `/admin` page. With that session the browser
  can call `/v1` (and `/health`) without ever holding `API_TOKEN`.

When `ADMIN_PASSWORD` is empty, `/login` and `/admin` answer 404 and nothing changes. External systems keep using the
Bearer token unchanged.

Requirements: PASS-01..04, AUTH-01..06. The notas list, detail and actions belong to Phases 2 and 3.

</domain>

<decisions>
## Implementation Decisions

### Session and revocation
- **D-01:** The session is a **stateless signed cookie**. There is no session table and no new migration. The cookie
  holds a random session id and an expiry, signed with HMAC-SHA256. The key is derived from the `ADMIN_PASSWORD` hash
  (for example `HMAC(hash, 'admin-session')`), so it never reuses `API_TOKEN`. Changing the hash invalidates every
  cookie automatically. — **Reversibility:** reversible — moving to a session table later only changes the cookie
  format, and existing sessions just log in again.
- **D-02:** A new password takes effect **only after the server restarts**, the same as `pnpm run certificate`. The
  server reads `.env` only at startup. The script must end by printing "Reinicie o servidor…". PASS-04 ("existing
  sessions stop working") holds because, after the restart, the HMAC key comes from the new hash.
- **D-03:** Expiry is **12 hours fixed from login**, with no sliding renewal. The expiry is checked on the server from
  the signed timestamp, and the cookie's Max-Age is also 12 h.
- **D-04:** **Logout only clears the cookie** (Max-Age=0). There is no revocation list, in memory or in the database.
  The user accepts that a copied cookie stays valid until its 12 h run out. Document this in the code.
- **D-05:** When the session has expired or is invalid:
  - `/v1` and `/health` answer **401 JSON**, the same as today without a token. The panel JS sends the browser to
    `/login`.
  - `/admin*` pages **redirect to `/login` on the server**.
- **D-06:** Cookie flags follow AUTH-04: HttpOnly, SameSite=Strict, Path=/, and Secure when the request comes over
  HTTPS. HTTPS means the request URL is `https:`, or `PUBLIC_URL` starts with `https://`, or the `X-Forwarded-Proto`
  header is `https`. The planner decides the exact detection.

### Login rate limiting
- **D-07:** **Growing delay per IP**, with no hard lockout. Each consecutive failure increases the wait, for example
  1 s, 2 s, 4 s and so on up to about 30 s. The counter lives in memory per IP, and is reset by a successful login or
  after a few minutes without failures. The map is pruned so it cannot grow without bound. The admin is never locked
  out for good.
- **D-08:** **No global limit.** The limit is per IP only.
- **D-09:** The client IP is **always read from `X-Forwarded-For`, using its LAST entry**, which is the one the nearest
  proxy appends. When the header is missing, the connection's IP is used (`@hono/node-server` `getConnInfo`). There is
  no new env var such as TRUST_PROXY. Accepted risk: when nothing sits in front of the server, an attacker can send a
  different fake XFF on each attempt to dodge the delay. The 12-character minimum plus scrypt still makes brute force
  impractical. Record this risk in a code comment.
- **D-10:** A wrong password shows only "Senha incorreta." (AUTH-03) and never says more.

### /login and /admin pages
- **D-11:** Pages are rendered on the server with Hono's **`html` tagged template (`hono/html`)**, which escapes
  values. There is no frontend build step and no static `public/` folder for HTML. Small JS for the panel can be
  inline or served by a Hono route. The planner chooses.
- **D-12:** The styling is **Pico.css from jsDelivr**, pinned to an exact version and loaded with an SRI `integrity`
  attribute and `crossorigin`. If the CDN fails, the pages show unstyled but still usable HTML, which is accepted.
  Nothing is vendored. Page markup stays classless or semantic, so it remains readable without CSS.
- **D-13:** In Phase 1, `/admin` is a **panel skeleton**:
  - a header with the issuer's name or CNPJ and the environment badge (homologação/restrita vs produção);
  - a "Sair" button;
  - an empty main area where Phase 2 puts the notas list.

  All text is in Brazilian Portuguese.
- **D-14:** Login is a **classic form POST** that works without JS. A form on `GET /login` posts to `POST /login`.
  - On success: a 303 redirect to `/admin`.
  - On failure: `/login` is shown again with "Senha incorreta." and the field cleared. Return status 401 or 200, as the
    planner chooses.
  - When a valid session already exists, `GET /login` may redirect to `/admin`.
- **D-15:** Logout is **`POST /logout`** from a form with the CSRF token. It clears the cookie and does a 303 redirect
  to `/login`. A GET does not log out.

### CSRF and session scope
- **D-16:** The CSRF token is **derived from the session** and needs no stored state: `csrf = HMAC(key, sessionId)`.
  - The server puts it in a `<meta name="csrf-token">` on `/admin` pages and in a hidden field of server-rendered
    forms, such as logout.
  - Panel JS sends it as the `X-CSRF-Token` header on POST calls to `/v1`.
  - The server compares it in constant time.
- **D-17:** `POST /login` (made before any session exists) is protected by **checking `Origin`, or `Sec-Fetch-Site`
  when Origin is missing**. A cross-site value is refused. There is no pre-session token.
- **D-18:** A session can reach **`/v1/*` and `/health`**, the same reach as the Bearer token. CSRF is required on
  POSTs, which are the only write method today. If a `PUT`, `PATCH` or `DELETE` is ever added, it also needs CSRF.
- **D-19:** **The Bearer token takes priority.** If an `Authorization` header is present, only it is checked, exactly
  as today, and CSRF is not required. The cookie session is considered only when there is no `Authorization` header,
  and only when `ADMIN_PASSWORD` is set (AUTH-01). External systems see identical behavior: the existing `app.test.ts`
  Bearer tests must keep passing unchanged.

### Password script (from REQUIREMENTS, not re-discussed)
- **D-20:** `scripts/admin-password.mjs` follows `scripts/certificate.mjs`:
  - it is run through a `package.json` script with the same node flags;
  - it uses `askHidden` for the two entries (no echo);
  - it uses `setVar` to replace or append `ADMIN_PASSWORD`, keeping every other line;
  - it creates `.env` from `.env.example` when missing and writes it with mode 0600;
  - messages are in pt-BR.

  It rejects entries that differ, are empty, or have fewer than 12 characters, and leaves `.env` untouched in that
  case. Add `ADMIN_PASSWORD=` with a pt-BR comment to `.env.example`, and add `ADMIN_PASSWORD` to `src/env.ts`.

### Claude's Discretion
- The hash string format stored in `ADMIN_PASSWORD`. It must carry its own salt and scrypt parameters (for example
  `scrypt$N$r$p$saltB64$hashB64`). It must also be safe in `.env` without quoting: no spaces, quotes or `#`.
- The scrypt parameters (N, r, p, key length), within Node's default memory limit or with `maxmem` set explicitly.
- The exact backoff curve, the reset window and the pruning strategy for the rate limiter.
- How the delay is applied: wait before answering, or answer 429 with Retry-After.
- The cookie name and encoding, and the exact HTTPS detection.
- How to split the new code across modules, for example `src/admin.ts` for the routes and pages and `src/session.ts`
  for the cookie, CSRF and hashing, as long as they stay testable through `createApp` deps.
- What the script does without a TTY: fail with a clear message, or read from an env var as `certificate.mjs` does
  with `CERT_PASSWORD`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/REQUIREMENTS.md` — PASS-01..04 and AUTH-01..06: the exact acceptance wording.
- `.planning/ROADMAP.md` § Phase 1 — the 5 success criteria.
- `.planning/PROJECT.md` § Constraints and Key Decisions:
  - no build step;
  - `API_TOKEN` never reaches the browser;
  - Node built-ins preferred;
  - pt-BR UI.

### Code to follow and extend
- `scripts/certificate.mjs` — the pattern for the password script: `askHidden`, `setVar`, creating `.env` from
  `.env.example`, and chmod 0600.
- `src/app.ts` — `requireToken` middleware, `timingSafeEqual` helper, route registration for `/v1/*` and `/health`.
- `src/env.ts` — the `Env` interface and `envFrom`; `ADMIN_PASSWORD` goes here.
- `src/app.test.ts` — the test style: `createApp` with injected env, repo and gov, and `app.request(...)`.
- `.env.example` — every variable is documented here with a pt-BR comment.
- `package.json` — script definitions and node flags.

No external specs. The requirements are fully captured in the decisions above and in REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `askHidden` and `setVar` in `scripts/certificate.mjs`: either copy them into the new script or extract them into a
  shared `scripts/` helper module.
- `timingSafeEqual(a, b)` in `src/app.ts`: a constant-time string compare, to reuse for the CSRF token and the HMAC
  signature check.
- `node:crypto` (`scrypt`, `randomBytes`, `createHmac`) is already used in the codebase. No new dependency is needed.
- `hono/html` and `hono/cookie` (getCookie, setCookie, deleteCookie) ship with the installed `hono` package.
  `@hono/node-server/conninfo` provides `getConnInfo` for the fallback IP.

### Established Patterns
- `createApp(deps)` builds every route from injected dependencies, which makes it testable with `app.request` and no
  server.
- Settings come only from `.env`, read at startup through `envFrom(process.env)`. There is no reload.
- Errors from `/v1` are JSON `{ error }` objects. Public pages answer pt-BR plain text, for example `'Link inválido.'`.
- TypeScript runs directly through Node type stripping. Code and comments are in English, and the UI and docs in pt-BR.

### Integration Points
- `app.use('/v1/*', requireToken)` and `app.use('/health', requireToken)` become a combined middleware: Bearer, or
  else a session cookie plus CSRF on POST when `ADMIN_PASSWORD` is set.
- The new routes are `GET /login`, `POST /login`, `POST /logout` and `GET /admin`, all answering 404 when
  `ADMIN_PASSWORD` is empty.
- `src/server.ts` may log at startup whether the admin panel is enabled.
- `README.md` and `docs/` should document `pnpm run admin-password` and `/admin` in pt-BR.

</code_context>

<specifics>
## Specific Ideas

- The script's UX should mirror `pnpm run certificate`: pt-BR prompts, "Erro: …" on failure, and a final "Reinicie o
  servidor…" reminder.
- Pico.css should give forms and tables a decent look with no custom classes, and its automatic light/dark theme is
  welcome.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within the phase scope. (PANEL-07, health and certificate status on the panel, is already
tracked for v2. D-18 makes `/health` reachable by the session so it is ready for that.)

</deferred>

---

*Phase: 01-admin-password-and-login*
*Context gathered: 2026-11-20*
