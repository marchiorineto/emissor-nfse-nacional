---
phase: 01-admin-password-and-login
verified: 2026-11-20T20:25:00Z
status: human_needed
score: 4/5 must-haves verified
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
covered_digest: "v4:sha256:3404ccc6208aadaf002804a2bff05daabba203a2a04345d27de8d6672fd23ef6"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "Operator types the password twice without it being echoed (ROADMAP SC1 / PASS-01)"
    test: "In a real terminal at the repo root (use a scratch clone: this sets the real panel password) run `pnpm run admin-password` and type a 12+ character password at both prompts"
    expected: "No typed character or asterisk appears at either prompt; the script then prints the two pt-BR confirmation lines"
    why_human: "Raw-mode terminal echo cannot be observed from a non-interactive shell; the code calls setRawMode(true) before the question is written, but no test can see the tty"
human_verification:
  - test: "Run `pnpm run admin-password` in a real terminal and type the password at both prompts"
    expected: "Nothing is echoed (no characters, no asterisks); the script prints 'Senha do painel gravada no .env (ADMIN_PASSWORD), só como hash scrypt.' and 'Reinicie o servidor para usar esta senha. As sessões abertas deixam de valer.'"
    why_human: "Raw-mode terminal echo cannot be observed from a non-interactive shell (PASS-01)"
  - test: "Run the server behind an HTTPS proxy (or with PUBLIC_URL=https://...), log in at /login and open the browser devtools cookie panel"
    expected: "The nfse_admin cookie shows HttpOnly, Secure, SameSite Strict, Path /, and an expiry 12 hours after login"
    why_human: "A real TLS front end and the browser cookie store cannot be exercised from app.request (AUTH-04 Secure-over-HTTPS in a real browser)"
  - test: "Set ADMIN_PASSWORD, run `pnpm start`, open http://localhost:8080/login, log in, open the devtools console on /login and /admin"
    expected: "Both pages are styled by Pico (light/dark following the system), no Subresource Integrity or Content-Security-Policy error in the console, and the Network panel shows requests only to localhost and cdn.jsdelivr.net"
    why_human: "SRI and CSP enforcement and the visual result happen only in a real browser (the SRI hash itself was re-checked by the verifier, see Behavioral Spot-Checks)"
---

# Phase 1: Admin Password and Login Verification Report

**Phase Goal:** The operator can protect the install with an admin password and log in and out of the browser panel, while `/v1` keeps working with the Bearer token exactly as today.
**Verified:** 2026-11-20T20:25:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

All automated evidence supports the goal. The full suite passes (14 files, 191 passed, 1 skipped), `tsc --noEmit` is clean, and an independent end-to-end probe written by the verifier (not taken from the SUMMARYs) confirmed the behaviours below through the real `createApp`. The status is `human_needed` rather than `passed` because three checks only a person can do remain open (terminal echo, Secure cookie in a real browser over HTTPS, Pico/SRI/CSP in a real browser), and one WARNING defect (WR-01) was reproduced.

### Observable Truths

