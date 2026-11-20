---
phase: 01-admin-password-and-login
reviewed: 2026-11-20T20:18:15Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - .env.example
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
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
  necessity: 0
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-11-20T20:18:15Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Scope came from the phase SUMMARY `key-files` plus the evaluation-scope resolver (status `resolved`, source
`task-commits`, 14 files; `.env.example` added from SUMMARY 01-01). Every file was read in full, and the five phase
test files were run (91 tests pass).

Overall the authentication surface is solid. Passwords are hashed with salted scrypt, verified in constant time and
never throw. Session cookies are HMAC-signed, expire after 12 h, and are signed with a key derived only from the
ADMIN_PASSWORD hash. CSRF is required on non-GET `/v1` calls made with the cookie, and the Bearer token keeps
priority. `POST /login` runs the body limit, the cross-site check and the throttle before any scrypt work. Pages are
escaped by `hono/html` and carry CSP, no-store, nosniff and no-referrer headers. A probe confirmed that
`app.use('/admin/*', ...)` also matches `/admin`, so the guard and page headers cover the panel root.

The decisions recorded in 01-CONTEXT.md are treated as accepted risks and are not reported as findings: trusting the
last X-Forwarded-For entry (D-09), logout without revocation (D-04), no global limit (D-08) and the stateless cookie
(D-01).

There is one Warning: the login body limit is smaller than what the password policy allows. The three Info items are
about robustness.

Necessity was assessed using `.claude/gsd-core/references/necessity-review.md`. There are no necessity findings. The
session re-check in `GET /admin` (`src/admin.ts:194-195`) repeats the `/admin/*` guard, but it is deliberate defense in
depth and also narrows the session type for `csrfToken`.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Login body limit rejects passwords that the password policy accepts

**File:** `src/admin.ts:144`
**Issue:** `POST /login` caps the body at 4 KiB, while `validatePassword` (`src/password.ts:35-41`) and the
`admin-password` script accept up to 1024 code points. Browsers send the form as `application/x-www-form-urlencoded`,
so each non-ASCII code point grows to 6-12 bytes: `ã` becomes `%C3%A3`, and an emoji becomes 12 bytes. A password of
700 accented characters encodes to 4209 bytes, which is checked with `URLSearchParams`. Any password of about 680 or
more non-ASCII code points, or about 340 or more emoji, is answered with 413 "Pedido grande demais." The admin can save
that password but can never log in with it. The password is not checked, so it does not count as a failure either, and
the admin has no hint that the password length is the cause.
**Fix:** Derive the limit from the policy, so the two values cannot drift apart:
```ts
// worst case: 4 UTF-8 bytes per code point, 3 chars per percent-encoded byte, plus field name and slack
const LOGIN_BODY_MAX = MAX_PASSWORD_LENGTH * 12 + 256
app.post('/login', bodyLimit({ maxSize: LOGIN_BODY_MAX, onError: ... }), ...)
```
Another option is to lower `MAX_PASSWORD_LENGTH`, or to bound the password in UTF-8 bytes instead of code points, so
that the largest valid password always fits in 4 KiB once encoded. Add a test that logs in with a password at the
maximum length made of multi-byte characters.

## Info

### IN-01: parseHash accepts scrypt parameters whose memory exceeds SCRYPT_MAXMEM

**File:** `src/password.ts:55-58` (with `src/password.ts:10`, `src/app.ts:34`)
**Issue:** `parseHash` accepts N up to 2^20 and r up to 16. scrypt needs about 128·N·r bytes, so for example
`N=1048576, r=8` needs 1 GiB, which exceeds the 256 MiB `maxmem`. For such a hash, `adminPanelNotice` logs
"admin panel on /admin", but every login fails because `derive` rejects and `verifyPassword` returns false. Only a
hand-edited hash can have these parameters, but then the startup notice is wrong and nothing explains the failures.
**Fix:** In `parseHash`, reject any hash where `128 * N * r > SCRYPT_MAXMEM` (with headroom). The notice then reports it as
"not a valid hash".

### IN-02: Throttle cap evicts by insertion order, including in-flight or blocked entries

**File:** `src/session.ts:109-112`
**Issue:** When the map holds `THROTTLE_MAX_ENTRIES`, the oldest inserted key is deleted, even if it is in flight or
still blocked. An existing entry keeps its original position, so a long-blocked address is evicted first. Once evicted,
that address gets a fresh entry: its delay is lost, and a later `end()` for the evicted in-flight attempt does nothing,
which breaks the rule of one attempt per address. An attacker needs at least 10,000 distinct addresses within the
prune window, so the extra exposure beyond D-08 and D-09 is small.
**Fix:** Before falling back to insertion order, prefer to evict entries that are neither in flight nor blocked. You can
also refresh an entry's position on each failure (delete it and set it again) so that eviction is least recently used.

### IN-03: admin-password rewrites .env in place, not atomically

**File:** `scripts/admin-password.mjs:86-87`
**Issue:** `writeFileSync` truncates `.env` and then writes it again. `.env` also holds `CERT_PFX_B64`,
`CERT_PASSWORD` and `API_TOKEN`. If the process is killed or the disk fills during the write, the file can be left
truncated, and those secrets are lost.
**Fix:** Write to `.env.tmp` with mode `0o600`, then `renameSync` it over `.env`. This is atomic on the same filesystem.

---

_Reviewed: 2026-11-20T20:18:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
