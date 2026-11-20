# Phase 01 — UI Review

**Audited:** 2026-11-20 (re-audit after gap-closure plan 01-05; first audit 2026-11-20 scored 17/24)
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md), plus the UI decisions D-11..D-15 in 01-CONTEXT.md
**Screenshots:** captured, 32 images (8 pages × desktop 1440×900 / mobile 375×812 × light / dark), with an offline
render because no dev server was on localhost:3000, 5173 or 8080. The pages came from `createApp(...).request(...)`
with the real `src/admin.ts`. The stylesheet was the jsDelivr `pico.classless.min.css` 2.1.1 file, saved locally after
its sha384 was checked against `PICO_CSS_INTEGRITY` (it matches). `integrity`/`crossorigin` were removed only in the
local copies so that Chrome loads the stylesheet over `file://`. Headless Chrome took the captures, with
`--force-dark-mode` for dark. They are stored in the gitignored `.planning/ui-reviews/01-20261120-styled/`, and the
unstyled CDN-down fallback is in `.planning/ui-reviews/01-20261120-211018/`.
**Interaction captures:** off (workflow.ui_interaction_capture is false)

Scope: the pages in `src/admin.ts`: `GET /login` (plain, wrong password, 429), `GET /admin` (restricted and
production), and the HTML refusal pages (403 cross-site, 413, 403 logout CSRF).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | One product name, labelled CNPJ, refusals now link back; the refusal headings do not say why or what to do |
| 2. Visuals | 3/4 | Nav header with compact Sair fixes the focal point; production badge is the weaker cue in dark mode |
| 3. Color | 3/4 | Pico tokens only, error state now red; dark-mode production badge is navy on near-black |
| 4. Typography | 4/4 | Pico scale only, one h1 per page, hgroup muted subtitle |
| 5. Spacing | 3/4 | Classless container gives gutters at every width; login form still stretches to 1200 px on desktop |
| 6. Experience Design | 4/4 | All states covered and marked accessibly; no dead ends left |

**Overall: 20/24** (was 17/24)

Blocking issues: none. Every pillar scores 3 or higher.

### Prior findings (17/24 audit), now resolved by 01-05

| Prior finding | Status | Evidence |
|---|---|---|
| No horizontal container (Spacing 2/4) | resolved | Classless build: 120 px gutters at 1440, 16 px at 375 (screenshots `*-desktop-*`, `*-mobile-*`) |
| Full-width "Sair" as focal point (Visuals) | resolved | `<nav>` with `<button>` and no type; compact button on the right (`admin-*-desktop-*.png`) |
| Production and homologação look the same | resolved in light mode; see new WR-1 for dark mode | `data-theme="dark"` vs `"light"` on `<mark>`, production also `<strong>` |
| Error not tied to field / no red state | resolved | `aria-invalid="true"` + `aria-describedby` + `<small>`, red border and red text (`login-wrong-*.png`) |
| Text-only 403/413/CSRF dead ends | resolved | `refusalPage` with h1 and link back (`refused-*.png`, `logout-csrf-403-*.png`) |
| Two product names, unlabelled CNPJ, hyphen in title | resolved | "Emissor de NFS-e" on both pages, "CNPJ 11.222.333/0001-81", en dash in the title |

---

## Top 3 Priority Fixes

1. **In dark mode, production is the less visible badge.** The light-theme `<mark>` for homologação (amber on near-black)
   catches the eye most, while production's dark-theme `<mark>` (`#014063` on `#13171f`) nearly blends into the page.
   The warning is weakest exactly where the operator issues real notas. Both badges differ, so the G-01-3 requirement
   is met, but the salience is inverted for OS-dark users. Fix, staying classless: add a text cue that works in every
   scheme, for example `<strong><mark data-theme="dark">Produção · notas reais</mark></strong>`. In Phase 2, when a
   `'self'` stylesheet or script route exists, give the production badge a fixed high-contrast color in both schemes.
2. **Refusal pages say what happened but not why or what to do.** "Pedido recusado" and "Pedido grande demais" stand
   alone with only a link. Add one sentence under the h1, for example "Abra a página de login deste endereço e tente
   de novo." or, for 413, "A senha enviada é longa demais." The 413 copy matters because of code review WR-01: a valid
   but very long non-ASCII password ends on this page with no hint.
3. **The login form spans the full container (about 1200 px) on desktop.** It is centered with gutters now, but a
   one-field form this wide reads as unfinished. Classless Pico has no narrow container. Wrapping the form in
   `<article>` makes it a card (a focal point, still classless). A narrow column needs a small `'self'` stylesheet,
   which is better left to Phase 2 together with fix 1.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

