---
status: testing
phase: 01-admin-password-and-login
source: [01-VERIFICATION.md]
started: 2026-11-20T20:35:00Z
updated: 2026-11-20T20:29:30Z
---

## Current Test

number: 3
name: Pico, SRI and CSP work in a real browser
expected: |
  `/login` and `/admin` render styled with Pico; the console shows no SRI or CSP errors; the Network tab shows requests only to the app's own origin and cdn.jsdelivr.net.
awaiting: user response

## Tests

### 1. Password prompts do not echo in a real terminal (PASS-01)
expected: Running `pnpm run admin-password` in a real terminal shows neither typed password on screen (both prompts), then prints the two pt-BR confirmation lines, and `.env` holds an `ADMIN_PASSWORD=scrypt$...` hash, never the plaintext.
result: pass

### 2. Session cookie carries the Secure flag over real HTTPS (AUTH-04)
expected: Behind an HTTPS proxy (or with `PUBLIC_URL=https://...`), after logging in, browser devtools show the `nfse_admin` cookie with HttpOnly, Secure, SameSite=Strict and a 12 h lifetime.
result: pass

### 3. Pico, SRI and CSP work in a real browser
expected: `/login` and `/admin` render styled with Pico; the console shows no SRI or CSP errors; the Network tab shows requests only to the app's own origin and cdn.jsdelivr.net.
result: [pending]

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
