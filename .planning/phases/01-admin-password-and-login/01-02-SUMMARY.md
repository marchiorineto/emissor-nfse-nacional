---
phase: 01-admin-password-and-login
plan: 02
subsystem: auth
tags: [hono, hmac-sha256, stateless-session, csrf, pico-css, hono-html]

requires:
  - phase: 01-admin-password-and-login (plan 01)
    provides: "verifyPassword and the scrypt hash format stored in ADMIN_PASSWORD"
provides:
  - "GET/POST /login, POST /logout and the /admin guard, registered only when ADMIN_PASSWORD is set"
  - "src/session.ts: signed stateless session cookie nfse_admin, session-bound CSRF token, HTTPS detection, shared timingSafeEqual"
  - "pt-BR /admin skeleton: issuer CNPJ, environment badge, Sair form with CSRF field, empty main#notas"
  - "AppDeps.now injectable clock; Env.ADMIN_PASSWORD (trimmed)"
affects: [01-03 throttle and cross-site check, 01-04 /v1 through the cookie, Phase 2 notas list]

actuals:
  tokens: 14000
  tasks: 3
  commits: 4
plan_head_before: f852f05e861dab718be6800533cace71cc201684
plan_head_after: 3103c27f5ac4cc27dcb851bfe625284600299b61

tech-stack:
  added: []
  patterns:
    - "Stateless HMAC session: value <id>.<expSeconds>.<sig>, key = HMAC(ADMIN_PASSWORD hash, 'admin-session')"
    - "Routes registered conditionally in createApp so a disabled panel is the plain Hono 404"
    - "Server-rendered pages with hono/html (escaping), classless markup, no scripts"

key-files:
  created: [src/session.ts, src/session.test.ts, src/admin.ts, src/admin.test.ts]
  modified: [src/env.ts, src/app.ts]

key-decisions:
  - "Failed login answers 401 (D-14 left 401 or 200 open)"
  - "Cookie named nfse_admin without a __Host- prefix, so plain-HTTP local installs still work"
  - "A malformed non-empty ADMIN_PASSWORD keeps routes registered and every login fails closed; startup warning is plan 01-04"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-06, PASS-04]

coverage:
  - id: D1
    description: "Right password answers 303 to /admin with an nfse_admin cookie; /admin renders the pt-BR skeleton (CNPJ, environment badge, Sair, CSRF meta, Pico with SRI)"
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: "src/admin.test.ts#opens a session with the right password and renders the panel skeleton"
        status: pass
    human_judgment: false
  - id: D2
    description: "Wrong password answers 401 with only 'Senha incorreta.', an empty field and no cookie"
    requirement: AUTH-03
    verification:
      - kind: integration
        ref: "src/admin.test.ts#answers 401 \"Senha incorreta.\" for a wrong password, without echoing it or setting a cookie"
        status: pass
    human_judgment: false
  - id: D3
    description: "Panel disabled (empty or whitespace ADMIN_PASSWORD): /login, /admin, /logout answer the same 404 as an unknown path"
    requirement: AUTH-01
    verification:
      - kind: integration
        ref: "src/admin.test.ts#answers the plain 404 of an unknown path on every admin route when the panel is off"
        status: pass
      - kind: integration
        ref: "src/admin.test.ts#treats a whitespace-only ADMIN_PASSWORD as empty"
        status: pass
    human_judgment: false
  - id: D4
    description: "Cookie flags HttpOnly, SameSite=Strict, Path=/, Max-Age=43200, Secure exactly when HTTPS is detected; 12 h expiry enforced on the server at the exact millisecond"
    requirement: AUTH-04
    verification:
      - kind: integration
        ref: "src/admin.test.ts#sets HttpOnly, SameSite=Strict, Path=/ and Max-Age=43200, and Secure only over HTTPS"
        status: pass
      - kind: unit
        ref: "src/session.test.ts#expires on the server at exactly 12 hours"
        status: pass
    human_judgment: false
  - id: D5
    description: "Logout clears the cookie behind the session-bound CSRF token; /admin without a valid session redirects to /login"
    requirement: AUTH-06
    verification:
      - kind: integration
        ref: "src/admin.test.ts#logs out with the page CSRF token: clears the cookie and redirects to /login"
        status: pass
      - kind: integration
        ref: "src/admin.test.ts#redirects /admin to /login without a valid session"
        status: pass
    human_judgment: false
  - id: D6
    description: "A cookie issued under one ADMIN_PASSWORD hash is refused by an app built with another (server half of PASS-04)"
    requirement: PASS-04
    verification:
      - kind: integration
        ref: "src/admin.test.ts#refuses a cookie issued under another password hash (PASS-04)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Secure/HttpOnly/SameSite flags and 12 h expiry as shown by a real browser behind a TLS front end"
    requirement: AUTH-04
    verification: []
    human_judgment: true
    rationale: "A real TLS front end and the browser's cookie store cannot be exercised from app.request (plan Task 3 human-check)"

