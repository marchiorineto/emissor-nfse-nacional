---
phase: 01-admin-password-and-login
plan: 04
subsystem: auth
tags: [hono, session-cookie, csrf, bearer, startup-notice, readme]

requires:
  - phase: 01-admin-password-and-login
    provides: "src/session.ts (readSession, csrfToken, SESSION_COOKIE), src/password.ts (parseHash), registerAdmin and the /admin page with the csrf-token meta (plans 01-01, 01-02)"
provides:
  - "requireAuth on /v1/* and /health: Bearer first (unchanged), else admin session cookie with X-CSRF-Token on every method but GET/HEAD"
  - "adminPanelNotice(env) and the startup log of the panel state"
  - "pt-BR README section Painel administrativo, plus ADMIN_PASSWORD, API, Seguranca and troubleshooting entries"
affects: [phase-02-notas-ui, phase-03-notas-ui]

plan_head_before: 0a63e729334c3a13ebe6fe2e7c952d3372e9510a
plan_head_after: 6a3ee018d60d36908bb8f29d6a9ededa2e3cb86d
actuals:
  tokens: 4300
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Single requireAuth middleware names the two-credential concept instead of stacking a second middleware"
    - "Route-table invariant test (app.routes) so a future /v1 write route cannot skip cookie CSRF"

key-files:
  created:
    - src/appSession.test.ts
  modified:
    - src/app.ts
    - src/server.ts
    - README.md

key-decisions:
  - "When Authorization is present (even empty) only the Bearer branch runs; a valid cookie never rescues a wrong Bearer (D-19)"
  - "CSRF failure is 403 { error: 'invalid csrf token' }, distinct from the 401 for any bad or missing session (D-05)"
  - "CSRF applies to every method except GET and HEAD, so PUT/PATCH/DELETE added later need no change"

patterns-established:
  - "One 401 body for missing, empty, expired, tampered and other-hash cookies"

requirements-completed: [AUTH-05, AUTH-01, PASS-04]

coverage:
  - id: D1
    description: "A logged-in browser reads /v1/notas, /v1/notas/:id and /health with only the session cookie"
    requirement: AUTH-05
    verification:
      - kind: unit
        ref: "src/appSession.test.ts#lets the cookie alone read /v1/notas, and still refuses a call with no credential"
        status: pass
      - kind: unit
        ref: "src/appSession.test.ts#reads one nota and /health with the cookie alone"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cookie writes on /v1 need X-CSRF-Token (403 invalid csrf token otherwise), for every current non-GET/HEAD route"
    requirement: AUTH-05
    verification:
      - kind: unit
        ref: "src/appSession.test.ts#refuses a cookie write without the CSRF token, or with a wrong one, and accepts the page token"
        status: pass
      - kind: unit
        ref: "src/appSession.test.ts#needs the CSRF token to cancel a nota with the cookie"
        status: pass
      - kind: unit
        ref: "src/appSession.test.ts#refuses a cookie request without the token on every non-GET/HEAD /v1 route"
        status: pass
    human_judgment: false
  - id: D3
    description: "Bearer callers behave exactly as before, whatever cookie arrives; src/app.test.ts is untouched"
    requirement: AUTH-05
    verification:
      - kind: unit
        ref: "src/appSession.test.ts#accepts a valid Bearer without CSRF, even next to a garbage cookie"
        status: pass
      - kind: unit
        ref: "src/appSession.test.ts#answers 401 to a wrong or empty Authorization next to a valid cookie"
        status: pass
      - kind: other
        ref: "git diff --exit-code 493c092 -- src/app.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Bad, expired, tampered or other-hash cookies get the same 401; with the panel off cookies are ignored"
    requirement: PASS-04
    verification:
      - kind: unit
        ref: "src/appSession.test.ts#answers the same 401 for a tampered, empty and expired cookie"
        status: pass
      - kind: unit
        ref: "src/appSession.test.ts#answers the same 401 for a cookie signed under another password hash (PASS-04)"
        status: pass
      - kind: unit
        ref: "src/appSession.test.ts#ignores any cookie on /v1 and /health, and keeps accepting the Bearer token"
        status: pass
    human_judgment: false
  - id: D5
    description: "Startup log says panel on, off or misconfigured (warning), never printing the hash"
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "src/appSession.test.ts#says off, misconfigured (as a warning) or on, and never prints the hash"
        status: pass
      - kind: other
        ref: "server smoke run with empty env prints 'admin panel off'"
        status: pass
    human_judgment: false
  - id: D6
    description: "README documents the panel in pt-BR (script, restart, Docker, login/logout, 12 h session, delay, proxy headers, security notes)"
    verification: []
    human_judgment: true
    rationale: "Prose quality and tone of the pt-BR documentation cannot be asserted by a test; grep checks only prove the required terms are present"