ROADMAP success criteria (the contract) plus the plan-level truths that bear on them.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: `pnpm run admin-password` asks twice without echo; `.env` holds only a salted scrypt hash in `ADMIN_PASSWORD`, other lines kept, `.env` created from `.env.example` when missing; differing / empty / <12 char entries exit with an error and leave `.env` unchanged | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Everything except terminal echo is VERIFIED: `scripts/admin-password.mjs` + `src/password.ts` read; 36 tests in `adminPasswordScript.test.ts` / `password.test.ts` pass (mismatch, empty, no input, 11 chars, no `.env` created on bad entry, creates from `.env.example`, CRLF and lookalike lines kept, all `ADMIN_PASSWORD=` lines rewritten, mode 0600, plaintext never in `.env`/stdout/stderr, never read from env). Echo: `askHidden` calls `stdin.setRawMode(true)` before writing the prompt and never writes typed chars, but only a real tty can prove it. Routed to human verification |
| 2 | SC2: with `ADMIN_PASSWORD` empty, `/login` and `/admin` answer 404 and `/v1` accepts only the Bearer token, exactly as today | ✓ VERIFIED | `app.ts:59` registers admin routes only `if (admin)`; `env.ts:41` trims the value. Verifier probe on an app with empty hash: `/login` 404, `/admin` 404, `/v1/notas` with Bearer 200, with only a cookie 401. `src/app.test.ts` is byte-identical to commit 493c092 (empty `git diff`) and passes. `requireAuth` Bearer branch is the original `requireToken` logic |
| 3 | SC3: with a password set, `/login` -> `/admin`; a wrong password shows only that it failed; repeated failures from one address are slowed | ✓ VERIFIED | Probe: wrong password 401, no Set-Cookie, body `Senha incorreta.` with empty password field; immediate second attempt from same address 429 (Retry-After set); right password from another address 303 -> `/admin` 200 with skeleton. `session.ts` `createLoginThrottle` implements 1,2,4,8,16,30 s curve, in-flight single attempt, pruning, 10 000 cap; `admin.ts` calls `throttle.begin` before `verifyPassword` and `throttle.end` in `finally` |
| 4 | SC4: successful login sets an HttpOnly, SameSite=Strict cookie (Secure over HTTPS) expiring after 12 h; with it the browser can call `/v1`, POST also needs CSRF, Bearer unchanged | ✓ VERIFIED | `admin.ts` `setCookie` with httpOnly, sameSite Strict, path `/`, maxAge 43200 (`SESSION_SECONDS`), `secure: isHttps(url, PUBLIC_URL, x-forwarded-proto)`; `admin.test.ts:291` asserts flags and Secure only over https by URL/PUBLIC_URL/proxy. Probe: cookie GET `/v1/notas` 200; cookie POST without token 403; with token from the `csrf-token` meta 400 (past auth, body validation); Bearer + garbage cookie POST 400 (no CSRF needed). A real-browser Secure check remains a human item |
| 5 | SC5: logout ends the session; `/admin` without a valid session redirects to `/login`; re-running the script replaces the hash and every earlier session stops working | ✓ VERIFIED | Probe: `/admin` without cookie 303; POST `/logout` with csrf clears cookie; cookie older than 12 h + 1 s refused (303); a cookie from an app built on hash A is refused (401 on `/v1`) by an app built on hash B. Script re-run replaces the hash (test "replaces the hash on a second run ... verifies only the new password"); key is `sessionKey(ADMIN_PASSWORD)` so a new hash plus restart kills sessions |

**Score:** 4/5 truths verified (1 present, behavior-unverified: terminal echo only)

### Deferred Items

None. Phase 2 and 3 (panel list, nota actions) do not cover any gap found here.

### Advisory / Warnings

| # | Finding | Category | Detail |
|---|---------|----------|--------|
| W1 | WR-01 (from 01-REVIEW.md, disposition `open`): `POST /login` caps the body at 4 KiB but `validatePassword` accepts up to 1024 code points | WARNING (reproduced) | Verifier reproduced it: a 1000-character password of `ã`, hashed and then posted as the browser would send it, gets 413 `Pedido grande demais.` before any password check. Such a password can be saved by the script but never used to log in. Only affects non-ASCII passwords of roughly 680+ accented characters (or ~340 emoji); ASCII passwords up to 1024 fit. Does not break any ROADMAP criterion for normal passwords, so it is not recorded as a gap, but it should be fixed (derive the limit from `MAX_PASSWORD_LENGTH`) or consciously deferred |
| W2 | IN-01 / IN-02 / IN-03 (01-REVIEW.md, `open`): `parseHash` accepts parameters whose memory exceeds `SCRYPT_MAXMEM` (startup notice says "on" for a hand-edited hash that can never log in); throttle cap evicts by insertion order; `.env` is rewritten non-atomically | INFO | Hand-edited-hash, 10 000-address and crash-mid-write edge cases; none blocks the goal |

### Required Artifacts

