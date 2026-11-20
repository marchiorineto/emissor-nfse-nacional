---
phase: 01-admin-password-and-login
reviewed: 2026-11-20T21:50:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/admin.ts
  - src/admin.test.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
  necessity: 0
status: issues_found
---

# Phase 01: Code Review Report (change 62c8cce, G-01-4 centered card)

**Reviewed:** 2026-11-20T21:50:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Scope: the diff from 549fa34 to HEAD in `src/admin.ts` and `src/admin.test.ts`. That covers the same-origin `/panel.css` route behind `pageHeaders`, `style-src 'self'` in `PAGE_CSP`, and the login and refusal pages wrapped in `<main data-card><article>`. No `CLAUDE.md` exists in the repo and no project skills were consulted. Fallow structural findings were not supplied. The necessity lens was not applied: the standard-depth reference file was not read for this focused re-review, so no `necessity:` findings are claimed beyond `0`.

I found no correctness or security defects in the change. `src/admin.test.ts` passes: 33 of 33 tests.

- **Route and headers:**
  - `app.use('/panel.css', pageHeaders)` is registered before the GET handler, so the CSS response gets CSP, no-store, no-referrer and nosniff.
  - `Content-Type: text/css; charset=utf-8` together with nosniff is correct for a stylesheet.
  - With the panel off the route does not exist, and the existing 404 test now covers it.
- **CSP widening:**
  - `style-src 'self'` trusts only same-origin stylesheets.
  - There is no HTML-injection sink in the panel: `html` escapes every interpolation, and only fixed strings reach `refusalPage`.
  - The only same-origin CSS is the static `PANEL_CSS` constant, which has no interpolation.
  - The widening is therefore not exploitable today.
- **Pico interplay:**
  - The `main[data-card]` selectors have specificity (0,1,1), which beats Pico's `body > main` at (0,0,2), so the overrides apply.
  - The admin page uses a plain `<main id="notas">`, so it is unaffected.
- **Markup:** `<main data-card>` adds no `class` or `style` attribute, so the existing no-class and no-style assertions still hold.

The remaining items are test-strength and asset-delivery quality issues.

## Warnings

### WR-01: /panel.css test claims "the panel headers" but asserts only nosniff

**File:** `src/admin.test.ts:379-385`
**Issue:** The test "serves /panel.css from this origin as text/css with the panel headers" checks status, content-type, `x-content-type-options` and the body. It never checks `Cache-Control`, `Content-Security-Policy` or `Referrer-Policy` on the stylesheet response. The `expectHeaders` helper in the same `describe` block (line 315) already asserts all four headers but is not used for this route. If `app.use('/panel.css', pageHeaders)` were narrowed or its header set changed, this test would still pass. The "headers on every panel response" guarantee that the earlier tests enforce for the HTML routes is therefore unenforced for the one new route. The title overstates what is verified.
**Fix:**
```ts
const res = await setup().request('http://api.test/panel.css')
expect(res.status).toBe(200)
expect(res.headers.get('content-type')).toBe('text/css; charset=utf-8')
expectHeaders(res)
expect(await res.text()).toBe(PANEL_CSS)
```

## Info

### IN-01: Card test checks CSS source text and only two of the pages that now use the card

**File:** `src/admin.test.ts:388-395`
**Issue:**
- The test matches regexes against the `PANEL_CSS` source string, for example `/main\[data-card\] \{[^}]*place-items: center/`. A harmless reformat (property order, a comment containing `}`, a split selector) breaks it, and it proves nothing about rendering. This is acceptable for a no-browser test setup, but it is brittle.
- Markup coverage is only `/login` and the cross-site 403 refusal. The 401 and 429 re-renders of `loginPage`, the 413 refusal and the logout-CSRF 403 refusal also use the card. The 413 and logout cases are only checked for headers and text elsewhere. A regression that reverted `refusalPage` for those branches would go unnoticed.

**Fix:** Loop the `<main data-card>` assertion over all card-rendering responses, namely the 401 login (`login(app, 'wrong password 12')`), the 413 refusal and the logout 403 refusal (`logout(app, { cookie }, 'wrong')`). Optionally assert the presence of the `main[data-card]` selector rather than exact property text.

### IN-02: Static stylesheet is served `Cache-Control: no-store`

**File:** `src/admin.ts:202-209, 220-222`
**Issue:** `/panel.css` is routed through `pageHeaders`, so the browser refetches an unchanging, secret-free constant on every page view. This is consistent with the existing "every panel response is no-store" rule and with the test, so it is not a bug. It does mean the deliberate blanket policy now covers an asset that carries no session data, so the behavior is worth a conscious decision. Without a cache header the page also briefly renders unstyled while the stylesheet reloads on each navigation, for example login to /admin and back. The quick fix is to give the CSS route a short `Cache-Control: public, max-age=300` instead of no-store, and to relax `expectHeaders` for that route. Keeping no-store is also defensible. Treat this as a judgment call, not a defect.
**Fix:** Either keep as is and note the decision in the `pageHeaders` doc comment, or serve `/panel.css` with its own cache header and drop it from `app.use('/panel.css', pageHeaders)` while still setting CSP, nosniff and Referrer-Policy.

---

_Reviewed: 2026-11-20T21:50:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
