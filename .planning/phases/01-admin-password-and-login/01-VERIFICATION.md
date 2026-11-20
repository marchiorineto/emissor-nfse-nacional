---
phase: 01-admin-password-and-login
verified: 2026-11-20T21:50:00Z
status: passed
score: 5/5 must-haves verified
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
covered_digest: "v4:sha256:03d58e1323ad6809f9fbdf44ada253428216bee870cd03e818207c0f9a00168d"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed:
    - "G-01-4 (UAT test 4, cosmetic): login field and button page-wide. Closed by plan 01-06 (commit 62c8cce); UAT test 5 result pass"
    - "G-01-3 (UAT test 3, cosmetic): closed by plan 01-05, confirmed through UAT tests 4 and 5"
  gaps_remaining: []
  regressions: []
behavior_unverified_items: []
---

# Phase 1: Admin Password and Login Verification Report

**Phase Goal:** The operator can protect the install with an admin password and log in and out of the browser panel, while `/v1` keeps working with the Bearer token exactly as today.
**Verified:** 2026-11-20T21:50:00Z
**Status:** passed
**Re-verification:** Yes, after gap-closure plan 01-06 (UAT gap G-01-4). The previous report was stale: `src/admin.ts` and `src/admin.test.ts` changed in commit 62c8cce.

## Goal Achievement

