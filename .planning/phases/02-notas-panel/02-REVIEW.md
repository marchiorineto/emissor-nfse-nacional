---
phase: 02-notas-panel
reviewed: 2026-11-20T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/admin.ts
  - src/app.ts
  - src/notas.ts
  - src/repo.ts
  - src/panel/panel.js
  - src/panel/format.js
  - src/panel/format.d.ts
  - scripts/panel-smoke.mjs
  - src/admin.test.ts
  - src/app.test.ts
  - src/appSession.test.ts
  - src/repo.test.ts
  - src/panel/format.test.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
  necessity: 1
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-11-20
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

I reviewed the notas panel: the admin page and its CSP, the session-or-bearer `requireAuth`, the cursor paging in `repo.list` (SQLite and the in-memory twin), the browser modules, and the Chrome smoke script. The tests were read for reliability only.

The security-sensitive parts hold up. Every API string reaches the DOM through `textContent`. Links in the dialog are built from fixed prefixes. The cookie path demands a CSRF token on every method except GET and HEAD. The cursor SQL is parameterized, and its parameter order matches the placeholders in all three cursor shapes. The session guard covers the panel scripts. I found no critical issues.

The remaining findings are a latent bug in the smoke script and a status list kept in several places without a compile-time link.

## Warnings

### WR-01: Smoke script kills a healthy run after 20 s and reports "cannot start Chrome"

**File:** `scripts/panel-smoke.mjs:208-227`
**Issue:** The Chrome start-up promise arms `setTimeout(fail, 20_000).unref()` and never clears it when the DevTools line arrives. The timer is only unref'd, which does not cancel it. `fail` calls `finish(2)` unconditionally. Any run that is still going 20 s after Chrome started, which is plausible on a slow CI box or with the many `waitFor` polls (the global limit is 90 s), is therefore killed. It prints "cannot start Chrome (set CHROME)" and exits 2, a misleading diagnosis. The same applies to `chrome.on('exit', fail)`, which stays registered for the whole run, so a Chrome crash mid-run is also reported as a start failure. The `finished` guard only protects the normal exit path.
**Fix:** Keep the handle and clear it on success. Detach the exit handler once started, or make it report a crash.
```js
const wsUrl = await new Promise((resolve) => {
  const fail = () => { console.log('panel-smoke: cannot start Chrome (set CHROME)'); finish(2) }
  chrome = spawn(...)
  const timer = setTimeout(fail, 20_000)
  chrome.on('error', fail)
  chrome.once('exit', fail)
  let seen = ''
  chrome.stderr.on('data', (chunk) => {
    seen += chunk
    const match = /DevTools listening on (ws:\/\/\S+)/.exec(seen)
    if (match) {
      clearTimeout(timer)
      chrome.off('exit', fail)
      chrome.once('exit', () => { console.log('panel-smoke: Chrome exited during the run'); finish(1) })
      resolve(match[1])
    }
  })
})
```

### WR-02: Status list is kept in three places with no compile-time link

**File:** `src/panel/format.js:7`, `src/app.ts:24`, `src/panel/format.d.ts:11`
**Issue:** `NotaStatus` (notas.ts), `NOTA_STATUSES` (app.ts, a different order), and `STATUS_ORDER` plus `STATUS_LABELS` (format.js) must stay in sync by hand. `format.js` is untyped JavaScript, so `format.d.ts` only claims `readonly NotaStatus[]` and `tsc` never checks it. Adding a status later would not fail the typecheck, and the panel would quietly misbehave:
- The filter would not offer the new status.
- `parseStatus` would reject `?status=<new>` and fall back to Todas.
- The row label would show the raw English value.
- `isAlertStatus` and the CSS emphasis would not apply.

**Fix:** Add a test that fails when they drift (cheap, and it fits the existing vitest setup). For example, assert that `STATUS_ORDER` sorted equals `NOTA_STATUSES` sorted, and that `statusLabel(s) !== s` for each. Or export `NOTA_STATUSES` once and build the panel list from it.

## Info

### IN-01: `<meta name="csrf-token">` is emitted but nothing in the panel reads it

**File:** `src/admin.ts:228`
**Category:** necessity
**Issue:** `panel.js` is read-only in this phase: it only issues GETs through `api()` and never sets `X-CSRF-Token`. `grep -rn csrf src/panel/*.js` finds nothing. The meta tag exists only because tests assert it (`admin.test.ts:67`, `appSession.test.ts:61`), so it is a requirement that no code in this phase uses. This rests on judgment: it is plausibly groundwork for a later write phase (issue or cancel from the panel), so it is Info, not a Warning.
**Fix:** Keep it if the next phase will use it, and note in the comment that it is currently unused. Otherwise remove it and the tests that assert it.

### IN-02: Third copy of the CNPJ formatter

**File:** `src/admin.ts:210`
**Issue:** `formatCnpj` repeats the regex of `formatTaxId` in `panel/format.js`, which `admin.ts` already imports from, and of a private `formatCnpj` in `src/danfse.ts:35`.
**Fix:** Import `formatTaxId` from `./panel/format.js` (it handles 14 digits identically) and drop the duplicate. If the export is still needed for tests, re-export it.

### IN-03: Back button appears to do nothing after closing the details dialog

**File:** `src/panel/panel.js:247-252`
**Issue:** Clicking a Número link pushes a `#nota=<id>` history entry. Closing the dialog then calls `history.replaceState` to strip the hash from that same entry. The history is now `[list, list]` with the same URL, so the first Back press changes nothing visible (no hashchange, no navigation) and a second press is needed to leave. This is a UX defect rather than a correctness bug.
**Fix:** On a close that started from the hash being present, call `history.back()` when the previous entry is the list, or have the close handler `history.back()` when the dialog was opened by a push. Alternatively, open the dialog with `history.replaceState` so no extra entry exists.

### IN-04: `before` and `beforeId` reach the repository unvalidated

**File:** `src/app.ts:142`
**Issue:** `before` is a free string compared against `created_at`, and `beforeId` is a free string. SQL injection is not possible because both are bound parameters. A malformed `before` (for example `before=x`) silently returns either nothing or everything, depending on text ordering, rather than a 400. A value-less `beforeId=` or `before=` is dropped by the `Boolean` filter in `repo.ts:70` and returns page one, which can make a buggy client loop. The `status` parameter is validated, but these two are not.
**Fix:** Reject a `before` that does not parse as an ISO instant (`Number.isNaN(Date.parse(before))`), and reject `beforeId` given without `before`, with a 400 in the same style as the `status` check.

---

_Reviewed: 2026-11-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
