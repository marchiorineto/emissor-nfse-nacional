---
phase: 01-admin-password-and-login
plan: 06
subsystem: ui
tags: [pico-css, csp, gap-closure]

requires:
  - phase: 01-admin-password-and-login
    provides: "Plan 01-05 classless Pico pages"
provides:
  - "Same-origin /panel.css with the panel's own rules"
  - "Login and refusal pages as a narrow centered card"
affects: [phase-2-notas-list]

actuals:
  tasks: 3
  commits: 1

plan_head_before: 549fa34
plan_head_after: 62c8cce

key-files:
  created: []
  modified:
    - src/admin.ts
    - src/admin.test.ts

key-decisions:
  - "Same-origin stylesheet route plus style-src 'self' instead of inline styles or CSP hashes"
  - "data-card attribute on main selects the card layout; pages still carry no class or style attributes"
  - "/admin keeps Pico's full-width container"
---

# Plan 01-06 Summary

**Closes UAT gap G-01-4: /login and refusal pages now show a 24rem card centered on the screen, styled by a small
same-origin `/panel.css` allowed through `style-src 'self'`.**

Done inline during `/gsd-verify-work 01` (commit 62c8cce). 199 tests pass, typecheck clean, checked in Chromium at
desktop light/dark and phone width; the user confirmed it on their desktop (UAT test 5: pass).
