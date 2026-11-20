---
phase: 01-admin-password-and-login
plan: 03
subsystem: auth
tags: [hono, login-throttle, retry-after, csp, sec-fetch-site, body-limit, security-headers]

requires:
  - phase: 01-admin-password-and-login (plan 02)
    provides: "registerAdmin, POST /login with verifyPassword, session cookie helpers, Pico.css page shell"
provides:
  - "src/session.ts: createLoginThrottle (per-address 1,2,4,8,16,30 s delay, in-flight serialization, pruning, 10 000 cap) and clientIp"
  - "POST /login answers 429 + Retry-After before any scrypt work, 403 for cross-site posts, 413 over 4 KB"
  - "PAGE_CSP and no-store / no-referrer / nosniff headers on /login, /logout and /admin"
affects: [01-04 wiring and docs, Phase 2 panel pages]

actuals:
  tokens: 13000
  tasks: 3
  commits: 5
plan_head_before: 0a63e729334c3a13ebe6fe2e7c952d3372e9510a
plan_head_after: c9e73dd0a3133f4070d430b0e04ad696ffb72fe3

tech-stack:
  added: []
  patterns:
    - "Throttle check-and-mark runs synchronously in begin(), end() in finally: parallel posts from one address cannot both pass"
    - "Refusals ordered cheapest first: body limit, cross-site check, throttle, parse, scrypt"
    - "Page headers as a middleware registered before the /admin guard so redirects carry them"

key-files:
  created: []
  modified: [src/session.ts, src/session.test.ts, src/admin.ts, src/admin.test.ts]

key-decisions:
  - "Delay is a 429 + Retry-After refusal, not a sleep, so a blocked attempt costs no scrypt"
  - "Sec-Fetch-Site decides first (same-origin and none pass), Origin is the fallback (null never passes), neither header passes (D-17 refinement)"
  - "Throttle key is the last X-Forwarded-For entry, else the connection address, else 'unknown'; forgeable without a proxy, an accepted risk (D-09)"
  - "Pruning at most once per 60 s once the map holds more than 100 entries; hard cap evicts the oldest in insertion order"

requirements-completed: [AUTH-03, AUTH-02]

coverage:
  - id: D1
    description: "Repeated wrong passwords from one address get 429 + Retry-After and the 'Muitas tentativas' page without the password being checked; other addresses are unaffected; the address is allowed again after the delay"
    requirement: AUTH-03
    verification:
      - kind: integration
        ref: "src/admin.test.ts#answers 429 with Retry-After before checking the password, per address, and lets the address back in after the delay"
        status: pass
    human_judgment: false
  - id: D2
    description: "Delay curve 1,2,4,8,16,30,30 s, reset after a success or 10 quiet minutes, one attempt in flight per address, bounded map, client address from the last X-Forwarded-For entry"
    requirement: AUTH-03
    verification:
      - kind: unit
        ref: "src/session.test.ts#login throttle"
        status: pass
      - kind: unit
        ref: "src/session.test.ts#clientIp"
        status: pass
      - kind: integration
        ref: "src/admin.test.ts#checks only one of three simultaneous wrong-password posts from one address"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cross-site login posts refused with 403 before the throttle (not counted as failures); posts over 4 KB refused with 413"
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: "src/admin.test.ts#cross-site login refusal"
        status: pass
      - kind: integration
        ref: "src/admin.test.ts#login body limit"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every /login, /logout and /admin response carries no-store, PAGE_CSP, no-referrer and nosniff; the pages load nothing third-party except the SRI-pinned Pico.css"
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: "src/admin.test.ts#panel security headers"
        status: pass
    human_judgment: false
  - id: D5
    description: "In a real browser Pico styles /login and /admin under the CSP with SRI, with no console errors and no request beyond localhost and cdn.jsdelivr.net"
    verification: []
    human_judgment: true
    rationale: "SRI and CSP enforcement and the visual result happen only in a real browser (plan human-check, not run by the executor)"

duration: 25min
completed: 2026-11-20
status: complete
---

# Phase 1 Plan 03: Login throttle, cross-site check, body cap and panel headers Summary

**Per-address login delay (1 to 30 s) answered as 429 + Retry-After before any scrypt, Sec-Fetch-Site/Origin cross-site refusal, 4 KB body cap and a Pico-only CSP with no-store headers on every panel page**

## Performance

- **Duration:** about 25 min
- **Completed:** 2026-11-20
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 4

## Accomplishments
- `createLoginThrottle` and `clientIp` in `src/session.ts`: wait `min(2^(n-1), 30)` s after the n-th consecutive failure, success clears the address, a failure after 10 quiet minutes counts as the first, one attempt in flight per address, pruning and a 10 000 address cap.
- `POST /login` order is body limit (413), cross-site check (403), throttle (429 + Retry-After), parse, verify; the wrong-password page stays exactly `Senha incorreta.`.
- `PAGE_CSP` plus Cache-Control no-store, Referrer-Policy no-referrer and X-Content-Type-Options nosniff on `/login`, `/logout` and `/admin/*`, registered before the `/admin` guard so redirects carry them.

## Task Commits

1. **Task 1: 429 + Retry-After before any password check (tracer)** - `55c2843` (feat)
2. **Task 2 RED: failing tests for pruning, cap, curve, client address** - `da8ae88` (test)
3. **Task 2 GREEN: prune and cap the throttle map** - `b931476` (feat)
4. **Task 3 RED: failing tests for cross-site, body limit, headers** - `3abd8ed` (test)
5. **Task 3 GREEN: cross-site refusal, body limit, page headers** - `c9e73dd` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `src/session.ts` - throttle constants, `LoginThrottle`, `createLoginThrottle`, `clientIp`
- `src/admin.ts` - `PAGE_CSP`, `sameOriginLogin`, page-headers middleware, throttled POST /login with `bodyLimit`
- `src/session.test.ts` - throttle curve, reset, in-flight, pruning, cap, 64-character cut and `clientIp` tests
- `src/admin.test.ts` - 429 tracer, parallel posts, cross-site, 413 and header/markup tests

## Decisions Made
See `key-decisions`. Tracer feedback gate: interactive, `end-of-phase`, automated-only verify, re-run passed (tests and typecheck), so expansion continued.

## TDD Gate Compliance
Task 2 and Task 3 each have a `test(01-03)` commit followed by a `feat(01-03)` commit. RED evidence (vitest, assertions on the planned behavior, semantic assessment: the target tests ran and failed on the intended assertion, not on import or syntax faults):
- Task 2: `prunes idle entries ...` failed with `expected 151 to be 1`; `never holds more than 10 000 addresses ...` failed with `expected 10001 to be less than or equal to 10000`. The curve, reset, in-flight, 64-character cut and `clientIp` cases already held from the Task 1 tracer implementation, so they passed at RED by design.
- Task 3: 6 tests failed (e.g. `expected 401 to be 403`, `expected 303 to be 403`, `expected 401 to be 413`, `expected null to be 'no-store'`).
`gsd_run check tdd-red-evidence` was not run: the plan is not `type: tdd` and no evidence record was written.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. The manual Pico/SRI/CSP browser check (Task 3 human-check) was not run by the executor; it is carried as coverage D5 with `human_judgment: true` for end-of-phase verification.

## Known Stubs
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01-04 can wire the cookie into `/v1` and document the throttle without touching these files.
- Residual risk recorded in the plan threat model: a client with no proxy in front can forge X-Forwarded-For per attempt (D-09), and there is no global limit (D-08).

---
*Phase: 01-admin-password-and-login*
*Completed: 2026-11-20*

## Self-Check: PASSED
