---
phase: 01-admin-password-and-login
verified: 2026-11-21T14:05:00Z
status: passed
score: 9/9 must-haves verified
covered_files:
  - .env.example
  - .planning/phases/01-admin-password-and-login/01-01-PLAN.md
  - .planning/phases/01-admin-password-and-login/01-01-SUMMARY.md
  - .planning/phases/01-admin-password-and-login/01-02-PLAN.md
  - .planning/phases/01-admin-password-and-login/01-02-SUMMARY.md
  - .planning/phases/01-admin-password-and-login/01-03-PLAN.md
  - .planning/phases/01-admin-password-and-login/01-03-SUMMARY.md
  - .planning/phases/01-admin-password-and-login/01-04-PLAN.md
  - .planning/phases/01-admin-password-and-login/01-04-SUMMARY.md
  - .planning/phases/01-admin-password-and-login/01-05-PLAN.md
  - .planning/phases/01-admin-password-and-login/01-05-SUMMARY.md
  - .planning/phases/01-admin-password-and-login/01-06-PLAN.md
  - .planning/phases/01-admin-password-and-login/01-06-SUMMARY.md
  - README.md
  - package.json
  - scripts/admin-password.mjs
  - src/admin.test.ts
  - src/admin.ts
  - src/adminPasswordScript.test.ts
  - src/app.ts
  - src/appSession.test.ts
  - src/env.ts
  - src/password.test.ts
  - src/password.ts
  - src/server.ts
  - src/session.test.ts
  - src/session.ts
covered_digest: "v4:sha256:24f251a5153cdbe97c526a52b55c5a679009f9ec2607d43827ed5a314be8f5ff"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
behavior_unverified_items: []
---

# Phase 1: Admin Password and Login Verification Report

**Phase Goal:** The operator can protect the install with an admin password and log in and out of the browser panel, while `/v1` keeps working with the Bearer token exactly as today.
**Verified:** 2026-11-21T14:05:00Z
**Status:** passed
**Re-verification:** Yes. The previous report (passed, after UAT) went stale because Phase 02 changed `README.md`, `src/admin.ts`, `src/admin.test.ts`, `src/app.ts` and `src/appSession.test.ts`. The previous report had no `gaps:` section, so every truth got a fresh check against the current code.

## Goal Achievement

