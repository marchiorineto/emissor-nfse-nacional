---
phase: "1"
slug: "admin-password-and-login"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-20"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^5.1.0 (installed) |
| **Config file** | none — defaults pick up `src/**/*.test.ts` |
| **Quick run command** | `pnpm exec vitest run src/password.test.ts src/session.test.ts src/admin.test.ts src/app.test.ts` |
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
| TBD | TBD | TBD | PASS-01..03 | — | Hash only in `.env`, other lines kept, mode 0600, invalid input leaves `.env` byte-identical | integration | `pnpm exec vitest run src/adminPasswordScript.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PASS-04 | — | Cookie signed under old hash refused after hash change | unit/app | `pnpm exec vitest run src/admin.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-01 | — | Empty `ADMIN_PASSWORD`: admin routes 404, cookie ignored on `/v1` | app | `pnpm exec vitest run src/admin.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-02, AUTH-03 | — | Login 303 to `/admin`; wrong password "Senha incorreta." only; per-IP backoff 429 + Retry-After | session + app | `pnpm exec vitest run src/session.test.ts src/admin.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-04, AUTH-05 | — | Cookie flags + 12 h expiry; CSRF required on cookie POSTs; Bearer unchanged | app | `pnpm exec vitest run src/admin.test.ts src/app.test.ts` | partial | ⬜ pending |
| TBD | TBD | TBD | AUTH-06 | — | Logout clears cookie; `/admin` without session redirects to `/login` | app | `pnpm exec vitest run src/admin.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/password.test.ts` — hash format, round trip, wrong password, malformed hash returns false, `validatePassword` cases
- [ ] `src/session.test.ts` — sign/verify/tamper/expiry/key change, CSRF derivation, throttle curve and pruning
- [ ] `src/admin.test.ts` — all `app.request` flows for AUTH-01..06 and PASS-04
- [ ] `src/adminPasswordScript.test.ts` — tmp-dir copy of the script, piped stdin, exit code, file bytes, mode

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Password not echoed while typing | PASS-01 | Needs a real TTY | Run `pnpm run admin-password` in a terminal; confirm no characters appear |
| Pico.css styling loads with SRI | AUTH-02 | Needs a browser | Open `/login` and `/admin`; confirm styled page and no SRI error in console |
| Secure cookie flag over HTTPS | AUTH-04 | Needs real HTTPS / proxy | Log in over HTTPS; check cookie flags in devtools |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
