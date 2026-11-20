---
phase: 01-admin-password-and-login
verified: 2026-11-20T21:20:00Z
status: human_needed
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
covered_digest: "v4:sha256:55657a22cd97de448e0ced2e981f3d09e2ecdeca4dfce2001b3be23072df86e6"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 4/5
  gaps_closed:
    - "G-01-3 (UAT test 3, cosmetic): pages styled but ugly. Closed in code by plan 01-05; the real-browser re-test is still pending (human item 1)"
    - "PASS-01 terminal echo (previous behavior_unverified item): attested by the operator in 01-UAT.md test 1, result pass"
    - "AUTH-04 Secure cookie over real HTTPS (previous human item): attested in 01-UAT.md test 2, result pass"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Re-run UAT test 3 in a real browser: set ADMIN_PASSWORD, run `pnpm start`, open http://localhost:8080/login, enter a wrong password, then log in and look at /admin (light and dark OS scheme, desktop and a narrow window)"
    expected: "Content is centered with side gutters (not flush to the edges); the wrong-password field has a red border with 'Senha incorreta.' in red under it; /admin has a nav header with a compact 'Sair' button on the right; Produção and Homologação badges look different; the console shows no SRI or CSP error; the Network tab shows requests only to the app origin and cdn.jsdelivr.net; the operator judges it no longer 'ugly'"
    why_human: "SRI and CSP enforcement and the visual judgement that UAT test 3 failed on exist only in a real browser. Plan 01-05 recorded this check as not run. The SRI hash itself was recomputed by the verifier and matches; the markup, badges, error state and refusal pages were observed through createApp"
behavior_unverified_items: []
---

# Phase 1: Admin Password and Login Verification Report

**Phase Goal:** The operator can protect the install with an admin password and log in and out of the browser panel, while `/v1` keeps working with the Bearer token exactly as today.
**Verified:** 2026-11-20T21:20:00Z
**Status:** human_needed
**Re-verification:** Yes, after gap-closure plan 01-05 (UAT gap G-01-3)

## Goal Achievement

