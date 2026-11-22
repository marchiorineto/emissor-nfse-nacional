---
phase: 03-nota-actions
reviewed: 2026-11-22T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - src/notas.ts
  - src/admin.ts
  - src/panel/api.js
  - src/panel/api.d.ts
  - src/panel/dom.js
  - src/panel/emitir.js
  - src/panel/form.js
  - src/panel/form.d.ts
  - src/panel/format.js
  - src/panel/format.d.ts
  - src/panel/panel.js
  - scripts/panel-smoke.mjs
  - src/admin.test.ts
  - src/app.test.ts
  - src/notas.test.ts
  - src/panel/api.test.ts
  - src/panel/form.test.ts
  - src/panel/format.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
  necessity: 1
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-11-22
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Reviewed the Phase 3 diff (`4d43bba..HEAD`) for the issue form, cancel, Duplicar, Tentar de novo and the per-id lock in `src/notas.ts`. No fallow structural findings were provided. The project has no CLAUDE.md.

The core invariant holds for the paths this phase adds. Every write from the panel goes through `POST /v1/notas` or `POST /v1/notas/:id/cancel`, and both run inside `serialized(repo, id, ...)`, so concurrent submits of one id issue one DPS. The lock map is keyed by repo, which is shared across the per-request `createNotas`. A failed call does not poison the chain, and entries are released. Tentar de novo resends the stored request under the same id, and the server asks the government (`findIssued`) before resending an `unknown` nota, so it cannot double-issue. `retryBody` correctly drops the redundant `accessKey` that `parseIssueRequest` would reject. CSRF is enforced on every non-GET cookie-authenticated `/v1` call. All API strings reach the DOM through `textContent`.

The remaining concerns are the replacement path (the lock only covers the id being issued, not the nota being replaced), silent truncation of fiscal text on the Duplicar path, and a few small robustness and dead-code items.

## Warnings

### WR-01: Replacement path touches the replaced nota outside that nota's lock

**File:** `src/notas.ts:195-207` (also `src/notas.ts:245-262`, `src/notas.ts:264-286`)
**Issue:** `issue(A)` with `replaces.id = B` runs under A's lock only. `resolveReplacement` reads B (line 195) and `markReplaced` reads and writes B (lines 205-206) with no hold on B's chain. Two consequences:
1. Lost update against `cancel(B)`. `cancel(B)` holds B's lock and reads B as `issued` before awaiting the government (line 266 to 278). Meanwhile `markReplaced` saves B as `replaced` (line 206). When the cancel resolves it saves `{...nota (stale, issued), status: 'canceled'}` (line 280), which overwrites `replaced` and drops `replacedBy`. The reverse interleaving can overwrite `canceled` with `replaced`. Either way the local record disagrees with the government.
2. Two different sale ids that both replace B (a double click on two tabs, or two API clients) both pass the `old.status === 'issued'` check and each send a replacement DPS carrying B's access key. The lock only serializes calls for the same id, so the "never issued twice" guarantee is not enforced for replacements. The government is the only thing that would reject the second one.

**Fix:** Take both locks, in a fixed order to avoid deadlock, whenever `replaces.id` is set. Alternatively make `markReplaced` re-read B and update it inside `serialized(repo, oldId, ...)`, and have `resolveReplacement` plus the check run under B's lock too. Sketch:
```ts
const markReplaced = (nota: Nota): Promise<Nota> => {
  const oldId = nota.request.replaces?.id
  if (nota.status !== 'issued' || !oldId) return Promise.resolve(nota)
  return serialized(repo, oldId, async () => {
    const old = await repo.get(oldId)
    if (old?.status === 'issued') await save(old, { status: 'replaced', replacedBy: nota.id })
    return nota
  })
}
```
This is safe from deadlock because `markReplaced` is called after A's `serialized` body has done its work only if it is moved outside A's lock. Do not nest B's lock inside A's lock without an ordering rule. Add a test with `cancel(B)` racing `issue(A replaces B)`.

