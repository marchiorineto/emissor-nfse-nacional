# Phase 03 — UI Review

**Audited:** 2026-11-22
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md exists)
**Screenshots:** captured via PANEL_SMOKE_SHOTS to scratch (not stored in repo). The smoke blocks the Pico CDN, so shots show unstyled-Pico rendering; not scored as a defect. Spacing and color judged from code. Opened: cancel-wide, actions-narrow.
**Interaction captures:** off (interaction_capture is false). Interaction findings are code-derived.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Specific pt-BR labels and error copy; a few wording divergences |
| 2. Visuals | 3/4 | Clear dialog and cancel focal point; row actions unprioritized text links |
| 3. Color | 3/4 | Semantic Pico tokens only; danger button lacks hover/focus/disabled rules |
| 4. Typography | 3/4 | Inherits Pico; no custom size or weight sprawl |
| 5. Spacing | 2/4 | Inline row-action links give tiny touch targets on mobile |
| 6. Experience Design | 3/4 | Thorough states; destructive confirmation is the weak point |

**Overall: 17/24**

---

## Top Priority Fixes (all WARNING, no BLOCKER)

1. **Row actions in the mobile card layout are bare inline links** (src/panel/panel.js ~L90-104) — mis-tap risk, Cancelar sits beside Duplicar — add padding or role="button" and a larger gap; style Cancelar muted/danger.
2. **Cancel confirmation is only a button with data-danger** (panel.js ~L285-295; src/admin.ts ~L187) — Pico hover/focus may override the red; no irreversibility statement — add hover, focus-visible, :disabled rules and state that the cancellation cannot be reopened.
3. **#emitir-state status line may not be announced** (src/panel/emitir.js `say()`; admin.ts ~L398) — screen-reader users miss "Enviando…", rejection and validation messages — add aria-live="polite" / role="status".
4. **Retry/cancel copy diverges** — emitir.js `LOST` says "Envie de novo", panel.js L318 says "Tente de novo" — unify wording.
5. **Row action aria-labels depend on number.text** — unnumbered notas give vague labels — fall back to the sale id.
6. **Cancel section actions may fall below the fold** inside the scrolling dialog — consider a sticky footer for Confirmar and Voltar.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
Labels are specific ("Confirmar cancelamento", "Tentar de novo", "Emitir nota", "Carregar mais"). Errors are actionable and explain idempotent resend ("o mesmo identificador não gera uma segunda nota"). Empty state "Nenhuma nota encontrada." exists. Minor: wording variants (fixes 4, 5); "Fechar" is generic but acceptable.

### Pillar 2: Visuals (3/4)
Dialog has title, status, then the cancel section as focal element. Rejected/unknown statuses use a strong tag and a left inset bar, so status does not rely on color alone. Row actions have aria-labels. Fix 1 applies.

### Pillar 3: Color (3/4)
CSS uses only --pico-del-color, --pico-ins-color, --pico-muted-color with fallbacks; no hardcoded palette beyond #c62828 / #fff fallbacks. Danger red is limited to the confirm button and rejected/unknown rows. See fix 2 for missing states.

### Pillar 4: Typography (3/4)
No custom font-size declarations beyond the login card h1. Hierarchy comes from Pico h2/h3 plus bold dt/strong. No weight sprawl.

### Pillar 5: Spacing (2/4)
No arbitrary pixel values; the mobile card layout uses Pico spacing variables. Weakness is touch-target size and separation (fix 1); actions-narrow.png shows links packed on one line with a thin gap. The unstyled cancel form (cancel-wide.png) has label, select and textarea inline; likely a CDN-block artifact, not scored.

### Pillar 6: Experience Design (3/4)
- Loading/busy: aria-busy and disabled on submit, retry, cancel-confirm, load-more.
- Double-submit guards: `sending`, `view.retrying`, `view.cancelling`.
- Errors: 401, 403, 404/409, 422, 5xx and network each handled; unknown result never reported as failure.
- Validation: field-level aria-invalid and aria-describedby; first invalid field focused.
- Drafts/reloads: cancel draft survives re-render; sale id lives in the URL.
- Cancel: no form element (Enter cannot submit), reason required, Voltar exists.
- Deductions: fix 2, fix 3, no confirmation step beyond the cancel panel.

Registry audit: skipped (no components.json).

---

## Files Audited
- src/admin.ts
- src/panel/panel.js
- src/panel/emitir.js
- src/panel/form.js (by reference)
- .planning/phases/03-nota-actions/03-01-SUMMARY.md and 03-02-SUMMARY.md (partially read)
- Smoke screenshots (scratch, not in repo)