The previous report had no `gaps:` section, so every truth got a fresh check against the code instead of a quick regression pass. All five ROADMAP success criteria hold. Plan 01-05 changed only `src/admin.ts` and `src/admin.test.ts` (160 insertions, 28 deletions since `5976f60`). `PAGE_CSP` was not touched, and the behaviour wiring of login, session, throttle and `/v1` is the code that was verified before. The status stays `human_needed` for one reason: the browser re-test of UAT test 3, which would confirm the cosmetic fix, was not run by plan 01-05 (see its SUMMARY, "Pending Human Verification"). Nothing is a FAILED truth, so there is no BLOCKER.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: `pnpm run admin-password` asks twice without echo; `.env` holds only a salted scrypt hash in `ADMIN_PASSWORD`, other lines kept, `.env` created from `.env.example` when missing; differing / empty / <12 char entries exit with an error and leave `.env` unchanged | ✓ VERIFIED | `scripts/admin-password.mjs` and `src/password.ts` read; `adminPasswordScript.test.ts` + `password.test.ts` (36 tests) pass, covering mismatch, empty, no input, 11 chars, creation from `.env.example`, CRLF and lookalike lines, duplicate lines, mode 0600, no plaintext in `.env`/stdout/stderr. No-echo in a real tty: operator UAT test 1 `result: pass` (`01-UAT.md`), which turns the former PRESENT_BEHAVIOR_UNVERIFIED into human-attested evidence. The script and its modules are unchanged since that attestation |
| 2 | SC2: with `ADMIN_PASSWORD` empty, `/login` and `/admin` answer 404 and `/v1` accepts only the Bearer token, exactly as today | ✓ VERIFIED | Verifier probe through `createApp` with an empty hash: `/login` 404, `/admin` 404, `/v1/notas` with Bearer 200, with only a session cookie 401. `src/app.test.ts` is unchanged since commit 493c092 (`git diff 493c092 -- src/app.test.ts` is empty) and passes |
| 3 | SC3: with a password set, `/login` -> `/admin`; a wrong password shows only that it failed; repeated failures from one address are slowed | ✓ VERIFIED | Probe: wrong password -> 401, page shows only `<small id="login-error" role="alert">Senha incorreta.</small>`, password input has no `value`; right password from another address -> 303 to `/admin`, `/admin` 200. Throttle (429 + Retry-After, 1-30 s curve, one in-flight check per address) is exercised by `admin.test.ts` "login throttle" and "parallel attempts" and `session.test.ts`, all passing |
| 4 | SC4: successful login sets an HttpOnly, SameSite=Strict cookie (Secure over HTTPS) expiring after 12 h; with it the browser can call `/v1`, POST also needs CSRF, Bearer unchanged | ✓ VERIFIED | Probe `Set-Cookie`: `nfse_admin=...; Max-Age=43200; Path=/; HttpOnly; SameSite=Strict` (no Secure over `http://`). `admin.test.ts` "sets HttpOnly, SameSite=Strict, Path=/ and Max-Age=43200, and Secure only over HTTPS" passes; Secure over real HTTPS in a browser: UAT test 2 `pass`. Probe: cookie GET `/v1/notas` 200; cookie POST without CSRF 403; Bearer 200; no credential 401 |
| 5 | SC5: logout ends the session; `/admin` without a valid session redirects to `/login`; re-running the script replaces the hash and every earlier session stops working | ✓ VERIFIED | `admin.test.ts` "admin guard and logout" (303 to `/login`, logout clears the cookie, wrong CSRF 403, GET `/logout` 404) and "refuses a cookie issued under another password hash (PASS-04)" pass; session key derives only from the `ADMIN_PASSWORD` hash (`sessionKey`), so a replaced hash plus restart refuses old cookies. Second-run hash replacement covered in the script tests |
| 6 | 01-05: both pages load Pico 2.1.1's classless stylesheet with an SRI hash equal to the file jsDelivr serves, `PAGE_CSP` unchanged | ✓ VERIFIED | `PICO_CSS_URL` ends `css/pico.classless.min.css`. I fetched the file (71 040 bytes) and computed sha384 `NZhm4G1I7BpEGdjDKnzEfy3d78xvy7ECKUwwnKTYi036z42IyF056PbHfpQLIYgL`, identical to `PICO_CSS_INTEGRITY` (present once in `src/admin.ts`). `PAGE_CSP` is not in the diff of `src/admin.ts` since `5976f60`; the response header from the probe is the original string. Test "pins Pico 2.1.1 classless with an SRI hash and keeps the page CSP" passes |
| 7 | 01-05: no panel page carries a script tag, class attribute or style attribute | ✓ VERIFIED | Probe regex `\sclass=\|\sstyle=\|<script` on `/login`, the wrong-password page and `/admin`: no match. Test "allows only Pico from jsDelivr: no script, class or style attribute ... on every page" passes (see IN-04 on its 429 entry) |
| 8 | 01-05: `/admin` header is a Pico nav with the h1, labelled CNPJ and badge on the left and a compact `Sair` posting the CSRF field to `/logout` | ✓ VERIFIED | Probe `/admin` markup: `<header><nav><ul><li><hgroup><h1>Emissor de NFS-e</h1><p>CNPJ 11.222.333/0001-81 ...`, second `<ul>` with `<form method="post" action="/logout"><input type="hidden" name="csrf" ...><button>Sair</button>`. The button has no `type` on purpose, as the plan decided. The compact look itself is a visual item for the browser re-test |
| 9 | 01-05: Produção is `<strong><mark data-theme="dark">`, homologação is `<mark data-theme="light">` | ✓ VERIFIED | Probe: production app rendered `<strong><mark data-theme="dark">Produção</mark></strong>`; restricted app rendered `<mark data-theme="light">Homologação (produção restrita)</mark>` |
| 10 | 01-05: wrong password sets `aria-invalid="true"` and `aria-describedby="login-error"` with `<small id="login-error" role="alert">`; the 429 notice uses the small without aria-invalid; no value on the field | ✓ VERIFIED | Probe 401 page: `<input type="password" ... required autofocus aria-describedby="login-error" aria-invalid="true">` followed by the small. Code in `loginPage` leaves `aria-invalid` off unless `invalid` is true, and `429` calls `loginPage(msg)` without it; test "marks the password field invalid after a wrong password" passes |
| 11 | 01-05: cross-site login (403), oversized login (413) and logout with a bad CSRF token (403) answer an HTML page with Pico, panel headers and a link back | ✓ VERIFIED | Probe: 403 `text/html`, link `<a href="/login">Voltar ao login</a>`; 413 `text/html`, same link; bad-CSRF logout 403 `text/html`, `<a href="/admin">Voltar ao painel</a>`; all three carry `integrity=` (Pico) and the page CSP header. `grep c.text(` finds no bare text refusals left. Statuses unchanged |

