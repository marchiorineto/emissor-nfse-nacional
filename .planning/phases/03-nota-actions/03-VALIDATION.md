---
phase: "3"
slug: "nota-actions"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-21"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit/route) + headless-Chrome CDP script `scripts/panel-smoke.mjs` (browser behavior) |
| **Config file** | none (vitest defaults; `src/**/*.test.ts`) |
| **Quick run command** | `pnpm exec vitest run src/panel src/admin.test.ts src/notas.test.ts` |
| **Full suite command** | `pnpm test && pnpm run typecheck`; browser: `node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs` |
| **Estimated runtime** | ~30 seconds (smoke script excluded) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run src/panel src/admin.test.ts src/notas.test.ts`
- **After every plan wave:** Run `pnpm test && pnpm run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green, plus `scripts/panel-smoke.mjs` green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Filled in by the planner/executor from the PLAN.md task IDs. Requirement → test map from 03-RESEARCH.md § Validation Architecture:*

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| ACT-01 | `parseBrl`, `brasiliaToday`, `suggestId`, `validateForm`, `buildIssueBody`, `isAlreadyIssued` | unit | `pnpm exec vitest run src/panel/form.test.ts` | ❌ W0 | ⬜ pending |
| ACT-01 | `/admin/emitir` guarded, shell, headers, `emitir.js` served | route | `pnpm exec vitest run src/admin.test.ts` | ✅ extend | ⬜ pending |
| ACT-01 | Concurrent `issue` of one id sends once | unit | `pnpm exec vitest run src/notas.test.ts -t "concurrent"` | ❌ W0 | ⬜ pending |
| ACT-01 | Submit/CSRF/disabled button/422/400/401/403; reload keeps `?id=`; resubmit lands on details with notice | browser | `node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs` | ❌ extend | ⬜ pending |
| ACT-02 | `parseNotaHash` cancel flag, `reasonProblem`, `CANCEL_REASONS` | unit | `pnpm exec vitest run src/panel/format.test.ts` | ✅ extend | ⬜ pending |
| ACT-02 | Nothing sent before confirm; 200/422/502 handling; row link opens form | browser | smoke script | ❌ extend | ⬜ pending |
| ACT-02 (D-10) | `retryBody` strips `replaces.accessKey`; Tentar de novo refreshes dialog and row | unit + browser | `pnpm exec vitest run src/panel/form.test.ts`; smoke | ❌ W0 | ⬜ pending |
| ACT-03 | `prefillFromNota` carries/drops the right fields; `?de=` prefill, new id, separate nota | unit + browser | `pnpm exec vitest run src/panel/form.test.ts`; smoke | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/panel/form.test.ts` + `src/panel/form.d.ts` (and `.d.ts` for every `.js` a `.ts` test imports; no `allowJs`)
- [ ] `src/panel/api.test.ts` — fake `fetch`, headers, 401 redirect, HTML-body tolerance
- [ ] Concurrency regression test in `src/notas.test.ts` (delayed gov stub; one `sendDps`)
- [ ] `scripts/panel-smoke.mjs` — programmable gov stub + POST-body recorder; update the assertions listed in RESEARCH Pitfall 9

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual fit of up to three row actions on desktop and stacked mobile cards; danger styling of "Confirmar cancelamento" | ACT-02, ACT-03 | Visual judgment (Pico classless widths, assumption A3) | Review smoke screenshots at desktop and phone widths |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