Strengths: one product name ("Emissor de NFS-e") on both pages (`src/admin.ts:76-78,101,107`). The CNPJ is labelled
(`src/admin.ts:108`). Buttons say what they do ("Entrar", "Sair"). Error copy is specific: "Senha incorreta." and
"Muitas tentativas. Tente de novo em 1 s." Refusal links say where they lead ("Voltar ao login", "Voltar ao
painel"). Titles use an en dash.

- WARNING: `src/admin.ts:183-184` refusal headings "Pedido recusado" / "Pedido grande demais" give no reason or next
  step beyond the link. See Top fix 2.
- Minor: "Sessão expirada ou formulário inválido" (`src/admin.ts:228`) is accurate but merges two causes. With a link
  to `/admin` it is acceptable.

### Pillar 2: Visuals (3/4)

- Fixed: the /admin header has a clear hierarchy. The h1 is the focal point, the CNPJ and badge form a muted hgroup
  subtitle, and Sair is a compact primary button on the right (`admin-restricted-desktop-light.png`). On mobile the
  badge wraps under the CNPJ and Sair stays on the right (`admin-production-mobile-light.png`).
- WARNING: dark-mode production badge salience. See Top fix 1 (`admin-production-desktop-dark.png` vs
  `admin-restricted-desktop-dark.png`).
- Minor: `<main id="notas"></main>` is still empty below the header. This is expected for the Phase 1 skeleton (D-13);
  Phase 2 should add the list or an explicit empty state.

### Pillar 3: Color (3/4)

- No class, no inline style and no hardcoded color (a test asserts no `class=`/`style=` on every page). All color comes
  from Pico tokens, and `color-scheme: light dark` follows the OS.
- Fixed: a wrong password paints the field border, an error icon and the `<small>` in Pico's invalid color
  (`login-wrong-desktop-light.png`).
- Light mode: homologação is amber with dark text, and production is bold white on navy. They are clearly distinct,
  and production is the stronger of the two.
- WARNING: dark mode inverts that salience. See Top fix 1.
- Accent use stays minimal: one primary button per page.

### Pillar 4: Typography (4/4)

- One `<h1>` per page (a test asserts this on /admin). Pico renders the `<hgroup>` subtitle muted. Badge emphasis uses
  `<strong>`, and there are no ad-hoc sizes or weights.
- No issues found.

### Pillar 5: Spacing (3/4)

- Fixed: the classless build centers `body > header` and `body > main` with gutters: 16 px at 375 px and about 120 px
  at 1440 px (max width about 1200 px). Nothing touches the viewport edge.
- Minor: the login form's input and button are about 1200 px wide on desktop (`login-wrong-desktop-light.png`). See Top
  fix 3.
- No arbitrary spacing values. Pico's scale governs everything.

### Pillar 6: Experience Design (4/4)

| State | Present | Evidence |
|-------|---------|----------|
| Wrong password | 401, red field, `aria-invalid` + `aria-describedby` + `role="alert"` small | `src/admin.ts:81-82,196`; `login-wrong-*.png` |
| Throttled | 429 + Retry-After; muted small tied to the field, not marked invalid | `src/admin.ts:187-189`; `login-429-*.png` |
| Cross-site / oversize / bad CSRF | Styled page with h1 and link back | `src/admin.ts:127-134,183-184,228`; `refused-*.png` |
| Already logged in / session expired | Redirects, no loop | `src/admin.ts:180,212-215,232-235` |
| CDN down / SRI mismatch | Unstyled but usable semantic page (nav list, form, links) | `.planning/ui-reviews/01-20261120-211018/unstyled/` |
| Focus and password manager | `autofocus`, `autocomplete="current-password"` | `src/admin.ts:81` |

- Minor (non-scoring): there is no busy state on submit while scrypt runs. Without JS this is acceptable; Phase 2 JS
  can set `aria-busy="true"`.
- Minor (non-scoring): the 429 notice is muted gray, so it reads as a hint rather than an error. That is intended
  (it is not about the password), but users may miss it.

Registry audit: not applicable (no `components.json`, no shadcn).

---

## Files Audited

- `src/admin.ts` (layout, loginPage, adminPage, environmentBadge, refusalPage, routes)
- `src/admin.test.ts` (markup invariants used as evidence)
- Pico CSS 2.1.1 `css/pico.classless.min.css` from jsDelivr (hash verified; `data-theme` scopes and `mark` tokens read)
- 32 headless-Chrome captures of 8 rendered pages (gitignored, `.planning/ui-reviews/01-20261120-styled/`)
- `.planning/phases/01-admin-password-and-login/01-CONTEXT.md` (D-11..D-15)
- `.planning/phases/01-admin-password-and-login/01-01-PLAN.md` .. `01-05-PLAN.md`, `01-01-SUMMARY.md` .. `01-05-SUMMARY.md`