**Score:** 5/5 ROADMAP truths verified; the 6 plan-05 truths also verified (rows 6 to 11). 0 present, behavior-unverified.

### Deferred Items

None.

### Advisory / Warnings

| # | Finding | Category | Detail |
|---|---------|----------|--------|
| W1 | WR-01 (01-REVIEW.md, disposition `open`): `POST /login` caps the body at 4 KiB (`src/admin.ts:183`, `4 * 1024`) but `validatePassword` accepts up to 1024 code points | WARNING | Still present, and reproduced in the earlier verification: a ~1000-character password of accented letters can be saved by the script but is refused at login with 413. Plan 01-05 turned that 413 into an HTML page with a link back, but gave no hint about the cause. Affects only very long non-ASCII passwords; no ROADMAP criterion breaks for normal passwords, so it is not a gap. Fix: derive the limit from `MAX_PASSWORD_LENGTH`, or consciously defer |
| W2 | IN-01 / IN-02 / IN-03 (`open`): `parseHash` accepts memory parameters above `SCRYPT_MAXMEM`; throttle cap evicts by insertion order; `.env` is rewritten non-atomically | INFO | Edge cases (hand-edited hash, 10 000 addresses, crash mid-write); none blocks the goal |
| W3 | IN-04 (`open`, new in the 01-05 review): in the page-wide markup test the "correct password" entry is really a 429 page | INFO | Test-quality only; the 429 page is still covered by coincidence. The probe above checked the success path separately (303) |
| W4 | `01-UI-REVIEW.md` re-audit 20/24 (was 17/24), no pillar below 3 | INFO | Residual items: in dark mode the production badge is the less visible one (navy on near-black); refusal pages do not say why; the login field spans the container on wide desktops. Plan 01-05 recorded the last as "not addressed, by design" because classless Pico has no narrower wrapper. These are what the browser re-test will judge |

### Required Artifacts

