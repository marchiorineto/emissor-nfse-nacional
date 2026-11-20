---
phase: 02-notas-panel
plan: 02
subsystem: api
tags: [hono, sqlite, pagination, pdf, content-disposition]

requires:
  - phase: 01-admin-auth
    provides: session-cookie auth on /v1/* (requireAuth) that the panel's list and download calls ride on
provides:
  - "GET /v1/notas before + beforeId cursor over (created_at, id), no skipped or repeated nota"
  - "listLimit clamp (integer 1..100, default 50) for every caller"
  - "GET /v1/notas/:id/pdf?download=1 attachment named nfse-<number>.pdf"
  - "createMemoryRepo.list with the same order and cursor as SQLite, returning copies"
affects: [02-03 panel browser half, 02-notas-panel]

actuals:
  tokens: 4200
  tasks: 3
  commits: 5
plan_head_before: af9362c14d351b68bcd052abac3982e4f31d1fa1
plan_head_after: edb88ae21beee5d1c94f8e85ab3d17d6d8e52bb5

tech-stack:
  added: []
  patterns:
    - "Row-value cursor (created_at, id) < (?, ?) with ORDER BY created_at DESC, id DESC; values only through placeholders"
    - "Memory repo mirrors SQLite ordering (Buffer.compare on UTF-8 ids = BINARY collation) so route tests of paging are meaningful"

key-files:
  created: []
  modified:
    - src/notas.ts
    - src/repo.ts
    - src/app.ts
    - src/repo.test.ts
    - src/app.test.ts
    - src/appSession.test.ts

key-decisions:
  - "beforeId is optional and only meaningful with before; before alone keeps today's created_at < before, so the /v1 contract is unchanged (D-02)"
  - "limit invalid values fall back to the default 50, not to 1 (D-04); isolated in one helper, rated costly"
  - "download=1 names the file from the NFS-e number (else DPS number) filtered to [0-9A-Za-z-]; inline answer keeps its id-based filename byte for byte (D-18)"

patterns-established:
  - "Test setups take an injected repo (and gov stub) as optional trailing parameters"

requirements-completed: [PANEL-02, PANEL-04]

coverage:
  - id: D1
    description: "Paging with before + beforeId returns every nota exactly once, including notas sharing a createdAt, in SQLite, the memory repo and through the session cookie"
    requirement: PANEL-02
    verification:
      - kind: integration
        ref: "src/appSession.test.ts#notas list pages through the session cookie"
        status: pass
      - kind: unit
        ref: "src/repo.test.ts#pages through a tie with before and beforeId without skipping or repeating"
        status: pass
    human_judgment: false
  - id: D2
    description: "limit is clamped to 1..100 with default 50 for every caller; limit=-1 no longer returns the whole table"
    requirement: PANEL-02
    verification:
      - kind: integration
        ref: "src/app.test.ts#GET /v1/notas limit"
        status: pass
    human_judgment: false
  - id: D3
    description: "?download=1 answers the PDF as attachment named nfse-<number>.pdf, works with the cookie alone, 401 without credential, 404 without access key, any id; inline default and absence of an XML route preserved"
    requirement: PANEL-04
    verification:
      - kind: integration
        ref: "src/appSession.test.ts#PDF download for the panel"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-11-20
status: complete
---

# Phase 2 Plan 02: Notas list paging and PDF download Summary

**Stable (created_at, id) cursor paging, a 1..100 limit clamp and an opt-in `?download=1` attachment named by the NFS-e number, all behind the existing /v1 auth and contract**

## Performance

- **Duration:** about 14 min
- **Tasks:** 3
- **Files modified:** 6 (3 source, 3 test)

## Accomplishments
- `GET /v1/notas` accepts `beforeId` next to `before`; SQL orders `created_at DESC, id DESC` and filters `(created_at, id) < (?, ?)`, so two notas created in the same millisecond at a page edge are neither skipped nor repeated. Callers sending only `before` see the old meaning.
- The memory repo now sorts, applies the same cursor (UTF-8 byte order for ids, like SQLite BINARY) and returns copies, so route-level paging tests mean something.
- `listLimit` closes the `limit=-1` dump: integer part, 1..100, default 50 for absent, empty, zero, negative or non-numeric values.
- `GET /v1/notas/:id/pdf?download=1` answers `attachment; filename="nfse-<number>.pdf"` with the same bytes; ids outside Latin-1 now download; the inline default for Bearer clients is untouched; no XML route under `/v1/notas/:id`.

## Task Commits

1. **Task 1: Next page with a same-millisecond tie (tracer)** - `dfad8e1` (feat)
2. **Task 2: Memory repo mirrors SQLite, limit clamp (TDD)** - `ab55e47` (test, RED), `4177980` (feat, GREEN)
3. **Task 3: PDF attachment with ?download=1 (TDD)** - `1ea2a9f` (test, RED), `edb88ae` (feat, GREEN)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified
- `src/notas.ts` - `beforeId?: string` on `Repo.list` and `Notas.list`, JSDoc of the cursor
- `src/repo.ts` - SQL cursor and id tiebreak; memory repo list with order, cursor and copies
- `src/app.ts` - `beforeId` passthrough, `DEFAULT_LIST` and `listLimit`, `?download=1` branch
- `src/repo.test.ts` - list cases run against both repos (order, tie, cursor, bytes order, copies)
- `src/app.test.ts` - `setup` takes a repo; limit clamp cases over 101 notas
- `src/appSession.test.ts` - `setup` takes repo and gov stub; paging and download through the cookie

## Decisions Made
See key-decisions. The pre-existing failure of the inline filename for ids outside Latin-1 (RESEARCH Pitfall 7) is left out of scope and documented in the route's JSDoc.

## TDD Gate Compliance

- **Task 2 RED:** `ab55e47` - target tests failed on their planned assertions (memory repo order `['a','b']` vs `['c','b']`, copies mutated, `?limit=-1: expected 100 to be 50`); semantic assessment: genuine assertion failures, no import/fixture faults. GREEN: `4177980`.
- **Task 3 RED:** `1ea2a9f` - `expected 'inline; filename="nfse-pedido-1.pdf"' to be 'attachment; filename="nfse-7.pdf"'` and a 500 ByteString error for the non-Latin-1 id; GREEN: `edb88ae`.
- Task 1 is a `tracer` task (not `tdd="true"`): production code and its test landed in one commit. No REFACTOR commits were needed.
- RED evidence was inspected from the vitest output; the `gsd_run check tdd-red-evidence` classifier was not run (the TAP-capture path was not used for these runs).

## Deviations from Plan

None - plan executed exactly as written. Two small notes: the hostile-`beforeId` test expects `['c','b']` rather than an empty list because `x'...` sorts after `c` in byte order (the plan only required a 200 and an intact table); and the `listLimit(` acceptance count of 2 is met by the helper's JSDoc plus its call site.

## Issues Encountered
None.

## Known Stubs
None.

## Threat Flags
None - no new surface beyond the plan's threat model (T-02-06..T-02-09 mitigated and tested).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Plan 02-03 can send `before` + `beforeId` and link `?download=1`; both are real and tested. Note for the user: `limit=-1` now returns the default 50 instead of the whole table (costly-to-reverse behavior change, isolated in `listLimit`).

## Self-Check: PASSED

Files modified exist; commits `dfad8e1`, `ab55e47`, `4177980`, `1ea2a9f`, `edb88ae` are ancestors of HEAD; `pnpm test` (226 passed, 1 skipped) and `pnpm run typecheck` pass; all acceptance greps pass.

---
*Phase: 02-notas-panel*
*Completed: 2026-11-20*