duration: 4min
completed: 2026-11-20
status: complete
---

# Phase 1 Plan 02: Login, stateless cookie session, /admin skeleton, logout Summary

**HMAC-signed stateless `nfse_admin` cookie session (12 h fixed, key derived from the ADMIN_PASSWORD hash) behind a pt-BR form login, a guarded /admin skeleton and a CSRF-protected POST /logout, all absent (plain 404) when ADMIN_PASSWORD is empty**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-20T20:05:48Z
- **Completed:** 2026-11-20T20:08:47Z
- **Tasks:** 3
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- Login flow works without JavaScript: `GET /login` form, `POST /login` answers 303 to `/admin` with the session cookie, or 401 "Senha incorreta." with an empty field and no cookie.
- `/admin` is guarded server-side (303 to `/login` for missing, empty, malformed, tampered, expired or foreign-key cookies) and renders the skeleton; `GET /login` with a valid session redirects to `/admin`, both through the same `readSession`.
- `POST /logout` clears the cookie (`Max-Age=0`) after a constant-time check of the session-bound CSRF field; wrong token is 403, no GET handler exists.
- `timingSafeEqual` moved from `src/app.ts` to `src/session.ts` unchanged in behavior; `src/app.test.ts` still passes untouched. Full suite: 160 passed, 1 skipped; `tsc --noEmit` clean.

## Task Commits

1. **Task 1: End-to-end login (tracer)** - `cfcf463` (feat)
2. **Task 2: Logout, disabled panel, guard** - RED `3c7301d` (test), GREEN `e0e1c2a` (feat)
3. **Task 3: Cookie flags, 12 h expiry, key change, edge cases** - `3103c27` (test)

**Plan metadata:** committed after this file (docs: complete plan)

## Tracer feedback gate

Tracer `<verify>` is automated-only and `human_verify_mode` is the default `end-of-phase`: re-ran `pnpm exec vitest run src/admin.test.ts src/app.test.ts` and `pnpm run typecheck` end to end after the Task 1 commit. Both passed, so expansion continued (no checkpoint).

## TDD notes

- **Task 2 RED (`3c7301d`):** 3 of the 10 tests in `src/admin.test.ts` failed on the planned assertions (`expected 404 to be 303` / `403`) because `POST /logout` did not exist; the 404-parity, redirect and GET-logout cases already held from the tracer. Semantic assessment: the target tests ran and failed on the planned behavior, not on syntax or fixture errors. The `gsd_run check tdd-red-evidence` classifier was not run (`workflow.tdd_mode` is not enabled for this project).
- **Task 3 produced a single `test` commit, no `feat`.** Every behavior case passed on first run because the tracer already implemented the session, flag and cookie logic. Treated as characterization tests rather than RED/GREEN (see Deviations). Non-vacuity was proven by mutation: changing `exp * 1000 > nowMs` to `>=` in `readSession` made 2 tests fail (the unit boundary test and the HTTP 43 200 000 ms test), then the mutation was reverted with `git checkout -- src/session.ts`.

