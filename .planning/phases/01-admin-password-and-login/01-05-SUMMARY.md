---
phase: 01-admin-password-and-login
plan: 05
subsystem: ui
tags: [pico-css, sri, hono, csp, accessibility, gap-closure]

requires:
  - phase: 01-admin-password-and-login
    provides: "Plan 01-03 login/admin pages, PAGE_CSP, Pico pin with SRI"
provides:
  - "Classless Pico 2.1.1 pin with a hash recomputed from jsDelivr"
  - "Nav header on /admin with a compact Sair and distinct produção/homologação badges"
  - "Invalid-field login error (aria-invalid + aria-describedby small)"
  - "HTML refusal pages (403 cross-site, 413, 403 bad CSRF) with a link back"
affects: [phase-2-notas-list, uat-retest]

actuals:
  tokens: 3800
  tasks: 3
  commits: 5

plan_head_before: feecaa3484d05c3af49c4eecaaaff573539ae778
plan_head_after: 97dd513c6a801ffeed669d6ff28cf3dd824b96c8

tech-stack:
  added: []
  patterns:
    - "Classless Pico: semantic markup, data-theme on mark for badges, no class or style attributes"
    - "Refusals rendered through layout() so the SRI-pinned stylesheet and panel headers apply"

key-files:
  created: []
  modified:
    - src/admin.ts
    - src/admin.test.ts

key-decisions:
  - "Classless Pico build instead of a container class, keeping D-12 and an unchanged PAGE_CSP"
  - "Sair button carries no type attribute so Pico's full-width submit rules do not apply in the nav"
  - "Badges use Pico's data-theme attribute (dark mark for produção, light for homologação)"
  - "The nav-button explanation lives in the adminPage JSDoc, not an HTML comment, so it is not sent to the browser"

requirements-completed: [AUTH-02, AUTH-03, AUTH-06]

coverage:
  - id: D1
    description: "Both pages load the classless Pico build with an SRI hash equal to the hash jsDelivr serves; PAGE_CSP unchanged"
    requirement: "AUTH-06"
    verification:
      - kind: unit
        ref: "src/admin.test.ts#pins Pico 2.1.1 classless with an SRI hash and keeps the page CSP"
        status: pass
      - kind: other
        ref: "curl jsDelivr | openssl dgst -sha384 compared with the pinned constant (grep -cF == 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/admin nav header with title, labelled CNPJ and badge on the left and a compact Sair on the right; produção and homologação badges differ"
    requirement: "AUTH-03"
    verification:
      - kind: unit
        ref: "src/admin.test.ts#renders a nav header on /admin with the labelled CNPJ, the light homologação badge and a compact Sair"
        status: pass
      - kind: unit
        ref: "src/admin.test.ts#renders produção as a strong dark badge"
        status: pass
    human_judgment: true
    rationale: "Visual result (centered column, gutters, badge contrast, button size) is the user's judgement in a real browser (UAT test 3 re-test)"
  - id: D3
    description: "Wrong password marks the field aria-invalid with a described-by error small; 429 notice tied to the field without aria-invalid; field never carries a value"
    requirement: "AUTH-02"
    verification:
      - kind: unit
        ref: "src/admin.test.ts#marks the password field invalid after a wrong password, with the message tied to it"
        status: pass
      - kind: unit
        ref: "src/admin.test.ts#answers 401 \"Senha incorreta.\" for a wrong password, without echoing it or setting a cookie"
        status: pass
      - kind: unit
        ref: "src/admin.test.ts#answers 429 with Retry-After before checking the password, per address, and lets the address back in after the delay"
        status: pass
    human_judgment: true
    rationale: "Pico painting the border and message red is only visible in a browser"
  - id: D4
    description: "Cross-site 403, oversized 413 and bad-CSRF logout 403 answer styled HTML with a link back; statuses, cookies and refusal-before-throttle order unchanged; no script/class/style on any panel page"
    requirement: "AUTH-06"
    verification:
      - kind: unit
        ref: "src/admin.test.ts#refuses Sec-Fetch-Site cross-site and same-site, and accepts same-origin and none"
        status: pass
      - kind: unit
        ref: "src/admin.test.ts#answers 413 for a 5 000-byte body before any password check and counts nothing"
        status: pass
      - kind: unit
        ref: "src/admin.test.ts#refuses a logout with a wrong CSRF token (403, cookie untouched)"
        status: pass
      - kind: unit
        ref: "src/admin.test.ts#allows only Pico from jsDelivr: no script, class or style attribute and one absolute URL in src or href, on every page"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-11-20
status: complete
---

# Phase 1 Plan 05: Classless Pico, nav header and refusal pages Summary

**Closes UAT gap G-01-3 by moving /login and /admin to Pico 2.1.1's classless build (SRI hash recomputed from jsDelivr), with a nav header and compact Sair, distinct produção/homologação badges via data-theme, an aria-invalid login error and HTML refusal pages, with no class attributes and PAGE_CSP unchanged.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-11-20T20:58Z
- **Completed:** 2026-11-20T21:05Z
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 2

## Accomplishments

