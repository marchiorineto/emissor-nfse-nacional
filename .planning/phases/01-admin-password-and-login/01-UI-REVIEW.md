# Phase 01 — UI Review

**Audited:** 2026-11-20
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md), plus the UI decisions D-11..D-15 in 01-CONTEXT.md
**Screenshots:** not captured (no dev server on localhost:3000, 5173 or 8080; code-only audit)
**Interaction captures:** off (workflow.ui_interaction_capture is false)

Scope: the two server-rendered pages in `src/admin.ts` (`GET /login`, `GET /admin`) and the text responses of
`POST /login` and `POST /logout`. Styling is Pico CSS 2.1.1 (`pico.min.css`, the class-based build) loaded from
jsDelivr with SRI. Layout claims below come from reading the pinned Pico stylesheet, not from screenshots.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Clear, specific pt-BR labels; the 403/413 refusals are bare text pages with no way back |
| 2. Visuals | 2/4 | On /admin the full-width "Sair" button is the most prominent element; the env badge looks the same for production and homologação |
| 3. Color | 3/4 | Only Pico tokens, no hardcoded colors; the error message and the production badge carry no color signal |
| 4. Typography | 4/4 | Pico defaults only: one h1 per page, body text, no ad-hoc sizes or weights |
| 5. Spacing | 2/4 | No container: content touches the viewport edges, and on desktop the password field is 1440 px wide |
| 6. Experience Design | 3/4 | Works without JS, keeps focus, has error/429 states; the invalid field is not marked and error pages are dead ends |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **No horizontal container on either page** — on phones the text and inputs sit flush against the screen edge, and
   on desktop the login field and buttons stretch across the whole window — load Pico's classless build
   (`css/pico.classless.min.css`, which centers `body > header/main/footer` and adds side gutters; it matches D-12's
   "classless or semantic" rule and plan 01-02's "no class attributes") with its own SRI hash; tests that assert on
   `PICO_CSS_URL` follow the constant. (`class="container"` would also work but breaks the no-class rule.)
2. **"Sair" is a full-width button in the /admin header** — Pico gives `button[type=submit]` `width:100%`, so logout
   becomes the largest element on the panel, above the issuer and environment it should frame — put the header in a
   Pico `<nav>` (`<ul><li><strong>Emissor de NFS-e</strong></li></ul><ul><li><form>…<button>Sair</button></form></li></ul>`)
   so the button takes its content width on the right (classless; Pico sizes nav items to content).
3. **Production and homologação look the same** — both badges are the same yellow `<mark>`, so an operator about to
   issue real notas gets no visual warning that this is production — keep `<mark>` for homologação and render
   production with a stronger signal (for example `<strong><mark>Produção</mark></strong>` plus a distinct Pico
   color via `data-*`/`aria` hook in Phase 2, or a text prefix like "Atenção: Produção").

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

Strengths: every visible string is pt-BR and specific. Buttons say what they do ("Entrar" `src/admin.ts:76`,
"Sair" `src/admin.ts:90`), the field is labelled "Senha" `src/admin.ts:72`, the wrong-password message is exactly
"Senha incorreta." (D-10, `src/admin.ts:157`) and the throttle message gives the wait ("Muitas tentativas. Tente de
novo em N s." `src/admin.ts:150`). No generic "Submit/OK/Click here" labels.

- WARNING — `src/admin.ts:145` "Pedido recusado." and `src/admin.ts:144` "Pedido grande demais." are `text/plain`
  bodies. A person who hits them sees a white page with one sentence and no link back to `/login`. Render them with
  `loginPage(...)` (or a minimal page with a link "Voltar ao login").
- WARNING — `src/admin.ts:189` "Sessão expirada ou formulário inválido. Recarregue a página." is also plain text, and
  "Recarregue a página" on the result of a POST makes the browser offer to resend the same stale form, which fails
  again. Say "Volte ao painel e tente de novo." with a link to `/admin`, or redirect to `/admin` (which itself
  redirects to `/login` when the session is gone).
- Minor — naming differs between the pages: the login h1 is "Painel do emissor" (`src/admin.ts:70`) while the panel
  h1 and title are "Emissor de NFS-e" (`src/admin.ts:84,86`). Pick one product name for both h1s.
- Minor — the CNPJ is shown unlabelled (`src/admin.ts:87`: `<p>${cnpj} <mark>…</mark></p>`). "CNPJ 12.345.678/0001-90"
  reads better for a non-technical operator.
- Minor — the login title uses a hyphen ("Entrar - Emissor de NFS-e", `src/admin.ts:68`); an en dash or "·" is the
  usual title separator.

### Pillar 2: Visuals (2/4)

- WARNING — `src/admin.ts:88-91`: the logout `<button type="submit">` inherits Pico's
  `button[type=submit]{width:100%}`. In the header it renders as a full-width primary (accent-filled) bar under the
  CNPJ line, making "Sair" the focal point of a page whose purpose is to show the panel. See Top fix 2.
- WARNING — `src/admin.ts:87`: the environment badge is the only visual cue that separates a test environment from
  one that issues real tax documents, but both values use the same `<mark>` styling. See Top fix 3.
- Minor — `src/admin.ts:93`: `<main id="notas"></main>` is empty, so below the header the page is blank. Expected for
  the Phase 1 skeleton (D-13), but Phase 2 should replace it with a list or an explicit empty state.
- Fine — the login page has a clear focal point: h1, one labelled field, one primary button.

### Pillar 3: Color (3/4)

- No hardcoded colors, no inline styles, no classes in `src/admin.ts`; all color comes from Pico tokens, and
  `<meta name="color-scheme" content="light dark">` (`src/admin.ts:55`) lets Pico follow the OS theme.
- Accent use is minimal: the two submit buttons are the only primary-colored elements (2 elements).
- WARNING — `src/admin.ts:75`: the error `<p role="alert">` has no Pico styling (Pico does not style `[role=alert]`),
  so "Senha incorreta." renders in body color, not the form error color. Pico colors errors through
  `input[aria-invalid=true]` and a following `<small>`; see Pillar 6.
- See Pillar 2 on the badge: same `--pico-mark-background-color` for both environments.

### Pillar 4: Typography (4/4)

- Only semantic elements: one `<h1>` per page (`src/admin.ts:70,86`), `<p>`, `<label>`, `<mark>`. No font sizes,
  weights or font families are set by the app, so the scale is Pico's single default scale.
- `lang="pt-BR"` (`src/admin.ts:51`) is set, so hyphenation and screen-reader pronunciation are right.
- No issues found.

### Pillar 5: Spacing (2/4)

- WARNING — `src/admin.ts:60-62` (layout) with `<main>`/`<header>` as direct children of `<body>`: the class-based
  `pico.min.css` only gives `body>header, body>main, body>footer` vertical padding
  (`padding-block: var(--pico-block-spacing-vertical)`). Horizontal gutters and the max-width come from `.container`
  (not used) or from the classless build (not loaded). Result: zero side padding at every width, and inputs/buttons
  (`width:100%`) span the entire viewport. On a 375 px phone the label and field touch the screen edge; on a 1440 px
  desktop the password field is about 1440 px wide. See Top fix 1.
- Fine — no arbitrary spacing values anywhere; once a container is in place, Pico's spacing scale governs everything.

### Pillar 6: Experience Design (3/4)

State coverage (code-derived; no interaction was captured):

| State | Present | Where |
|-------|---------|-------|
| Wrong password | yes, 401 + message, field cleared | `src/admin.ts:157`, `:73` (no `value`) |
| Throttled | yes, 429 + Retry-After + wait in seconds | `src/admin.ts:148-151` |
| Already logged in | yes, GET /login redirects to /admin | `src/admin.ts:141` |
| Session expired | yes, /admin redirects to /login (no loop) | `src/admin.ts:173-176,195` |
| No JS / CDN down | yes, plain form POST, semantic markup readable unstyled | D-12, D-14 |
| Focus on load | yes, `autofocus` on the password field | `src/admin.ts:73` |
| Password manager | yes, `autocomplete="current-password"` | `src/admin.ts:73` |
| Cross-site / oversize / bad CSRF | text-only dead end | `src/admin.ts:144,145,189` |
| Empty notas area | blank (deferred to Phase 2) | `src/admin.ts:93` |

- WARNING — `src/admin.ts:73-75`: after a failed login the field is not marked `aria-invalid="true"` and the message
  is not tied to it (`aria-describedby`). Screen readers get the alert, but the field itself reads as valid and Pico
  shows no red border. Fix: when `error` is set, render
  `<input … aria-invalid="true" aria-describedby="login-error">` and `<small id="login-error">${error}</small>`
  (keep `role="alert"` on it); Pico then colors both.
- WARNING — the three text-only refusals (Pillar 1) leave the user without a next step.
- Minor — the submit button has no busy state; scrypt verification takes a noticeable moment and a double click sends
  two posts (the second counts against the throttle only if both fail). Acceptable without JS; Phase 2's panel JS
  could add `aria-busy="true"` on submit, which Pico renders as a spinner.
- No destructive actions exist in this phase, so no confirmation is needed. Logout needs none.

Registry audit: not applicable (no `components.json`, no shadcn).

---

## Files Audited

- `src/admin.ts` (pages, layout, routes and response copy)
- Pico CSS 2.1.1 `css/pico.min.css` from jsDelivr (read to confirm container, button width, `mark` and
  `aria-invalid` rules)
- `.planning/phases/01-admin-password-and-login/01-CONTEXT.md` (D-10..D-15)
- `.planning/phases/01-admin-password-and-login/01-01-SUMMARY.md` .. `01-04-SUMMARY.md`
- `.planning/phases/01-admin-password-and-login/01-01-PLAN.md` .. `01-04-PLAN.md`