`verify.artifacts` returned `all_passed: true` for all five plans (6/6, 6/6, 4/4, 4/4, 2/2) and `verify.key-links` `all_verified: true` for all five (3/3, 4/4, 2/2, 3/3, 3/3).

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/password.ts` | scrypt hash/parse/verify | ✓ VERIFIED | unchanged since the first verification |
| `scripts/admin-password.mjs` | operator script | ✓ VERIFIED | unchanged; `package.json` script `admin-password` present |
| `.env.example` | empty `ADMIN_PASSWORD=` | ✓ VERIFIED | |
| `src/env.ts` | `ADMIN_PASSWORD` setting | ✓ VERIFIED | |
| `src/session.ts` | signed cookie, CSRF, HTTPS detect, throttle | ✓ VERIFIED | unchanged |
| `src/admin.ts` | login, logout, guard, pages, refusals | ✓ VERIFIED | 237 lines; `layout`, `loginPage`, `environmentBadge`, `adminPage`, `refusalPage` all used by routes |
| `src/app.ts` | `requireAuth`, conditional `registerAdmin`, `adminPanelNotice` | ✓ VERIFIED | unchanged; `registerAdmin` signature unchanged as plan 01-05's key link requires |
| `src/server.ts` | startup notice | ✓ VERIFIED | |
| `README.md` | pt-BR `## Painel administrativo` | ✓ VERIFIED | |
| `src/admin.test.ts` | pins and asserts the 01-05 markup | ✓ VERIFIED | 31 tests in the file pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/admin-password.mjs` | `src/password.ts` | import | WIRED | |
| `src/app.ts` | `src/admin.ts` | `registerAdmin(app, ...)` only when a hash is set | WIRED | probe: panel off gives 404s |
| `src/app.ts` | `src/session.ts` | `sessionKey`, `readSession`, `csrfToken` | WIRED | probe: cookie GET `/v1` 200, POST without CSRF 403 |
| `src/admin.ts` | `src/password.ts` | `verifyPassword` | WIRED | |
| `src/admin.ts` | `src/session.ts` | `throttle.begin` / `end`, `clientIp` | WIRED | |
| `src/server.ts` | `src/app.ts` | `adminPanelNotice(env)` | WIRED | |
| `src/admin.ts` | `src/admin.ts` | 403/413/CSRF paths call `refusalPage(...)` through `layout()` | WIRED | probe: all three answer `text/html` with the SRI link |
| `src/admin.test.ts` | `src/admin.ts` | imports `PICO_CSS_URL`, `PICO_CSS_INTEGRITY`, `PAGE_CSP` | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `/admin` page | cnpj, environment, csrf | `env.ISSUER_CNPJ`, `env.NFSE_ENVIRONMENT`, `csrfToken(key, session.id)` | Yes (probe shows `11.222.333/0001-81`, the right badge per environment, a CSRF token that logout accepts) | ✓ FLOWING |
| `/login` form | submitted password | `parseBody()` -> `verifyPassword` against `env.ADMIN_PASSWORD` | Yes | ✓ FLOWING |

`<main id="notas">` is intentionally empty: the notas list is Phase 2 (PANEL-01..04).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `pnpm test` | 14 files passed, 197 passed, 1 skipped | ✓ PASS |
| Types | `pnpm run typecheck` | clean | ✓ PASS |
| End-to-end through `createApp` (login page, wrong password, login 303, `/admin` markup, cookie/Bearer/none on `/v1`, cookie POST without CSRF, three refusal pages, panel off, both environment badges, class/style/script scan) | temporary vitest file written by the verifier, output captured, file deleted (`git status` clean) | all values as recorded in Observable Truths | ✓ PASS |
| Pico classless SRI pin | fetched `pico@2.1.1/css/pico.classless.min.css` from jsDelivr, computed sha384 | equals `PICO_CSS_INTEGRITY` | ✓ PASS |
| `src/app.test.ts` untouched | `git diff 493c092 -- src/app.test.ts \| wc -l` | 0 | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED. No `probe-*.sh` scripts exist or are declared by any plan.

### Requirements Coverage

All 10 phase IDs appear in PLAN frontmatter (01-01: PASS-01..04; 01-02: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-06, PASS-04; 01-03: AUTH-03, AUTH-02; 01-04: AUTH-05, AUTH-01, PASS-04; 01-05: AUTH-02, AUTH-03, AUTH-06). REQUIREMENTS.md maps no other ID to Phase 1, so no orphans.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PASS-01 | 01-01 | script asks twice without echo | ✓ SATISFIED | script tests plus UAT test 1 pass in a real terminal |
| PASS-02 | 01-01 | mismatch/empty/<12 exits with error, `.env` unchanged | ✓ SATISFIED | script tests |
| PASS-03 | 01-01 | only a salted scrypt hash, `.env` created from example, other lines kept | ✓ SATISFIED | script tests |
| PASS-04 | 01-01, 01-02, 01-04 | re-run replaces hash; old sessions stop working | ✓ SATISFIED | second-run test; other-hash cookie refused |
| AUTH-01 | 01-02, 01-04 | empty password: 404s, `/v1` Bearer only | ✓ SATISFIED | probe `OFF 404 404 200 401` |
| AUTH-02 | 01-02, 01-03, 01-05 | login with the right password lands on `/admin` | ✓ SATISFIED | probe 303 to `/admin`, `/admin` 200. See W1 for the long non-ASCII edge |
| AUTH-03 | 01-02, 01-03, 01-05 | wrong password, generic error, repeated failures slowed | ✓ SATISFIED | probe plus throttle tests |
| AUTH-04 | 01-02 | HttpOnly, SameSite=Strict, Secure over HTTPS, 12 h | ✓ SATISFIED | probe flags; UAT test 2 pass |
| AUTH-05 | 01-04 | cookie works on `/v1`; POST needs CSRF; Bearer unchanged | ✓ SATISFIED | probe: 200 / 403 / 200 / 401 |
| AUTH-06 | 01-02, 01-05 | logout ends session; `/admin` redirects to `/login` | ✓ SATISFIED | guard and logout tests |

Bookkeeping: `.planning/REQUIREMENTS.md` still shows PASS-01..04, AUTH-01, AUTH-04 and AUTH-05 unchecked / "Pending" (only AUTH-02, AUTH-03, AUTH-06 were ticked by plan 01-05). All ten are satisfied in code, so the orchestrator should tick them at phase close. The verifier did not edit that file.

### Anti-Patterns Found

Scanned `src/admin.ts`, `src/session.ts`, `src/password.ts`, `src/app.ts`, `src/server.ts` and `scripts/admin-password.mjs` for `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`: none. No placeholder or stub returns. No `c.text(` refusals left. Empty `<main id="notas">` is the Phase 2 hook, not a stub of this phase's goal.

### Prohibitions

| Prohibition | Tier | Status | Evidence |
|-------------|------|--------|----------|
| Plaintext admin password never leaves the script process | test | ✓ enforced | `adminPasswordScript.test.ts` (no plaintext in `.env`, stdout, stderr; never read from env) |
| Submitted login password never echoed or logged | test | ✓ enforced | probe: the 401 page input has no `value`; `admin.test.ts` "does not log the submitted password" passes |
| `API_TOKEN` never reaches browser or session | test | ✓ enforced | `admin.test.ts` "never exposes API_TOKEN and refuses a session signed with it" passes |
| No third-party resource on `/login`/`/admin` except SRI-pinned Pico (01-03) | test | ✓ enforced | CSP byte-identical; page-wide markup test passes; the only absolute URL is the Pico link with `integrity` |
| 01-05: MUST NOT loosen `PAGE_CSP` or load any other third-party resource | test | ✓ enforced | `PAGE_CSP` not in the diff; header observed in the probe is the original |
| 01-05: MUST NOT add class or style attributes to panel markup | test | ✓ enforced | probe regex found none on three pages; page-wide test passes |

### Human Verification Required

1. **Browser re-test of UAT test 3 (G-01-3).** Test: set `ADMIN_PASSWORD`, run `pnpm start`, open `http://localhost:8080/login`, submit a wrong password, then log in, in light and dark OS schemes and at desktop and narrow widths. Expected: centered content with gutters; red-bordered field with the red `Senha incorreta.` under it; nav header with a compact `Sair` on the right; visibly different Produção and Homologação badges; no SRI or CSP error in the console; requests only to the app origin and `cdn.jsdelivr.net`; the operator no longer finds it ugly. Why human: SRI/CSP enforcement and visual judgement happen only in a browser, and the original gap was a subjective visual report. Plan 01-05 did not run this check.

### Gaps Summary

No must-have truth failed, so there are no blocking gaps. The phase goal is achieved in code: the operator script, login and logout, the signed session cookie, the throttle, CSRF and the unchanged Bearer behaviour on `/v1` are present, wired and exercised. Gap-closure plan 01-05 delivered each of its six truths as observed in the rendered output, with the SRI hash matching the file jsDelivr serves. The two checks that needed a person before (terminal echo, Secure cookie over HTTPS) are now attested as `pass` in `01-UAT.md`. What remains is the one browser re-test above, plus a decision on WR-01 (very long non-ASCII passwords accepted by the script but refused at login with 413), which is a warning and not a gap.

---

_Verified: 2026-11-20T21:20:00Z_
_Verifier: Claude (gsd-verifier)_
