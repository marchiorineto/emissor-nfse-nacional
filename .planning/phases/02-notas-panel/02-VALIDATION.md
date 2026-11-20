---
phase: "2"
slug: "notas-panel"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-20"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^5.1.0 (installed, Node environment) |
| **Config file** | none — defaults pick up `src/**/*.test.ts` |
| **Quick run command** | `pnpm exec vitest run src/admin.test.ts src/panel/format.test.ts src/repo.test.ts src/app.test.ts src/appSession.test.ts` |
| **Full suite command** | `pnpm test && pnpm run typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run `pnpm test && pnpm run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green and the headless-browser UAT checklist done
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Seeded from RESEARCH.md § Validation Architecture at requirement level. Task IDs are filled in once plans exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PANEL-01 | TBD | `/admin` has one module script, no `API_TOKEN` in page or script; script routes behind the session guard with `nosniff`, CSP, `no-store` | integration | `pnpm exec vitest run src/admin.test.ts` | ✅ file / ❌ W0 cases | ⬜ pending |
| TBD | TBD | TBD | PANEL-01 | TBD | `PAGE_CSP` adds only `connect-src 'self'` | unit | `pnpm exec vitest run src/admin.test.ts` | ✅ (update exact-string test) | ⬜ pending |
| TBD | TBD | TBD | PANEL-01 | — | N/A (formatters: currency, competence, Brasília fallback, CPF/CNPJ, taker, number, status) | unit | `pnpm exec vitest run src/panel/format.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PANEL-02 | — | `listQuery` always sends `limit=20`; unknown status rejected | unit | `pnpm exec vitest run src/panel/format.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PANEL-02 | TBD | Cursor `(created_at, id)` neither skips nor repeats; `limit=-1` capped | unit + integration | `pnpm exec vitest run src/repo.test.ts src/app.test.ts src/appSession.test.ts` | ✅ files / ❌ W0 cases | ⬜ pending |
| TBD | TBD | TBD | PANEL-03 | TBD | Detail sections/error box built as plain strings; API text with `<script>` never becomes HTML | unit | `pnpm exec vitest run src/panel/format.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PANEL-04 | TBD | `?download=1` answers `attachment` with a number-based filename; default stays `inline`; relative `/v1` href only when `accessKey` set | integration + unit | `pnpm exec vitest run src/app.test.ts src/appSession.test.ts src/panel/format.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/panel/format.test.ts` and `src/panel/format.d.ts` — pure helpers (PANEL-01..04); `format.d.ts` avoids TS7016
- [ ] `createMemoryRepo.list` sorts and honours `before` / `beforeId` before any route-level pagination test
- [ ] `src/admin.test.ts` — update the no-`<script` assertion (allowed on `/admin` only) and the exact `PAGE_CSP` string
- [ ] A UAT checklist file for browser-only behaviours (dialog, history, mobile cards, download)
- [ ] Framework install: none

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rows render newest first; filter updates `?status=`; "Carregar mais" appends and keeps the filter | PANEL-01, PANEL-02 | No DOM test library; behaviour lives in the browser script | Headless Chrome against a server with a temp `DATABASE_PATH` and seeded notas, logged in via `/login` |
| `#nota=<id>` opens the dialog; Esc / Fechar / Back close it; unknown id shows "Nota não encontrada." | PANEL-03 | History and `<dialog>` behaviour is browser-only | Same harness; check no CSP console violations |
| Narrow screens show stacked cards | PANEL-01 | Visual layout | Narrow viewport screenshot |
| PDF link downloads instead of opening | PANEL-04 | Download handling is browser-only | Click the list and dialog links; confirm `nfse-<number>.pdf` download |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
