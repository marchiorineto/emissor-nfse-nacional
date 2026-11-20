---
phase: "1"
slug: "admin-password-and-login"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-20"
audited: "2026-11-20"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^5.1.0 (installed) |
| **Config file** | none — defaults pick up `src/**/*.test.ts` |
| **Quick run command** | `pnpm exec vitest run src/password.test.ts src/adminPasswordScript.test.ts src/session.test.ts src/admin.test.ts src/appSession.test.ts src/app.test.ts` |
| **Full suite command** | `pnpm test && pnpm run typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run `pnpm test && pnpm run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled in by the planner and executor. Requirement-to-test seed, from 01-RESEARCH.md § Validation Architecture:

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01-01 | 1 | PASS-01, PASS-03 | T-01-01 | Piped entries produce a verifiable `scrypt:65536:8:2:...` hash in `.env` | integration (tracer) | `pnpm exec vitest run src/adminPasswordScript.test.ts` | ✅ | ✅ green |
| 01-01-T2 | 01-01 | 1 | PASS-02 | T-01-04, T-01-05 | Code-point length, NFKC, malformed hashes return false, async scrypt | unit | `pnpm exec vitest run src/password.test.ts` | ✅ | ✅ green |
| 01-01-T3 | 01-01 | 1 | PASS-01..04 (script) | T-01-01, T-01-02, T-01-03, T-01-06 | Invalid input leaves `.env` byte-identical; other lines, order, CRLF kept; duplicates rewritten; mode 0600; no plaintext | integration | `pnpm exec vitest run src/adminPasswordScript.test.ts src/password.test.ts` | ✅ | ✅ green |
| 01-02-T1 | 01-02 | 2 | AUTH-02, AUTH-03 (message) | T-01-09, T-01-11, T-01-12 | Login 303 to `/admin`, skeleton renders; wrong password 401 "Senha incorreta." | app (tracer) | `pnpm exec vitest run src/admin.test.ts src/app.test.ts` | ✅ | ✅ green |
| 01-02-T2 | 01-02 | 2 | AUTH-01, AUTH-06 | T-01-10, T-01-14, T-01-15 | Disabled panel 404; guard redirects; logout with CSRF clears cookie | app | `pnpm exec vitest run src/admin.test.ts` | ✅ | ✅ green |
| 01-02-T3 | 01-02 | 2 | AUTH-04, PASS-04 | T-01-07, T-01-08, T-01-16 | Cookie flags, Secure over HTTPS, 12 h boundary, key change, duplicate/empty cookies | unit + app | `pnpm exec vitest run src/session.test.ts src/admin.test.ts` | ✅ | ✅ green |
| 01-03-T1 | 01-03 | 3 | AUTH-03 | T-01-17 | Second attempt inside the delay: 429 + Retry-After without a password check | app (tracer) | `pnpm exec vitest run src/admin.test.ts` | ✅ | ✅ green |
| 01-03-T2 | 01-03 | 3 | AUTH-03 | T-01-17, T-01-19, T-01-20 | Curve 1..30 s, 10 min reset, in-flight serialization, pruning and cap, client address | unit + app | `pnpm exec vitest run src/session.test.ts src/admin.test.ts` | ✅ | ✅ green |
| 01-03-T3 | 01-03 | 3 | AUTH-02 (hardening) | T-01-21, T-01-22, T-01-23, T-01-24 | Cross-site login refused, 413 over 4 KB, CSP/no-store/no-referrer/nosniff | app | `pnpm exec vitest run src/admin.test.ts src/session.test.ts` | ✅ | ✅ green |
| 01-04-T1 | 01-04 | 3 | AUTH-05 | T-01-25 | Cookie alone reads `/v1/notas`; Bearer tests unchanged | app (tracer) | `pnpm exec vitest run src/appSession.test.ts src/app.test.ts` | ✅ | ✅ green |
| 01-04-T2 | 01-04 | 3 | AUTH-05, AUTH-01, PASS-04 | T-01-25..T-01-28 | CSRF 403 on cookie writes; Bearer priority; disabled panel ignores cookies; `app.routes` invariant | app | `pnpm exec vitest run src/appSession.test.ts src/app.test.ts` | ✅ | ✅ green |
| 01-04-T3 | 01-04 | 3 | (docs, startup) | T-01-30, T-01-31 | Startup notice of panel state; pt-BR README section | smoke + suite | `pnpm test` | n/a | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/password.test.ts` — hash format, round trip, wrong password, malformed hash returns false, `validatePassword` cases
- [x] `src/session.test.ts` — sign/verify/tamper/expiry/key change, CSRF derivation, throttle curve and pruning
- [x] `src/admin.test.ts` — all `app.request` flows for AUTH-01..04, AUTH-06 and PASS-04 on the pages
- [x] `src/appSession.test.ts` — `/v1` and `/health` through the cookie (AUTH-05, AUTH-01 and PASS-04 on `/v1`)
- [x] `src/adminPasswordScript.test.ts` — tmp-dir copy of the script, piped stdin, exit code, file bytes, mode

Under tracer-first planning each file is created by the first task that needs it (no separate Wave 0 plan); see the map above.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Password not echoed while typing | PASS-01 | Needs a real TTY | Run `pnpm run admin-password` in a terminal; confirm no characters appear |
| Pico.css styling loads with SRI | AUTH-02 | Needs a browser | Open `/login` and `/admin`; confirm styled page and no SRI error in console |
| Secure cookie flag over HTTPS | AUTH-04 | Needs real HTTPS / proxy | Log in over HTTPS; check cookie flags in devtools |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-20

---

## Requirement Coverage (audit 2026-11-20)

| Requirement | Test file(s) | Status |
|-------------|--------------|--------|
| PASS-01 | `src/adminPasswordScript.test.ts` (piped entries, hash written, restart notice); no-echo is manual-only | COVERED |
| PASS-02 | `src/adminPasswordScript.test.ts` (differ, empty, 11 chars, no .env created), `src/password.test.ts` (`validatePassword`) | COVERED |
| PASS-03 | `src/adminPasswordScript.test.ts` (from .env.example, other lines/CRLF kept, mode 0600, no plaintext), `src/password.test.ts` | COVERED |
| PASS-04 | `src/adminPasswordScript.test.ts` (second run), `src/admin.test.ts` + `src/appSession.test.ts` (cookie under another hash refused) | COVERED |
| AUTH-01 | `src/admin.test.ts` (404 when off, whitespace-only), `src/appSession.test.ts` (panel off ignores cookies, Bearer kept) | COVERED |
| AUTH-02 | `src/admin.test.ts` (login 303 → panel skeleton, cross-site refusal, 413, headers); Pico styling is manual-only | COVERED |
| AUTH-03 | `src/admin.test.ts` (401 "Senha incorreta.", 429 + Retry-After, parallel), `src/session.test.ts` (curve, reset, prune, cap, clientIp) | COVERED |
| AUTH-04 | `src/admin.test.ts` (HttpOnly, SameSite=Strict, Max-Age=43200, Secure only over HTTPS, 12 h boundary), `src/session.test.ts` | COVERED |
| AUTH-05 | `src/appSession.test.ts` (cookie reads, CSRF on writes, Bearer priority, CSRF invariant on every non-GET route) | COVERED |
| AUTH-06 | `src/admin.test.ts` (logout with CSRF, wrong CSRF 403, GET does not log out, guard redirect) | COVERED |

Evidence: `pnpm test`: 14 files, 191 passed, 1 skipped (2026-11-20).

## Validation Audit 2026-11-20

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