duration: 3min
completed: 2026-11-20
status: complete
---

# Phase 1 Plan 04: /v1 and /health through the session cookie Summary

**Single `requireAuth` middleware: Bearer token first (unchanged), else the admin session cookie with an HMAC `X-CSRF-Token` on every non-GET/HEAD call; startup panel notice and a pt-BR README section.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-20T20:11:27Z
- **Completed:** 2026-11-20T20:13:45Z
- **Tasks:** 3
- **Files modified:** 4 (src/app.ts, src/server.ts, README.md, plus new src/appSession.test.ts)

## Accomplishments

- The admin browser reads `/v1/notas`, `/v1/notas/:id` and `/health` with only the cookie; the API token never reaches the browser.
- Cookie writes need `X-CSRF-Token` equal to the `/admin` page's `csrf-token` meta, otherwise 403 `invalid csrf token`; an `app.routes` invariant test turns red if a later phase adds a `/v1` write route that skips this.
- With `Authorization` present only the Bearer is checked (wrong or empty Bearer next to a valid cookie gets 401; valid Bearer next to a garbage cookie works without CSRF). `src/app.test.ts` is byte-identical to 493c092 and passes.
- With `ADMIN_PASSWORD` empty, `admin` is undefined and cookies are invisible to `/v1` and `/health`.
- Server logs `admin panel on /admin`, `admin panel off (...)` or a warning for an invalid hash at startup, never the value.
- README: `ADMIN_PASSWORD` row, `## Painel administrativo` (create or change the password, log in and out, behind a proxy), API and Segurança notes, two troubleshooting rows.

## Task Commits

1. **Task 1: A logged-in browser reads /v1/notas with only the session cookie (tracer)** - `a88c8c8` (feat)
2. **Task 2: CSRF, Bearer priority, panel off, startup notice (TDD)**
   - RED - `13fab34` (test)
   - GREEN - `a9e7d65` (feat)
3. **Task 3: Startup notice in server.ts and pt-BR README** - `6a3ee01` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified

- `src/app.ts` - `requireAuth` (Bearer first, else cookie + CSRF on writes) and exported `adminPanelNotice`
- `src/appSession.test.ts` - helpers `setup`, `loginCookie`, `csrfOf`; cookie, CSRF, Bearer-priority, bad-cookie, panel-off, route-invariant and notice tests (11 tests)
- `src/server.ts` - logs the panel notice once at startup
- `README.md` - pt-BR operator documentation of the panel

## Decisions Made

- Followed the plan: CSRF on every method but GET/HEAD; 403 for CSRF failure vs 401 for any credential problem; an empty `Authorization` stays on the Bearer path.

## Deviations from Plan

None - plan executed exactly as written.

### TDD notes (Task 2)

- RED: the target test `adminPanelNotice > says off, misconfigured ... never prints the hash` failed with `TypeError: adminPanelNotice is not a function` (feature absent, the planned reason); 10 other tests in the file passed already because `requireAuth` shipped in the Task 1 tracer, so they are characterization tests of the tracer's behavior, as the plan's task split implies. The RED evidence was inspected semantically; `gsd_run check tdd-red-evidence` was not run because `workflow.tdd_mode` is not enabled and the plan is `type: execute`.
- GREEN: `adminPanelNotice` added; all 15 tests of the two files pass. No REFACTOR commit.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-01-25 to T-01-31 mitigated as specified).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phases 2 and 3 can build the notas UI on `/v1` calls with the cookie and `X-CSRF-Token` read from the page's `csrf-token` meta.
- Plan 01-03 (parallel, owns `src/admin.ts`, `src/session.ts`, their tests) was not touched; the login helper in `appSession.test.ts` sends `sec-fetch-site: same-origin` and its own `x-forwarded-for` so it stays valid with 01-03's checks.
- Verification run in this worktree: `pnpm test` 171 passed / 1 skipped, `pnpm run typecheck` clean, server smoke run logs `admin panel off`.

## Self-Check: PASSED

- FOUND: src/appSession.test.ts, src/app.ts, src/server.ts, README.md
- FOUND commits: a88c8c8, 13fab34, a9e7d65, 6a3ee01 (4 commits measured from plan_head_before)
- `git diff --exit-code 493c092 -- src/app.test.ts` clean

---
*Phase: 01-admin-password-and-login*
*Completed: 2026-11-20*