`verify.artifacts` returned `all_passed: true` for all four plans (6/6, 6/6, 4/4, 4/4) and `verify.key-links` `all_verified: true` (3/3, 4/4, 2/2, 3/3). Spot-read of the substantive code:

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/password.ts` | scrypt hash/parse/verify, NFKC, bounds | ✓ VERIFIED | 85 lines of real logic; hash format has no `$ space " # =` (checked on a fresh hash); `verifyPassword` never throws |
| `scripts/admin-password.mjs` | the operator script | ✓ VERIFIED | Imports `../src/password.ts`; validates before any write; mode 0600; `package.json` script `admin-password` present |
| `.env.example` | documented empty `ADMIN_PASSWORD=` | ✓ VERIFIED | line 35 |
| `src/env.ts` | `ADMIN_PASSWORD` setting | ✓ VERIFIED | trimmed, defaults to empty |
| `src/session.ts` | signed cookie, CSRF, HTTPS detect, throttle, client IP | ✓ VERIFIED | HMAC-SHA256, constant-time compare, key derived only from the ADMIN_PASSWORD hash |
| `src/admin.ts` | login, logout, guard, pages, hardening | ✓ VERIFIED | body limit -> cross-site check -> throttle -> verify order; page headers on login/logout/admin; `hono/html` escapes interpolations |
| `src/app.ts` | `requireAuth`, conditional `registerAdmin`, `adminPanelNotice` | ✓ VERIFIED | Bearer first when an Authorization header is present or the panel is off; otherwise cookie + CSRF on non-GET/HEAD |
| `src/server.ts` | startup notice | ✓ VERIFIED | `adminPanelNotice(env)` called at line 17 |
| `README.md` | pt-BR `## Painel administrativo` | ✓ VERIFIED | covers script, restart, Docker host-side run, login/logout, 12 h, delay, proxy headers |
| Test files (5) | coverage of the above | ✓ VERIFIED | all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/admin-password.mjs` | `src/password.ts` | import | WIRED | |
| `package.json` | script | `admin-password` | WIRED | same node flags as certificate script |
| `app.ts` | `admin.ts` | `registerAdmin(app, ...)` only when hash set | WIRED | |
| `app.ts` | `session.ts` | `sessionKey(env.ADMIN_PASSWORD)`, `readSession`, `csrfToken(admin.key, ...)` | WIRED | |
| `admin.ts` | `password.ts` | `verifyPassword(password, env.ADMIN_PASSWORD)` | WIRED | |
| `admin.ts` | `session.ts` | `throttle.begin(clientIp(c))` / `end` in `finally` | WIRED | |
| `server.ts` | `app.ts` | `adminPanelNotice(env)` | WIRED | |
| `app.ts` | `password.ts` | `parseHash` decides the misconfigured notice | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `/admin` page | cnpj, environment, csrf | `env.ISSUER_CNPJ`, `env.NFSE_ENVIRONMENT`, `csrfToken(key, session.id)` | Yes | ✓ FLOWING |
| `/login` form | submitted password | `parseBody()` -> `verifyPassword` against `env.ADMIN_PASSWORD` | Yes | ✓ FLOWING |

The `<main id="notas">` area is intentionally empty: the notas list is Phase 2 (PANEL-01..04), outside this phase.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `pnpm test` | 14 files, 191 passed, 1 skipped | ✓ PASS |
| Types | `pnpm run typecheck` | clean | ✓ PASS |
| Script + hash tests | `vitest run src/adminPasswordScript.test.ts src/password.test.ts` | 36 passed | ✓ PASS |
| End-to-end through `createApp` (panel off 404s, Bearer, wrong password 401, throttle 429, login 303, cookie `/v1` GET 200, POST without CSRF 403, with CSRF past auth, Bearer + junk cookie, logout, 12 h expiry, other-hash cookie 401) | temporary vitest file written by the verifier, removed afterwards | 1 passed | ✓ PASS |
| Pico SRI pin is correct | fetched `pico@2.1.1/css/pico.min.css` from jsDelivr and computed sha384 | `sha384-L1dWfspMTHU/ApYnFiMz2QID/PlP1xCW9visvBdbEkOLkSSWsP6ZJWhPw6apiXxU`, identical to `PICO_CSS_INTEGRITY` | ✓ PASS |
| WR-01 reproduction | temporary test, 1000 x `ã` posted to `/login` | 413 | ✗ confirms warning W1 |

### Probe Execution

Step 7c: SKIPPED. No `probe-*.sh` scripts exist or are declared by any plan.

### Requirements Coverage

All 10 phase IDs appear in PLAN frontmatter (01-01: PASS-01..04; 01-02: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-06, PASS-04; 01-03: AUTH-03, AUTH-02; 01-04: AUTH-05, AUTH-01, PASS-04). REQUIREMENTS.md maps no other ID to Phase 1, so there are no orphans.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PASS-01 | 01-01 | script asks twice without echo | ? NEEDS HUMAN | Prompt logic verified, hidden-input path and piped path tested; real-tty no-echo is a human check |
| PASS-02 | 01-01 | mismatch/empty/<12 exits with error, `.env` unchanged | ✓ SATISFIED | tests: differ, blank, no input, 11 chars, no `.env` created |
| PASS-03 | 01-01 | stores only a salted scrypt hash, creates `.env` from example, keeps other lines | ✓ SATISFIED | tests for creation, CRLF, lookalikes, duplicates, mode 0600, no plaintext |
| PASS-04 | 01-01, 01-02, 01-04 | re-run replaces hash; existing sessions stop working | ✓ SATISFIED | second-run test; cross-hash cookie refused on `/admin` and `/v1` |
| AUTH-01 | 01-02, 01-04 | empty password: `/login` `/admin` 404, `/v1` Bearer only | ✓ SATISFIED | probe + tests |
| AUTH-02 | 01-02, 01-03 | login with right password lands on `/admin` | ✓ SATISFIED (see W1 for the >~680 accented-char edge) | probe |
| AUTH-03 | 01-02, 01-03 | wrong password generic error, repeated failures slowed | ✓ SATISFIED | probe + throttle tests |
| AUTH-04 | 01-02 | HttpOnly, SameSite=Strict, Secure over HTTPS, 12 h | ✓ SATISFIED (real-browser Secure check is a human item) | `admin.test.ts:291`, expiry boundary tests |
| AUTH-05 | 01-04 | cookie works on `/v1`; POST needs CSRF; Bearer unchanged | ✓ SATISFIED | probe + `appSession.test.ts`; `app.test.ts` byte-identical |
| AUTH-06 | 01-02 | logout ends session; `/admin` redirects to `/login` | ✓ SATISFIED | probe |

Bookkeeping note: `.planning/REQUIREMENTS.md` still shows these 10 requirements as unchecked / "Pending". The verifier did not edit it; the orchestrator should update the checkboxes and traceability table when closing the phase.

### Anti-Patterns Found

Scanned `src/password.ts`, `src/session.ts`, `src/admin.ts`, `src/app.ts`, `scripts/admin-password.mjs`, `src/server.ts`: no `TODO`, `FIXME`, `XXX`, `TBD` or `HACK` markers, no placeholder or stub returns. The empty `<main id="notas">` is a deliberate Phase 2 hook, not a stub of this phase's goal.

### Prohibitions

| Prohibition | Tier | Status | Evidence |
|-------------|------|--------|----------|
| Plaintext admin password never leaves the script process (not in `.env`, stdout, stderr, argv, env) | test | ✓ enforced | `adminPasswordScript.test.ts` "never lets the plaintext reach .env, stdout or stderr" and "never reads the password from the environment" |
| Submitted login password never echoed or logged | test | ✓ enforced | tests in `admin.test.ts` (401 page lacks the value; console spies); the form field never carries a value in `loginPage` |
| `API_TOKEN` never reaches browser or session | test | ✓ enforced | key derives only from the hash (`sessionKey`); link signature is separate |
| No third-party resource on `/login`/`/admin` except SRI-pinned Pico | test | ✓ enforced in code (CSP + markup tested); real-browser enforcement is human item 3 | `PAGE_CSP`, no scripts or other links in `layout` |

### Other Phase Artifacts Consulted

`01-VALIDATION.md` nyquist_compliant true; `01-SECURITY.md` status verified, threats_open 0; `01-UI-REVIEW.md` 17/24, warnings only (not goal-blocking); `01-REVIEW.md` 1 warning + 3 info, all `open` (see W1, W2).

### Human Verification Required

1. **No echo of the password in a real terminal** (PASS-01). Test: `pnpm run admin-password` in a real terminal (scratch clone recommended). Expected: nothing echoed, both pt-BR confirmation lines printed. Why human: raw-mode tty echo is unobservable from a non-interactive shell.
2. **Secure cookie over real HTTPS** (AUTH-04). Test: serve behind an HTTPS proxy or `PUBLIC_URL=https://...`, log in, inspect the cookie in devtools. Expected: HttpOnly, Secure, SameSite Strict, Path /, 12 h expiry. Why human: real TLS front end and browser cookie store.
3. **Pico styling, SRI and CSP in a real browser**. Test: log in locally and watch the console and Network panel. Expected: styled pages, no SRI/CSP errors, requests only to localhost and cdn.jsdelivr.net. Why human: enforcement and visuals only happen in a browser. (The SRI hash was independently re-computed and matches.)

### Gaps Summary

No must-have truth failed, so there are no blocking gaps. The phase goal is achieved in code and tests: operator script, login/logout, session cookie, throttle, CSRF, and unchanged Bearer behaviour on `/v1` are all present, wired and exercised. Remaining before sign-off: the three human checks above, and a decision on WR-01 (reproduced: very long non-ASCII passwords are accepted by the script but refused at login with 413). The recommended fix is small: set the `/login` body limit from `MAX_PASSWORD_LENGTH * 12 + 256` and add a test with a maximum-length multi-byte password.

---

_Verified: 2026-11-20T20:25:00Z_
_Verifier: Claude (gsd-verifier)_
