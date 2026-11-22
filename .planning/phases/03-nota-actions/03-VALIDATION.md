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

Task-level map (from the PLAN.md files; the smoke command is `node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs`):

| Task | Req | Decisions | Automated commands | Smoke checks added | Status |
|------|-----|-----------|--------------------|--------------------|--------|
| 03-01 T1 (tracer) | ACT-01 | D-18 | `pnpm exec vitest run src/app.test.ts src/notas.test.ts src/appSession.test.ts`; `pnpm run typecheck` | — | ⬜ pending |
| 03-01 T2 | ACT-01, ACT-02 | D-18 | `pnpm exec vitest run src/notas.test.ts src/app.test.ts`; `pnpm test`; `pnpm run typecheck` | — | ⬜ pending |
| 03-02 T1 (tracer) | ACT-01 | D-01, D-02, D-03, D-05, D-06, D-07, D-08 | smoke; `pnpm exec vitest run src/admin.test.ts src/panel/format.test.ts`; `pnpm run typecheck` | emitir-issue | ⬜ pending |
| 03-02 T2 | ACT-01 | D-03, D-04, D-05, D-06, D-09 | `pnpm exec vitest run src/panel/form.test.ts`; `pnpm run typecheck` | — | ⬜ pending |
| 03-02 T3 | ACT-01 | D-01, D-02 | `pnpm exec vitest run src/panel/api.test.ts src/admin.test.ts`; `pnpm test`; `pnpm run typecheck` | — | ⬜ pending |
| 03-03 T1 (tracer) | ACT-01 | D-08 | smoke; `pnpm exec vitest run src/admin.test.ts src/panel` | emitir-rejected | ⬜ pending |
| 03-03 T2 | ACT-01 | D-09, D-11 | `pnpm exec vitest run src/panel/format.test.ts src/panel/form.test.ts`; `pnpm run typecheck`; smoke | dialog-already-issued, dialog-rejected-hint | ⬜ pending |
| 03-03 T3 | ACT-01 | D-02, D-04, D-08, D-09 | smoke; `pnpm test`; `pnpm run typecheck` | emitir-validation, emitir-answers, emitir-session-expired, emitir-double-click, emitir-two-tabs, emitir-resubmit, emitir-defaults, emitir-narrow | ⬜ pending |
| 03-04 T1 (tracer) | ACT-02 | D-11, D-12, D-13, D-14 | smoke; `pnpm exec vitest run src/admin.test.ts src/panel` | cancel-row | ⬜ pending |
| 03-04 T2 | ACT-02 | D-12, D-13, D-14 | `pnpm exec vitest run src/panel/format.test.ts`; `pnpm run typecheck`; smoke | cancel-nothing-sent, cancel-answers, cancel-double-click | ⬜ pending |
| 03-04 T3 | ACT-02 | D-13, D-14, D-19 | smoke; `pnpm test`; `pnpm run typecheck` | cancel-filtered, cancel-left-dialog, cancel-backdrop-drag, cancel-style | ⬜ pending |
| 03-05 T1 (tracer) | ACT-03 | D-15, D-16, D-17 | smoke; `pnpm exec vitest run src/panel src/admin.test.ts` | duplicate-row | ⬜ pending |
| 03-05 T2 | ACT-01, ACT-03 | D-10, D-16, D-19 | `pnpm exec vitest run src/panel/form.test.ts`; `pnpm run typecheck`; smoke | retry-pending-replaces, retry-unanswered, retry-unknown, retry-filtered | ⬜ pending |
| 03-05 T3 | ACT-03 | D-15, D-17 | smoke; `pnpm test`; `pnpm run typecheck` | duplicate-edges, duplicate-reload, row-actions-narrow | ⬜ pending |

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
