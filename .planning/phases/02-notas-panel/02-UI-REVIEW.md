---
phase: "02"
slug: "notas-panel"
overall_score: 18
max_score: 24
baseline: "abstract 6-pillar standards (no UI-SPEC.md; CONTEXT.md D-01..D-20 used as decisions)"
audited: "2026-11-20"
screenshots: ".planning/ui-reviews/02-shots/ (git-ignored; Pico CDN blocked in headless capture)"
interaction_capture: false
---

# Phase 02 — UI Review

Overall: **18/24**. No BLOCKERs; every pillar scored 3 because of WARNING-level findings.

Caveat: the screenshots come from `scripts/panel-smoke.mjs`, which blocks the Pico CDN, so color, spacing and
typography were judged from `PANEL_CSS` (`src/admin.ts`) and the code rather than from rendered Pico pixels.
Interaction findings come from reading the code; panel-smoke reported 24/24 passing.

## Pillar Scores

| Pillar | Score | Key finding |
|--------|-------|-------------|
| Copywriting | 3/4 | pt-BR copy matches decisions; loading/error copy is minimal with no recovery action |
| Visuals | 3/4 | Clear ledger layout with bad-status emphasis; mobile cards tall |
| Color | 3/4 | Pico semantic variables only, but Rejeitada and Sem resposta look identical |
| Typography | 3/4 | Few sizes and weights; `small` inside the error box is slightly too small |
| Spacing | 3/4 | Mobile cards fine; dialog `dl` gutter cramped without Pico |
| Experience Design | 3/4 | Strong state handling; no retry on error, thin dialog loading feedback |

## Top Fixes (WARNING)

1. **Rejeitada and Sem resposta are styled identically.** `PANEL_CSS` gives both the same red, bold text and left bar. The operator cannot tell "refused" from "no answer", which need different follow-up. Pendente, Cancelada and Substituída share one grey. Give Sem resposta its own treatment (for example a warning color or a glyph).
2. **The status relies on color and weight only.** Add a non-color cue, such as a glyph prefix (✓ ✕ ! ⏳). This also resolves fix 1.
3. **The dialog `dl` is cramped.** The `max-content` label column butts against the values ("Código do serviço", "Número da DPS"), and `column-gap` depends on `--pico-spacing`. Add a fallback: `var(--pico-spacing, 1rem)`.

## Minor Recommendations

- **Mobile cards** label every field, which makes each nota six labelled lines. Consider dropping the obvious labels (Cliente, Número) or pairing Valor with Situação on one line.
- **Dialog loading/error state** changes only the title. The dialog has no busy indicator and no `aria-busy`, and the error state has no retry or close hint.
- **Error detail text** in the errors box uses `small`, which is hard to read.
- **List loading** is plain text with no skeleton. This is acceptable.
- **Cancelada/Substituída notice (D-20):** the "document no longer valid" note did not appear in the screenshots. Confirm it renders in the dialog. Unit tests cover `statusNotice`.
- **Empty/error list states** are one muted line, with no icon and no retry button. After a network error the admin must reload or change the filter.
- **Wide viewport:** the table has no max-width and is left-aligned at 1440px. This may be an artifact of the missing Pico CSS.
- **Redundant ARIA:** `role="row"`/`role="cell"` on table elements is harmless.
- **Dialog accessible name and focus handling** not verified by the auditor.

## Evidence by Pillar

- **Copywriting (3):** The status labels, "Carregar mais", "Nenhuma nota encontrada.", "Erros na emissão" and "Nota não encontrada." match D-09..D-16.
- **Visuals (3):** The focal point is clear: name over document, bars on bad statuses. XSS fixtures render as plain text.
- **Color (3):** No hardcoded colors. Accents are restrained: red for rejected/unknown, green for issued, muted for the rest.
- **Typography (3):** Sizes are body, `small` and 0.75rem mobile labels. Weights are 400, 600 and bold.
- **Spacing (3):** Pico variables plus a few rem values (0.25rem, 0.75rem), no arbitrary px.
- **Experience Design (3):**
  - Loading, empty and error states are handled.
  - Generation counters drop stale responses.
  - A 401 sends the browser to `/login`.
  - The `#nota=` hash and `?status=` filter are deep-linkable.
  - The dialog closes on Esc and on a backdrop click, and locks page scroll while open.

## Files Audited

`src/admin.ts` (PANEL_CSS), `src/panel/panel.js`, panel-smoke screenshots (list-wide, list-narrow, dialog-wide, dialog-narrow).