The previous report had no `gaps:` section, so every truth got a fresh check. Plan 01-06 changed only `src/admin.ts` (+70/-15 in that commit) and `src/admin.test.ts`. It added `PANEL_CSS`, a `/panel.css` route, `'self'` in `style-src`, a `<link>` to `/panel.css` in `layout()`, and the `<main data-card><article>` card for the login and refusal pages. `src/app.ts`, `src/session.ts`, `src/password.ts` and the script are unchanged. `PICO_CSS_URL` and `PICO_CSS_INTEGRITY` are not in the diff of 62c8cce, so the SRI hash verified earlier (sha384 equal to the file jsDelivr serves) still holds. The only deliberate `PAGE_CSP` change is `style-src 'self' https://cdn.jsdelivr.net`, and the test that pins the whole string was updated to match.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: `pnpm run admin-password` asks twice without echo; `.env` holds only a salted scrypt hash in `ADMIN_PASSWORD`, other lines kept, `.env` created from `.env.example` when missing; differing, empty or under-12-character entries exit with an error and leave `.env` unchanged | ✓ VERIFIED | `adminPasswordScript.test.ts` and `password.test.ts` pass (mismatch, empty, 11 chars, creation from `.env.example`, other lines kept, mode 0600, no plaintext in `.env`, stdout or stderr). The no-echo behaviour in a real tty is attested in `01-UAT.md` test 1, `result: pass`. The script and its modules are unchanged since |
| 2 | SC2: with `ADMIN_PASSWORD` empty, `/login` and `/admin` answer 404 and `/v1` accepts only the Bearer token, exactly as today | ✓ VERIFIED | Probe through `createApp` with an empty hash: `/login`, `/admin` and `/panel.css` all 404; `/v1/notas` with Bearer 200, with a session cookie only 401. The test "answers the plain 404 ... when the panel is off" now also covers `/panel.css` and passes |
| 3 | SC3: with a password set, `/login` -> `/admin`; a wrong password shows only that it failed; repeated failures from one address are slowed | ✓ VERIFIED | Probe: wrong password 401, page marks the field `aria-invalid="true"` and keeps the card markup; right password 303 to `/admin`, `/admin` 200. Throttle (429, Retry-After, one in-flight check per address) is covered by the `admin.test.ts` and `session.test.ts` suites, all passing |
| 4 | SC4: successful login sets an HttpOnly, SameSite=Strict cookie (Secure over HTTPS) expiring after 12 h; with it the browser can call `/v1`, POST also needs CSRF, Bearer unchanged | ✓ VERIFIED | Probe `Set-Cookie`: `nfse_admin=...; Max-Age=43200; Path=/; HttpOnly; SameSite=Strict` (no Secure over `http://`). Secure over real HTTPS: UAT test 2 `pass`. Probe: cookie GET `/v1/notas` 200, cookie POST without CSRF 403, Bearer 200, no credential 401 |
| 5 | SC5: logout ends the session; `/admin` without a valid session redirects to `/login`; re-running the script replaces the hash and earlier sessions stop working | ✓ VERIFIED | Probe: `/admin` without a cookie 303. Tests "admin guard and logout" and "refuses a cookie issued under another password hash (PASS-04)" pass. The session key derives only from the `ADMIN_PASSWORD` hash |
| 6 | 01-05: both pages load Pico 2.1.1 classless with the pinned SRI hash; no script, class or style attribute on panel pages | ✓ VERIFIED | `PICO_CSS_URL` ends `css/pico.classless.min.css`; constants untouched by 62c8cce. Probe regex `\sclass=\|\sstyle=\|<script` on the new login page: no match. Page-wide markup test passes |
| 7 | 01-05: `/admin` is a Pico nav header with `Sair`; Produção and Homologação badges differ; wrong password marks the field invalid; 403/413/CSRF refusals are HTML pages with a link back | ✓ VERIFIED | Code read in `adminPage`, `environmentBadge`, `loginPage`, `refusalPage`. Probe: cross-site login 403 with the card markup and `Voltar ao login`; `/admin` 200 with `<nav>` and, correctly, no `data-card` (the panel keeps Pico's full-width container). Covered by the passing tests in `admin.test.ts` |
| 8 | 01-06: `/panel.css` is served from this origin as `text/css` with the panel headers, 404 when the panel is off, and `PAGE_CSP` allows `'self'` styles | ✓ VERIFIED | Probe (panel on): `200 text/css; charset=utf-8`, `Content-Security-Policy: default-src 'none'; style-src 'self' https://cdn.jsdelivr.net ...`, `nosniff`. Probe (panel off): 404. `PANEL_CSS` has no `url(` or `@import` (probe false). Tests "serves /panel.css from this origin as text/css with the panel headers" and the pinned CSP test pass |
| 9 | 01-06: login and refusal pages are one `<main data-card><article>` card, with `main[data-card]` centering via grid and `max-width: 24rem`, no class or style attributes | ✓ VERIFIED | Probe: login page matches `<main data-card>\s*<article>\s*<header>`; the wrong-password 401 page and the 403 refusal page carry `data-card` too; no class, style or script attribute. `PANEL_CSS` read: `place-items: center` on `main[data-card]`, `max-width: 24rem` on its article. Tests pin both rules. The visual outcome is attested by UAT test 5 |

**Score:** 5/5 ROADMAP truths verified; the plan-05 and plan-06 truths (rows 6 to 9) also verified. 0 present, behavior-unverified.

### Deferred Items

None.

### Advisory / Warnings

| # | Finding | Category | Detail |
|---|---------|----------|--------|
| W1 | WR-01 (`01-REVIEW.md`, `open`): `POST /login` caps the body at 4 KiB (`src/admin.ts`, `4 * 1024`) but `validatePassword` accepts up to 1024 code points | WARNING | Unchanged. A ~1000-character non-ASCII password can be saved by the script but is refused at login with 413. No normal password is affected and no ROADMAP criterion breaks, so it is not a gap. Fix: derive the limit from `MAX_PASSWORD_LENGTH`, or consciously defer |
| W2 | IN-01 / IN-02 / IN-03 (`open`): `parseHash` accepts memory parameters above `SCRYPT_MAXMEM`; throttle cap evicts by insertion order; `.env` is rewritten non-atomically | INFO | Edge cases (hand-edited hash, 10 000 addresses, crash mid-write); none blocks the goal |
| W3 | IN-04 (`open`): in the page-wide markup test the "correct password" entry is really a 429 page | INFO | Test quality only; the success path is covered separately (303 in the probe and tests) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/password.ts` | scrypt hash/parse/verify | ✓ VERIFIED | unchanged since the first verification |
| `scripts/admin-password.mjs` | operator script | ✓ VERIFIED | unchanged; `admin-password` script present in `package.json` |
| `.env.example`, `src/env.ts` | empty `ADMIN_PASSWORD` setting | ✓ VERIFIED | |
| `src/session.ts` | signed cookie, CSRF, HTTPS detection, throttle | ✓ VERIFIED | unchanged |
| `src/admin.ts` | login, logout, guard, pages, refusals, `/panel.css` | ✓ VERIFIED | `layout`, `loginPage`, `environmentBadge`, `adminPage`, `refusalPage`, `PANEL_CSS` all used by routes |
| `src/app.ts` | `requireAuth`, conditional `registerAdmin` | ✓ VERIFIED | unchanged |
| `src/server.ts` | startup notice | ✓ VERIFIED | |
| `README.md` | pt-BR `## Painel administrativo` | ✓ VERIFIED | |
| `src/admin.test.ts` | pins CSP, SRI, `/panel.css` and card markup | ✓ VERIFIED | passes |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/admin-password.mjs` | `src/password.ts` | import | WIRED | |
| `src/app.ts` | `src/admin.ts` | `registerAdmin(app, ...)` only when a hash is set | WIRED | probe: panel off gives 404 on every panel route including `/panel.css` |
| `src/app.ts` | `src/session.ts` | `sessionKey`, `readSession`, `csrfToken` | WIRED | probe: cookie GET `/v1` 200, POST without CSRF 403 |
| `src/admin.ts` | `src/password.ts` | `verifyPassword` | WIRED | |
| `src/admin.ts` | `src/session.ts` | `throttle.begin` / `end`, `clientIp` | WIRED | |
| `src/admin.ts` `layout()` | `/panel.css` route | `<link rel="stylesheet" href="/panel.css">` after Pico; route behind `pageHeaders` | WIRED | probe: route answers 200 with the panel CSP; link asserted on every page by test |
| `src/admin.ts` `PAGE_CSP` | `/panel.css` | `style-src 'self'` allows the same-origin sheet | WIRED | header observed in the probe |
| `loginPage` / `refusalPage` | `PANEL_CSS` | `main[data-card]` selector | WIRED | probe: pages carry `data-card`, `/admin` does not |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `/admin` page | cnpj, environment, csrf | `env.ISSUER_CNPJ`, `env.NFSE_ENVIRONMENT`, `csrfToken(key, session.id)` | Yes | ✓ FLOWING |
| `/login` form | submitted password | `parseBody()` -> `verifyPassword` against `env.ADMIN_PASSWORD` | Yes | ✓ FLOWING |

`<main id="notas">` is intentionally empty: the notas list is Phase 2 (PANEL-01..04).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `pnpm test` | 14 files passed, 199 passed, 1 skipped | ✓ PASS |
| Types | `pnpm run typecheck` | clean | ✓ PASS |
| End-to-end through `createApp` (panel on and off, `/panel.css`, card markup, wrong and right password, cookie flags, cross-site 403 page, `/admin`, `/v1` with Bearer, cookie, cookie POST, none) | temporary vitest file written by the verifier, output captured, file deleted (`git status` clean) | all values as recorded in Observable Truths | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED. No `probe-*.sh` scripts exist or are declared by any plan.

### Requirements Coverage

All 10 phase IDs appear in PLAN frontmatter (01-01: PASS-01..04; 01-02: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-06, PASS-04; 01-03: AUTH-03, AUTH-02; 01-04: AUTH-05, AUTH-01, PASS-04; 01-05: AUTH-02, AUTH-03, AUTH-06; 01-06: AUTH-02). REQUIREMENTS.md maps no other ID to Phase 1, so there are no orphans.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PASS-01 | 01-01 | script asks twice without echo | ✓ SATISFIED | script tests; UAT test 1 pass in a real terminal |
| PASS-02 | 01-01 | mismatch, empty or under 12 chars exits with error, `.env` unchanged | ✓ SATISFIED | script tests |
| PASS-03 | 01-01 | only a salted scrypt hash, `.env` created from example, other lines kept | ✓ SATISFIED | script tests |
| PASS-04 | 01-01, 01-02, 01-04 | re-run replaces hash; old sessions stop working | ✓ SATISFIED | second-run test; other-hash cookie refused |
| AUTH-01 | 01-02, 01-04 | empty password: 404s, `/v1` Bearer only | ✓ SATISFIED | probe: 404, 404, 404 (`/panel.css`), Bearer 200, cookie 401 |
| AUTH-02 | 01-02, 01-03, 01-05, 01-06 | login with the right password lands on `/admin` | ✓ SATISFIED | probe 303 to `/admin`, `/admin` 200; UAT test 5. See W1 for the long non-ASCII edge |
| AUTH-03 | 01-02, 01-03, 01-05 | wrong password, generic error, repeated failures slowed | ✓ SATISFIED | probe 401 plus throttle tests |
| AUTH-04 | 01-02 | HttpOnly, SameSite=Strict, Secure over HTTPS, 12 h | ✓ SATISFIED | probe flags; UAT test 2 pass |
| AUTH-05 | 01-04 | cookie works on `/v1`; POST needs CSRF; Bearer unchanged | ✓ SATISFIED | probe: 200 / 403 / 200 / 401 |
| AUTH-06 | 01-02, 01-05 | logout ends session; `/admin` redirects to `/login` | ✓ SATISFIED | guard and logout tests; probe 303 |

Bookkeeping: `.planning/REQUIREMENTS.md` still shows PASS-01..04, AUTH-01, AUTH-04 and AUTH-05 unchecked and "Pending" (only AUTH-02, AUTH-03, AUTH-06 are ticked). All ten are satisfied in code, so the orchestrator should tick them at phase close. The verifier did not edit that file.

### Anti-Patterns Found

Scanned `src/admin.ts`, `src/session.ts`, `src/password.ts`, `src/app.ts`, `src/server.ts` and `scripts/admin-password.mjs` for `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`: none. No placeholder or stub returns. No bare `c.text(` refusals. The empty `<main id="notas">` is the Phase 2 hook, not a stub of this phase's goal.

### Prohibitions

| Prohibition | Tier | Status | Evidence |
|-------------|------|--------|----------|
| Plaintext admin password never leaves the script process | test | ✓ enforced | `adminPasswordScript.test.ts` |
| Submitted login password never echoed or logged | test | ✓ enforced | probe and `admin.test.ts` "does not log the submitted password" |
| `API_TOKEN` never reaches browser or session | test | ✓ enforced | `admin.test.ts` "never exposes API_TOKEN and refuses a session signed with it" |
| No third-party resource on `/login` or `/admin` except SRI-pinned Pico | test | ✓ enforced | `style-src` adds only `'self'`; the only absolute URL is the Pico link with `integrity`; `/panel.css` has no `url(` or `@import` |
| 01-05: MUST NOT loosen `PAGE_CSP` beyond what plan 01-06 records | test | ✓ enforced | the sole change is `'self'` in `style-src`, pinned verbatim in the CSP test; scripts, images, forms and framing are as before |
| MUST NOT add class or style attributes to panel markup | test | ✓ enforced | probe regex found none on the new login page; page-wide test passes |

### Human Verification

None outstanding. Every check that needs a person is recorded as done in `01-UAT.md` (`status: complete`, 3 passed, 2 issues, both resolved):

- Test 1, no-echo prompts in a real terminal (PASS-01): pass.
- Test 2, Secure cookie over real HTTPS (AUTH-04): pass.
- Test 3 / gap G-01-3, Pico, SRI and CSP in a real browser: issue (cosmetic), resolved by 01-05.
- Test 4 / gap G-01-4, page-wide login field and button: issue (cosmetic), resolved by 01-06 (commit 62c8cce).
- Test 5, centered login card on desktop (light and dark) and a narrow window, wrong password still red: pass.

### Gaps Summary

No must-have truth failed, so there are no gaps. The phase goal is achieved in code: the operator script, login and logout, the signed session cookie, the throttle, CSRF and the unchanged Bearer behaviour on `/v1` are present, wired and exercised, and gap-closure plan 01-06 added the same-origin `/panel.css`, the `'self'` style source and the card layout without touching any auth path. The real-terminal, real-HTTPS and real-browser checks are attested as passing in `01-UAT.md`. The only open item is the WR-01 warning (very long non-ASCII passwords are accepted by the script but refused at login with 413), which is not a gap.

---

_Verified: 2026-11-20T21:50:00Z_
_Verifier: Claude (gsd-verifier)_