Phase 02 replaced the `/admin` skeleton with the notas panel, extended `PANEL_CSS` and `PAGE_CSP` (`connect-src 'self'`), added `PANEL_SCRIPTS` served under `/admin/`, and added `?download=1` and a `beforeId` cursor to the `/v1` handlers in `src/app.ts`. I read the current `src/app.ts`, `src/admin.ts`, `src/session.ts`, `src/password.ts`, `src/env.ts`, `src/server.ts` and `scripts/admin-password.mjs` in full. The login, logout, session, CSRF, Bearer-priority and 404-when-off paths are unchanged in behavior. Nothing Phase 02 added touches the authentication decision in `requireAuth`.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: `pnpm run admin-password` asks twice without echo; `.env` holds only a salted scrypt hash in `ADMIN_PASSWORD`, other lines kept, `.env` created from `.env.example` when missing; differing, empty or under-12-character entries exit with an error and leave `.env` unchanged | ✓ VERIFIED | `scripts/admin-password.mjs` is unchanged by Phase 02. `askHidden` uses raw mode with no echo. `validatePassword` and the match check run before any write. `setVar` rewrites only `ADMIN_PASSWORD=`, and the file is written with mode 0600. `adminPasswordScript.test.ts` spawns the real script in a temp dir: mismatch, 11 characters, no-.env-created-on-bad-entry, creation from `.env.example`, other lines kept, CRLF, duplicates, no plaintext in `.env`/stdout/stderr, mode 0600 (all pass). No-echo in a real tty is attested in `01-UAT.md` test 1, `result: pass`; Phase 02 did not touch that path |
| 2 | SC2: with `ADMIN_PASSWORD` empty, `/login` and `/admin` answer 404 and `/v1` accepts only the Bearer token, exactly as today | ✓ VERIFIED | Own probe through `createApp` with an empty hash: `/login`, `/admin`, `/panel.css`, `/admin/panel.js` all 404. `/v1/notas` with Bearer 200, with a (forged) session cookie 401, with no credential 401. `app.ts`: `admin` is `undefined` when `ADMIN_PASSWORD` is empty, so `registerAdmin` is never called and `requireAuth` takes the Bearer branch |
| 3 | SC3: with a password set, `/login` -> `/admin`; a wrong password shows only that it failed; repeated failures from one address are slowed | ✓ VERIFIED | Probe: wrong password 401 with the fixed text `Senha incorreta.` and no echo of the entry; a second attempt from the same address 429 with `Retry-After: 1`; right password from another address 303 to `/admin`, then `/admin` 200. `createLoginThrottle` (per-address backoff `min(2^(n-1), 30)` s, one in-flight attempt per address) is intact in `session.ts` and covered by `session.test.ts` and `admin.test.ts` |
| 4 | SC4: successful login sets an HttpOnly, SameSite=Strict cookie (Secure over HTTPS) expiring after 12 h; with it the browser can call `/v1`, POST also needs CSRF, Bearer unchanged | ✓ VERIFIED | Probe `Set-Cookie` over http: `nfse_admin=<v>; Max-Age=43200; Path=/; HttpOnly; SameSite=Strict`; over https the same plus `Secure`. Cookie GET `/v1/notas` 200; cookie POST with no CSRF 403, with a wrong token 403, with the token from the `/admin` meta 200. Bearer POST 200. Bearer wins over a valid cookie (wrong Bearer plus valid cookie gives 401; valid Bearer plus cookie and no CSRF gives 200). After 12 h plus 1 s the cookie gives 303 on `/admin` and 401 on `/v1`. `src/app.ts` `requireAuth` reads the Bearer first, exactly as before |
| 5 | SC5: logout ends the session; `/admin` without a valid session redirects to `/login`; re-running the script replaces the hash and earlier sessions stop working | ✓ VERIFIED | Probe: `/admin` with no cookie 303 to `/login`. `POST /logout` with the CSRF value 303 to `/login` and a `Max-Age=0` cookie; with a bad CSRF 403; `GET /logout` 404 (no GET logout). A cookie issued under hash A is refused under hash B (`/admin` 303, `/v1` 401) because `sessionKey` derives only from the `ADMIN_PASSWORD` hash. Re-running the script replaces the hash (test "replaces the hash on a second run with one that verifies only the new password" passes). Logout clears only the browser's cookie and keeps no revocation list; this is the documented accepted risk D-04 |
| 6 | 01-05: pages load Pico 2.1.1 classless with the pinned SRI hash; no class or style attributes; no script on the login page | ✓ VERIFIED | `PICO_CSS_URL`/`PICO_CSS_INTEGRITY` unchanged in `admin.ts`. `loginPage` and `refusalPage` have no class, style or script. Phase 02 deliberately added `<script type="module" src="/admin/panel.js">` to `/admin` only (superseding the old "no script on panel pages" wording for that page); `script-src 'self'` keeps it same-origin |
| 7 | 01-05: `/admin` has a nav header with `Sair`; Produção and Homologação badges differ; wrong password marks the field invalid; 403/413/CSRF refusals are HTML pages with a link back | ✓ VERIFIED | `adminPage` keeps `<nav>` with the logout form (hidden `csrf` input, `Sair` button) and now the notas table below. `environmentBadge`, `loginPage` (`aria-invalid` when `invalid`) and `refusalPage` are used by the routes. Probe: cross-site login 403; logout with bad CSRF 403 |
| 8 | 01-06: `/panel.css` is served from this origin as `text/css` with panel headers, 404 when off, `PAGE_CSP` allows `'self'` styles | ✓ VERIFIED | Probe: panel on `/panel.css` 200; panel off 404. Panel headers present on `/admin` (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`); `PAGE_CSP` read: `style-src 'self' https://cdn.jsdelivr.net`. The CSP also gained `connect-src 'self'` from Phase 02 and `admin.test.ts` pins the full string |
| 9 | 01-06: login and refusal pages are one `<main data-card><article>` card centered by `main[data-card]` | ✓ VERIFIED | `loginPage` and `refusalPage` read: both `<main data-card><article>`. `PANEL_CSS` keeps `place-items: center` and `max-width: 24rem`; Phase 02 only appended `#notas`/`#nota-dialog` rules after it. `/admin` has no `data-card`. Visual result attested by UAT test 5 |

**Score:** 9/9 truths verified (5 ROADMAP success criteria plus 4 plan-05/06 truths). 0 present, behavior-unverified.

### Deferred Items

None.

### Advisory / Warnings

| # | Finding | Category | Detail |
|---|---------|----------|--------|
| W1 | WR-01 (`01-REVIEW.md`, open): `POST /login` caps the body at 4 KiB (`4 * 1024` in `src/admin.ts`) while `validatePassword` accepts up to 1024 code points | WARNING (advisory) | Still present. A very long non-ASCII password can be saved by the script and then refused at login with 413. No normal password is affected and no ROADMAP criterion breaks |
| W2 | IN-01..IN-04 and the other open review items (8 open in total, 0 critical, per `01-REVIEW-DISPOSITION.md`) | INFO | Edge cases and test-quality notes; none blocks the goal |
| W3 | Tracking drift: `ROADMAP.md` still shows Phase 1 unchecked with "5/5 plans executed" (there are 6 plans, 01-06 done); `REQUIREMENTS.md` still shows `[ ]`/`Pending` for PASS-01..04, AUTH-01, AUTH-04, AUTH-05 | INFO | Bookkeeping only. The code and tests satisfy those requirements (see below). The orchestrator should tick them when it closes the phase |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/password.ts` | scrypt hash/parse/verify, 12-character minimum | ✓ VERIFIED | Substantive, used by the script and `admin.ts`; unchanged by Phase 02 |
| `scripts/admin-password.mjs` + `package.json` `admin-password` | operator script | ✓ VERIFIED | Wired (`pnpm run admin-password` entry present with `--env-file-if-exists=.env`); exercised by a spawning test |
| `.env.example`, `src/env.ts` | empty `ADMIN_PASSWORD` setting | ✓ VERIFIED | `env.ts` reads and trims `ADMIN_PASSWORD`; `.env.example` documents it |
| `src/session.ts` | signed cookie, CSRF, HTTPS detection, throttle, client IP | ✓ VERIFIED | Unchanged; imported by `app.ts` and `admin.ts` |
| `src/admin.ts` | login, logout, guard, pages, refusals, `/panel.css`, panel scripts | ✓ VERIFIED | `registerAdmin` called by `app.ts`; every page builder is used by a route |
| `src/app.ts` | `requireAuth`, conditional `registerAdmin`, startup notice | ✓ VERIFIED | `requireAuth` on `/v1/*` and `/health`; `adminPanelNotice` used by `server.ts` |
| `src/server.ts` | startup notice | ✓ VERIFIED | Logs off / invalid hash / on, never the value |
| `README.md` | operator documentation | ✓ VERIFIED | Documents the panel and the script (Phase 02 extended it) |
| Test files (`password`, `adminPasswordScript`, `session`, `admin`, `appSession`) | pin the behavior | ✓ VERIFIED | Pass in the full run |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/admin-password.mjs` | `src/password.ts` | import `hashPassword`, `validatePassword` | WIRED | |
| `src/app.ts` | `src/admin.ts` | `registerAdmin(app, ...)` only when a hash is set | WIRED | Probe: panel off gives 404 on every panel route |
| `src/app.ts` | `src/session.ts` | `sessionKey`, `readSession`, `csrfToken`, `timingSafeEqual` | WIRED | Probe: cookie GET 200, POST without CSRF 403 |
| `src/admin.ts` | `src/password.ts` | `verifyPassword` in `POST /login` | WIRED | Probe: right password 303, wrong 401 |
| `src/admin.ts` | `src/session.ts` | `throttle.begin`/`end`, `clientIp`, `issueSession`, `readSession` | WIRED | Probe: 429 on the second attempt |
| `src/admin.ts` `layout()` | `/panel.css` route | `<link rel="stylesheet" href="/panel.css">` | WIRED | Route 200 with the panel headers |
| `src/admin.ts` `PAGE_CSP` | `/panel.css` and `/admin/*.js` | `style-src 'self'`, `script-src 'self'`, `connect-src 'self'` | WIRED | Header observed in the probe |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `/admin` page | cnpj, environment, csrf | `env.ISSUER_CNPJ`, `env.NFSE_ENVIRONMENT`, `csrfToken(key, session.id)` | Yes | ✓ FLOWING |
| `/login` form | submitted password | `parseBody()` -> `verifyPassword` against `env.ADMIN_PASSWORD` | Yes | ✓ FLOWING |

The notas list in `/admin` is Phase 02's scope and was verified there.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `pnpm test` | 16 files passed, 291 passed, 1 skipped | ✓ PASS |
| Types | `pnpm run typecheck` | clean | ✓ PASS |
| Panel on and off, login, throttle, cookie flags (http and https), CSRF matrix, Bearer priority, logout, hash change, expiry, cross-site login, `/panel.css`, unauthenticated panel script | Temporary vitest file written by the verifier, run, then deleted (`git status` clean) | All values as recorded in the truths above | ✓ PASS |

The probe's "token leaked" check printed `true` only because the test token `tok` is a substring of `csrf-token`; `grep API_TOKEN src/admin.ts src/panel/*.js` finds nothing, so the token never reaches the page (also verified under Phase 02).

### Probe Execution

Step 7c: SKIPPED. No `probe-*.sh` scripts exist or are declared by any plan.

### Requirements Coverage

All 10 phase IDs appear in PLAN frontmatter (01-01: PASS-01..04; 01-02: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-06, PASS-04; 01-03: AUTH-03, AUTH-02; 01-04: AUTH-05, AUTH-01, PASS-04; 01-05: AUTH-02, AUTH-03, AUTH-06; 01-06: AUTH-02). `REQUIREMENTS.md` maps no other ID to Phase 1, so there are no orphans.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PASS-01 | 01-01 | Script asks twice, no echo | ✓ SATISFIED | `askHidden` raw mode; UAT test 1 pass |
| PASS-02 | 01-01 | Mismatch, empty or under 12 characters: error, `.env` unchanged | ✓ SATISFIED | Checks precede any write; spawning tests pass |
| PASS-03 | 01-01 | Only the salted scrypt hash stored; `.env` from `.env.example`; other lines kept | ✓ SATISFIED | `hashPassword`, `setVar`; tests pass |
| PASS-04 | 01-01, 01-02, 01-04 | Re-run replaces the hash; sessions stop working | ✓ SATISFIED | Key derived from the hash; probe: cookie refused under another hash |
| AUTH-01 | 01-02, 01-04 | Empty password: 404 on `/login`/`/admin`, `/v1` Bearer only | ✓ SATISFIED | Probe |
| AUTH-02 | 01-02, 01-03, 01-05, 01-06 | `/login` with the right password lands on `/admin` | ✓ SATISFIED | Probe 303 then 200 |
| AUTH-03 | 01-02, 01-03, 01-05 | Wrong password: bare error; per-address slowdown | ✓ SATISFIED | Probe 401 then 429 |
| AUTH-04 | 01-02 | HttpOnly, SameSite=Strict, Secure over HTTPS, 12 h | ✓ SATISFIED | Probe cookie attributes, expiry check |
| AUTH-05 | 01-04 | Cookie calls `/v1`; POST needs CSRF; Bearer unchanged | ✓ SATISFIED | Probe CSRF matrix and Bearer priority |
| AUTH-06 | 01-02, 01-05 | Logout ends the session; `/admin` without a session redirects | ✓ SATISFIED | Probe |

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX` debt markers and no stubs in the Phase 01 source files (`src/password.ts`, `src/session.ts`, `src/admin.ts`, `src/app.ts`, `src/env.ts`, `src/server.ts`, `scripts/admin-password.mjs`). The empty-hash and empty-value patterns found are initial or typed defaults, not rendering stubs.

### Human Verification Required

None new. The two human checks that cannot be automated (no-echo in a real tty; `Secure` cookie over real HTTPS plus the visual login card) are recorded as passed in `01-UAT.md` (status complete, gaps G-01-3 and G-01-4 resolved by plans 01-05 and 01-06). Phase 02 changed neither the script, the cookie code nor the login or refusal pages, so those observations still hold.

### Gaps Summary

No gaps. Phase 02's rewrite of `/admin` and extension of `/panel.css`, the CSP and the `/v1` handlers did not regress any Phase 01 truth. Open items are advisory only (W1 to W3).

---

_Verified: 2026-11-21T14:05:00Z_
_Verifier: Claude (gsd-verifier)_
