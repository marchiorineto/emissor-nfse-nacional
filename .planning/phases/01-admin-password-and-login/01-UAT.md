---
status: diagnosed
phase: 01-admin-password-and-login
source: [01-VERIFICATION.md]
started: 2026-11-20T20:35:00Z
updated: 2026-11-20T21:15:17.000Z
---

## Current Test

[testing complete]

## Tests

### 1. Password prompts do not echo in a real terminal (PASS-01)
expected: Running `pnpm run admin-password` in a real terminal shows neither typed password on screen (both prompts), then prints the two pt-BR confirmation lines, and `.env` holds an `ADMIN_PASSWORD=scrypt$...` hash, never the plaintext.
result: pass

### 2. Session cookie carries the Secure flag over real HTTPS (AUTH-04)
expected: Behind an HTTPS proxy (or with `PUBLIC_URL=https://...`), after logging in, browser devtools show the `nfse_admin` cookie with HttpOnly, Secure, SameSite=Strict and a 12 h lifetime.
result: pass

### 3. Pico, SRI and CSP work in a real browser
expected: `/login` and `/admin` render styled with Pico; the console shows no SRI or CSP errors; the Network tab shows requests only to the app's own origin and cdn.jsdelivr.net.
result: issue
reported: "styled but ugly, no console errors"
severity: cosmetic

### 4. Re-run UAT test 3 in a real browser after gap fix G-01-3
expected: With ADMIN_PASSWORD set and `pnpm start`, at http://localhost:8080/login (light and dark OS scheme, desktop and a narrow window): content is centered with side gutters, not flush to the edges; a wrong password gives the field a red border with 'Senha incorreta.' in red under it; /admin has a nav header with a compact 'Sair' button on the right; the Produção and Homologação badges look different; the console shows no SRI or CSP error; the Network tab shows requests only to the app origin and cdn.jsdelivr.net; the page no longer looks 'ugly'
result: [pending]

## Summary

total: 4
passed: 2
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps

- gap_id: G-01-3
  truth: "`/login` and `/admin` render styled with Pico; the console shows no SRI or CSP errors; the Network tab shows requests only to the app's own origin and cdn.jsdelivr.net."
  status: failed
  reason: "User reported: styled but ugly, no console errors"
  severity: cosmetic
  test: 3
  root_cause: "Pages load the class-based pico.min.css without a .container, so body>header/main get no horizontal gutters or max-width (content flush to viewport edges, 1440 px-wide inputs on desktop); the logout submit button inherits Pico's width:100% and dominates the /admin header; production and homologação badges share the same <mark> style; the login error is unstyled (no aria-invalid/<small>); 403/413/CSRF refusals are bare text/plain pages. All documented in 01-UI-REVIEW.md (Spacing 2/4, Visuals 2/4) and not yet fixed."
  artifacts:
    - path: "src/admin.ts"
      issue: "PICO_CSS_URL (line 21) points to class-based pico.min.css; layout has no container"
    - path: "src/admin.ts"
      issue: "/admin header (lines 85-91) renders Sair as full-width submit button"
    - path: "src/admin.ts"
      issue: "environment badge (line 87) identical for produção and homologação"
    - path: "src/admin.ts"
      issue: "login error (lines 73-75) not tied to input via aria-invalid/aria-describedby; refusals (lines 144,145,189) are text/plain dead ends"
  missing:
    - "Switch to Pico classless build (css/pico.classless.min.css) with its own SRI hash; update tests asserting PICO_CSS_URL/SRI"
    - "Put /admin header in a Pico <nav> so Sair takes content width on the right"
    - "Give produção a visually distinct badge from homologação"
    - "Mark invalid password field with aria-invalid + <small id=login-error> described-by"
    - "Render 403/413/CSRF refusals as minimal pages with a link back to /login or /admin"
  debug_session: ".planning/phases/01-admin-password-and-login/01-UI-REVIEW.md"