- The pages load `css/pico.classless.min.css`; the executor recomputed the sha384 (`NZhm4G1I...LIYgL`) from the bytes jsDelivr served and it matched the planning-time value, so it was pinned. `body > header` and `body > main` now get gutters and a centered max-width.
- `/admin` header is a nav: h1 plus "CNPJ ..." and the environment badge on the left, a content-width `<button>Sair</button>` (still POSTing the CSRF field to /logout) on the right.
- `<strong><mark data-theme="dark">Produção</mark></strong>` versus `<mark data-theme="light">Homologação (produção restrita)</mark>`.
- Wrong password: `aria-invalid="true"` + `aria-describedby="login-error"` and `<small id="login-error" role="alert">`; 429 uses the same small without aria-invalid; the field never has a value attribute.
- Refusals (403 cross-site, 413, 403 bad CSRF) are HTML pages built by `refusalPage()` through `layout()`, linking back to /login, /login, /admin. Copy aligned: one product name, en-dash titles.

## Task Commits

1. **Task 1: Classless Pico pin with verified SRI (tracer)** - `5fb0000` (feat)
2. **Task 2: Nav header, badges, invalid-field error (TDD)** - RED `d11f35b` (test), GREEN `f6a5bb9` (feat)
3. **Task 3: HTML refusal pages and page-wide invariants (TDD)** - RED `c8fb6cb` (test), GREEN `97dd513` (feat)

No REFACTOR commits were needed.

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified

- `src/admin.ts` - classless URL/SRI constants, loginPage with invalid state, environmentBadge, nav adminPage, refusalPage and the three refusal responses
- `src/admin.test.ts` - pin test, new markup/badge/error tests, refusal-page tests, headers test for refusals, page-wide class/style/script/URL invariants

## Decisions Made

- Followed the plan's decisions (classless build, typeless Sair button, `data-theme` badges).
- The "no type attribute" explanation sits in the `adminPage` JSDoc rather than an HTML comment in the template, because an HTML comment would be sent to every browser.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dependencies not installed in the fresh worktree**
- **Found during:** Task 1 (baseline test run)
- **Issue:** `node_modules` absent, so vitest and tsc could not run.
- **Fix:** `pnpm install --frozen-lockfile` (lockfile-pinned, no package added or changed).
- **Files modified:** none tracked

**2. [Rule 3 - Blocking] TAP reporter could not parse RED evidence**
- **Found during:** Task 2 RED
- **Issue:** vitest's TAP output embeds multi-line HTML bodies from `toContain` failures, which the classifier flagged `invalid_record` ("Non-TAP data in report").
- **Fix:** reran the same planned target with vitest's JUnit reporter (a supported format) and submitted that record; both RED records returned `RED_EVIDENCE_OK`. Evidence lives under the ignored `.gsd/tdd-evidence/01-05/`.

**Total deviations:** 2 auto-fixed (both Rule 3, tooling only). **Impact:** none on scope or code.

## TDD Gate Compliance

- Task 2: RED `d11f35b` (target "marks the password field invalid after a wrong password..." failed on the planned `aria-invalid` assertion, `RED_EVIDENCE_OK`; semantic assessment: executed and failed for the intended reason, no syntax/fixture fault; 5 new tests failed) then GREEN `f6a5bb9`.
- Task 3: RED `c8fb6cb` (target "answers 413 for a 5 000-byte body..." failed on the planned text/html assertion, `RED_EVIDENCE_OK`; 4 tests failed; the extended security-headers test already passed because the old text responses carried the headers too) then GREEN `97dd513`.
- Task 1 was a tracer and ran as a normal commit. No gate violations.

## Verification

- `pnpm test`: 14 files passed, 197 passed, 1 skipped (pre-existing skip, not in admin tests); `src/admin.test.ts` 31 passed.
- `pnpm run typecheck` exits 0.
- SRI check: recomputed hash from jsDelivr is present exactly once in `src/admin.ts`.
- Acceptance greps: `<nav>`=1, `<button>Sair</button>`=1, `data-theme="dark"`=1, `data-theme="light"`=1, `aria-describedby="login-error"`=1, `Painel do emissor`=0, `c.text(`=0, `Recarregue`=0, `Voltar ao login`=2, `Voltar ao painel`=1.
- Tracer gate: `<verify>` re-run end to end after Task 1, passed, expansion proceeded.

## Pending Human Verification

The Task 3 `<human-check>` (UAT test 3 re-test in a real browser: centered column, red-bordered invalid field, nav header, distinct badges, no SRI/CSP console error) was not run; the optional headless-Chrome visual self-check was also skipped. SRI/CSP enforcement and the visual judgement happen only in a browser.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or trust boundaries; refusal pages render only fixed strings through the escaping `html` template (T-01-33), the error small carries fixed text and the password input never gets a value (T-01-34), and the SRI hash was recomputed before pinning (T-01-32).

## Self-Check: PASSED

- `src/admin.ts` and `src/admin.test.ts` exist with the changes.
- Commits `5fb0000`, `d11f35b`, `f6a5bb9`, `c8fb6cb`, `97dd513` are ancestors of HEAD.