### WR-02: Duplicar and ?de= prefill bypass every length limit, so fiscal text is cut silently

**File:** `src/panel/form.js:414-434` (`validateForm`), `src/panel/form.js:495-506` (`prefillFromNota`), `src/panel/emitir.js:168`
**Issue:** The `maxlength` attributes (id 200, name 300, email 80, description 2000) are the only guard against `buildDps` cutting text silently (`src/dps.ts:141,205` slice to the limit). A `maxlength` attribute does not apply to values set from script. `prefillFromNota` copies `description`, `taker.name` and `taker.email` from a stored request, which may have been created through the API with longer values, and `validateForm` has no length checks. The duplicate is then submitted and the DPS carries a truncated description or name. That is a fiscal document with altered content, and the user is never told. The comment on `emitirPage` says these are "the lengths the DPS builder would otherwise cut silently", but the client does not enforce them on this path.
**Fix:** Check the same limits in `validateForm`, so every path shares them:
```js
if (fields.description.trim().length > 2000) problems.description = MESSAGES.descriptionLong
if (fields.name.trim().length > 300) problems.name = MESSAGES.nameLong
if (fields.email.trim().length > 80) problems.email = MESSAGES.emailLong
```
Better still, reject over-limit values in `parseIssueRequest` so the API cannot create or accept them either.

### WR-03: Prefill from ?de= overwrites what the user types while the source loads, and submit is only guarded by the disabled button

**File:** `src/panel/emitir.js:161-181`, `src/panel/emitir.js:218-220`
**Issue:** `loadSource` disables the submit button but leaves every field editable, then writes all prefilled fields once the fetch resolves, so anything typed in the meantime is lost. The submit guard relies on `submit.disabled`, not on `sending` (`sending` is only set inside the submit handler). A programmatic or assistive-technology `form.requestSubmit()` during the load is not blocked and would post a half-filled form under the new id. Given the core value, a form that can submit while its source is still loading should be closed off explicitly.
**Fix:** In the submit handler, return early while the source is loading (a `loadingSource` flag set in `loadSource` and cleared in `finally`). Set the fields `disabled` or `readOnly` during the load, or only fill fields that are still empty.

## Info

### IN-01: `?de=` with a blank value skips service defaults and loads nothing

**File:** `src/panel/emitir.js:149` and `src/panel/emitir.js:302-303`
**Issue:** `new URLSearchParams(location.search).has('de')` is true for `?de=` or `?de=%20`, so the remembered service defaults are not applied (line 149). The source load is skipped for a blank value (line 303). The result is an empty service section with no message.
**Fix:** Use the same predicate in both places, for example `const source = params.get('de')?.trim() ?? ''` and test `source !== ''`.

### IN-02: `state` parameter in `confirmCancel` shadows the module-level `state`

**File:** `src/panel/panel.js:187` (destructured `state`) versus `src/panel/panel.js:34`
**Issue:** `confirmCancel` destructures a `state` that is the cancel section's status paragraph, while the module-level `state` is the list status line (used by `say`). It works today, but anyone who adds a `say(...)` call or a reference to the list line inside `confirmCancel` will target the wrong element.
**Fix:** Rename the parameter, for example `cancelState`, and update the call at line 295.

### IN-03: Redundant session check in `GET /admin/emitir`

**File:** `src/admin.ts:564-567`
**Category:** necessity
**Issue:** The `app.use('/admin/*', ...)` guard (lines 535-538) already redirects any request without a session before this handler runs, so the `if (!session) return c.redirect('/login', 303)` branch at line 566 cannot be reached. `GET /admin` does need its own check because `/admin/*` does not match the bare `/admin`; the new route copied that pattern. The session read itself is still needed for the CSRF token, so only the unreachable branch is dead. The evidence is the registration order in this file and the `app.use('/admin/*', ...)` pattern.
**Fix:** Keep the single `sessionOf` call and assert the result instead of branching, or leave a comment that the guard owns the redirect. For example `const session = sessionOf(getCookie(c, SESSION_COOKIE))!`.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