## Files Created/Modified

- `src/session.ts` - cookie issue/read, CSRF token, HTTPS detection, constant-time compare, `SESSION_COOKIE`, `SESSION_SECONDS`
- `src/admin.ts` - `registerAdmin` (login, logout, guard, /admin), pages via `hono/html`, `formatCnpj`, `environmentLabel`, Pico CSS URL and SRI constants
- `src/env.ts` - `ADMIN_PASSWORD` (trimmed so whitespace-only is empty)
- `src/app.ts` - `now` dependency, session key derived once at startup, conditional `registerAdmin`, local timingSafeEqual removed
- `src/session.test.ts`, `src/admin.test.ts` - unit tests and `app.request` tests (24 tests across both)

## Decisions Made

- 401 for a failed login (D-14 left 401 or 200 open).
- Cookie name `nfse_admin`, no `__Host-` prefix, so it works on plain-HTTP local installs.
- A malformed non-empty `ADMIN_PASSWORD` keeps the routes registered and every login fails closed (`verifyPassword` is false); the startup warning belongs to plan 01-04.
- Pages carry no `class` attributes and no script tags, per D-12/D-13; Pico styles semantic elements.

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written for the code.

### Process deviation

**1. [TDD gate] Task 3 has no RED/GREEN split**
- **Found during:** Task 3
- **Issue:** The plan marks Task 3 `tdd="true"`, but its behavior (flags, expiry boundary, key change, cookie edge cases, no leaks) was already implemented by the Task 1 tracer, so the new tests were green on first run (unexpected GREEN in RED phase).
- **Resolution:** Investigated per the fail-fast rule: the feature genuinely exists and the tests are not wrong; proved by mutation (see TDD notes). Committed as one `test(01-02)` commit; no source change was needed.
- **Files modified:** src/session.test.ts, src/admin.test.ts
- **Commit:** `3103c27`

---

**Total deviations:** 0 auto-fixed code deviations, 1 TDD process deviation.
**Impact on plan:** None on behavior; commit history for Task 3 is test-only.

## Issues Encountered

None. Only environment note: a fresh worktree needed `pnpm install --frozen-lockfile --offline` (worked).

## Known Stubs

None. `main#notas` is intentionally empty (D-13) for Phase 2 to fill; it is not wired to data by design.

## Threat Flags

None beyond the plan's threat register. New surface is exactly the planned `/login`, `/logout`, `/admin` routes, with T-01-07..T-01-16 mitigations implemented and tested (signature + strict regex + constant-time compare, server-side expiry, HttpOnly, session-bound CSRF, token never in pages/cookies, fixed error message, routes not registered when disabled, Secure on HTTPS).

## Open item (human verification)

Task 3's `<human-check>` (browser devtools cookie panel behind a real HTTPS proxy or `PUBLIC_URL=https://...`: HttpOnly, Secure, SameSite Strict, Path /, 12 h expiry) was not run; it needs a real TLS front end and browser. Under `human_verify_mode: end-of-phase` it is harvested by the phase verifier. It was not appended to `.planning/WINDOWS.md` to avoid an untracked or conflicting file in the worktree merge; the orchestrator may record it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 01-03 (throttle, Origin/Sec-Fetch-Site check, security headers) and 01-04 (`/v1` and `/health` through the cookie, startup warning) can import `SESSION_COOKIE`, `timingSafeEqual`, `sessionKey`, `readSession`, `csrfToken`, `isHttps` and `registerAdmin` with the signatures from the plan's contract.
- `login()` test helper already sends `x-forwarded-for` and `sec-fetch-site: same-origin` so tests stay valid once 01-03 lands.

---
*Phase: 01-admin-password-and-login*
*Completed: 2026-11-20*

## Self-Check: PASSED

- FOUND: src/session.ts, src/admin.ts, src/session.test.ts, src/admin.test.ts
- FOUND commits: cfcf463, 3c7301d, e0e1c2a, 3103c27
