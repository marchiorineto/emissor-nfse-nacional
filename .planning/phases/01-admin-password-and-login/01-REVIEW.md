---
phase: 01-admin-password-and-login
reviewed: 2026-11-20T21:10:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/admin.test.ts
  - src/admin.ts
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
  necessity: 0
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-11-20T21:10:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

This is an incremental review of gap-closure plan 01-05. It covers what changed since the previous review (commit
`0081b45`). The evaluation-scope resolver returned status `resolved`, source `task-commits`, with 5 task commits, and
the scope is `src/admin.ts` and `src/admin.test.ts`. Nothing was outside the union and nothing was unreachable. Both
files were read in full, and `src/admin.test.ts` was run (31 tests pass).

Plan 01-05 adds the following, and all of it is sound:

- **Pico classless with SRI.** The pinned 2.1.1 classless file was fetched from jsDelivr and hashed locally, and its
  SHA-384 matches `PICO_CSS_INTEGRITY` exactly. jsDelivr answers with `access-control-allow-origin: *`, so
  `crossorigin="anonymous"` with SRI works. The CSP `style-src https://cdn.jsdelivr.net` still covers the stylesheet,
  and no inline style or class attribute was added (a test now checks this on every page).
- **Environment badges.** The classless build defines `[data-theme=light]` and `[data-theme=dark]` scopes that can be
  set on any element, and `mark` reads `--pico-mark-background-color` and `--pico-mark-color` from them. So the light
  badge (amber, dark text) and the dark badge (`#014063`, white text) differ in both OS color schemes.
  `NFSE_ENVIRONMENT` is free text in `env.ts`, but `config.ts:25` refuses any value other than `production` or
  `restricted` before an emission, so a misspelled production value cannot emit under the light badge.
- **Invalid-field login error.** `aria-describedby` is set whenever there is an error, and `aria-invalid` only on a
  wrong password, not on the 429 notice. The password input never carries a `value`.
- **HTML refusal pages.** 403 (cross-site), 413 (body limit) and 403 (logout CSRF) now render `refusalPage`. It takes
  only fixed strings and a link typed as `'/login' | '/admin'`, so no request data is echoed. `pageHeaders` still
  applies to these refusals, including the `bodyLimit` `onError` path, and tests now cover that.

There are no new Critical or Warning findings. WR-01 from the previous review still applies: the 4 KiB login body
limit now sits at `src/admin.ts:183` and is unchanged, so it is carried forward and was re-verified. IN-01 to IN-03
concern files outside this incremental scope (`src/password.ts`, `src/session.ts`, `scripts/admin-password.mjs`).
Those files are unchanged since the previous review, so the findings are carried forward as they were, with the same
IDs, and were not re-reviewed. IN-04 is new: a test-clarity issue.

Necessity was assessed using `.claude/gsd-core/references/necessity-review.md`. There are no necessity findings. The
`environmentLabel` fallback (any other value is shown as given) sits on a trust boundary (the environment), so it is
not an impossible-state guard.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Login body limit rejects passwords that the password policy accepts (carried forward, re-verified)

**File:** `src/admin.ts:183`
**Issue:** `POST /login` caps the body at 4 KiB, while `validatePassword` (`src/password.ts:35-41`) and the
`admin-password` script accept up to 1024 code points. Browsers send the form as `application/x-www-form-urlencoded`,
so each non-ASCII code point grows to 6-12 bytes. Any password of about 680 or more accented code points, or about 340
or more emoji, gets 413. The admin can set that password but can never log in with it. Plan 01-05 turned the 413 into
an HTML page ("Pedido grande demais" with a link back to the login), but the page still says nothing about the
password's length, so the admin has no hint of the cause.
**Fix:** Derive the limit from the policy, for example `MAX_PASSWORD_LENGTH * 12 + 256`. Another option is to bound the
password in UTF-8 bytes so that the largest valid password always fits once encoded. Add a test that logs in with a
maximum-length password made of multi-byte characters.

## Info

### IN-01: parseHash accepts scrypt parameters whose memory exceeds SCRYPT_MAXMEM (carried forward, not re-reviewed)

**File:** `src/password.ts:55-58`
**Issue:** `parseHash` accepts N up to 2^20 and r up to 16, but `128·N·r` can exceed the 256 MiB `maxmem`. With such a
hash, the panel notice says the panel is on, yet every login fails. Only a hand-edited hash can have these parameters.
**Fix:** Reject any hash with `128 * N * r > SCRYPT_MAXMEM` in `parseHash`.

### IN-02: Throttle cap evicts by insertion order, including in-flight or blocked entries (carried forward, not re-reviewed)

**File:** `src/session.ts:109-112`
**Issue:** When the map is full, the oldest inserted key is evicted, even if it is in flight or blocked. The address
then loses its delay and its single-attempt guarantee. Exploiting this needs 10,000 or more distinct addresses within
the prune window.
**Fix:** Prefer to evict entries that are idle and unblocked, or refresh an entry's position on each failure (LRU).

### IN-03: admin-password rewrites .env in place, not atomically (carried forward, not re-reviewed)

**File:** `scripts/admin-password.mjs:86-87`
**Issue:** `writeFileSync` truncates `.env`, which also holds the certificate and API secrets, and then rewrites it. If
the write is interrupted, the file can be left truncated.
**Fix:** Write `.env.tmp` with mode `0o600`, then `renameSync` it over `.env`.

### IN-04: The page-wide markup test's "correct password" entry is really a 429 page

**File:** `src/admin.test.ts:358-359`
**Issue:** The `bodies` list in "allows only Pico from jsDelivr ... on every page" posts a wrong password and then the
correct password from `198.51.100.30`. A successful login is a 303 with an empty body, so `toContain('<html')` passes
only because the earlier failure blocks the address and the second post gets the 429 login page. The test does not
assert the status. The 429 page is covered only by coincidence, and the line reads as if it covered the success path.
If the throttle stops blocking after the first failure (or a later test resets state), this entry becomes a 303. The
test would then fail with a confusing `<html` assertion, or, if the assertion is relaxed, the 429 page would silently
drop out of the markup check.
**Fix:** Make the intent explicit. Assert the status (`expect(res.status).toBe(429)`), or generate the 429 page
directly, with a comment that it is the throttle notice.

---

_Reviewed: 2026-11-20T21:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
