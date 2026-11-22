---
phase: 03-nota-actions
plan: 01
subsystem: api
tags: [concurrency, idempotency, per-id-lock, weakmap, vitest]

requires:
  - phase: 02-nota-list
    provides: "Repo interface and the createNotas service the lock wraps"
provides:
  - "Module-level per-id lock in src/notas.ts (WeakMap keyed by the shared Repo) serializing issue and cancel"
  - "Route-level and service-level concurrency regression tests"
  - "README note: one server process must own the SQLite file"
affects: [03-nota-actions panel cancel/reissue actions, any future caller of createNotas]

actuals:
  tokens: 4200
  tasks: 2
  commits: 4
plan_head_before: 4d43bba7e7ca180ef2e30c473cbf6ef7dc77651b
plan_head_after: 203bee0ad44cc65228b96489f191816926346831

tech-stack:
  added: []
  patterns:
    - "Per-key promise chain with swallowed predecessor rejection and self-cleaning tail"

key-files:
  created: []
  modified:
    - src/notas.ts
    - src/app.test.ts
    - src/notas.test.ts
    - README.md

key-decisions:
  - "Lock lives at module level keyed by the repo object, because src/app.ts rebuilds createNotas per request (D-18)"
  - "issue and cancel share one key space per id; pdf, get and list stay concurrent"
  - "In-process lock accepted with the single-process assumption (A5), documented in README"

patterns-established:
  - "serialized(repo, id, fn): chain fn after the id's tail with .catch(() => undefined).then(fn); delete the entry only if the stored tail is still its own"

requirements-completed: [ACT-01, ACT-02]

coverage:
  - id: D1
    description: "Two concurrent POST /v1/notas with the same id send the DPS once and answer the same nota (dpsNumber, accessKey), one nota stored"
    requirement: "ACT-01"
    verification:
      - kind: integration
        ref: "src/app.test.ts#concurrent requests for one id > sends the DPS once for two concurrent POST /v1/notas with the same id"
        status: pass
    human_judgment: false
  - id: D2
    description: "Issue is serialized per id across createNotas instances sharing a repo; a third issue returns the stored nota; different ids run in parallel; a rejected call does not block the next one"
    requirement: "ACT-01"
    verification:
      - kind: unit
        ref: "src/notas.test.ts#concurrent calls for one id"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two concurrent cancels of one nota send one cancellation event and both resolve canceled"
    requirement: "ACT-02"
    verification:
      - kind: unit
        ref: "src/notas.test.ts#concurrent calls for one id > sends one cancellation event for two concurrent cancels, and both resolve canceled"
        status: pass
    human_judgment: false
  - id: D4
    description: "README states in pt-BR that one server process must own the SQLite file"
    verification: []
    human_judgment: true
    rationale: "Documentation wording; no test asserts it beyond a grep for the phrase"

duration: 6min
completed: 2026-11-22
status: complete
---

# Phase 3 Plan 01: Per-id serialization of issue and cancel Summary

**A module-level WeakMap-keyed promise chain in src/notas.ts serializes issue and cancel per nota id across per-request createNotas instances, so a reload, second tab or second device during the government wait reuses the first DPS instead of sending a second one.**

## Performance

- **Duration:** about 6 min
- **Tasks:** 2 (Task 1 tracer, Task 2 auto; both TDD)
- **Files modified:** 4 (src/notas.ts, src/app.test.ts, src/notas.test.ts, README.md)
- **Commits:** 4 (test, feat, test, feat)

## Accomplishments

- Closed the double-issue race: two parallel `POST /v1/notas` with one id now call `gov.sendDps` once, both answer 200 with the same `dpsNumber` and `accessKey`, and the repo holds one nota.
- Cancel shares the lock: two concurrent cancels send one `sendEvent` and both resolve `canceled`.
- Different ids stay parallel (both sends start before either finishes), and a failing call (replaces a missing nota, 404) rejects only for its own caller while the queued call for the same id still issues.
- README (pt-BR) names the single-process condition under which the in-process lock holds (assumption A5).
- `src/app.ts` and `src/request.ts` untouched; the /v1 contract is unchanged. Full suite: 297 passed, 1 skipped; `pnpm run typecheck` clean.

## TDD Record

**Task 1 (tracer)**
- RED (`0e24d54`): route-level test in `src/app.test.ts` with a 100 ms slow gov and two parallel POSTs. Failed on the planned assertion `expect(sent).toHaveLength(1)` (received 2), the race research reproduced. Semantic assessment: the target test executed and failed for the intended reason (two sendDps calls), not a setup or import fault. `gsd_run check tdd-red-evidence` was not run: the plan is `type: execute` with `tdd="true"` tasks and no `workflow.tdd_mode` gate evidence was requested; the vitest failure output above is the RED evidence.
- GREEN (`1073268`): `locks` WeakMap and `serialized()` added; `issue` wrapped. The case passes; 51 tests across app, notas and appSession pass.
- Tracer gate: `<verify>` is automated-only; it passed end to end (vitest + typecheck) before Task 2 began.

**Task 2**
- RED (`7dd4657`): five cases under `concurrent calls for one id`. Only the cancel case failed on its planned assertion (`events` was 2, expected 1). The other four passed at RED because Task 1 had already locked `issue`; they are regression coverage for the behaviors Task 2 lists (shared repo, third issue, parallel ids, failure isolation), not new behavior. Semantic assessment: the failing target ran and failed on the intended assertion.
- GREEN (`203bee0`): `cancel` wrapped in `serialized(repo, id, ...)`; README note added. All pass.
- REFACTOR: none needed.

## Deviations from Plan

None - plan executed exactly as written. The lock body was written per the interfaces block; the only detail left open by the plan is that the self-cleaning `finally` is expressed as `run.then(release, release)` rather than a literal `finally` block, with identical semantics (entry deleted only when the stored tail is still its own).

## Known Stubs

None.

## Threat Flags

None. T-3-01 and T-3-02 are mitigated by the tests above; T-3-03, T-3-04 and T-3-SC remain accepted as planned (T-3-04 now documented in README).

## Issues Encountered

- The worktree had no `node_modules`; ran `pnpm install --frozen-lockfile` from the committed lockfile (no new package, nothing added to package.json or the lockfile).
- Acceptance criterion `git diff --quiet 2237088 -- src/app.ts src/request.ts` was checked against the worktree base `4d43bba` instead (empty diff for both files); that is the commit this plan started from.

## Next Phase Readiness

Ready for 03-02 (parallel plan) and the panel action work. Callers of `createNotas` need no changes. Any future code path that writes a nota outside `issue` or `cancel` (for example a panel replace flow, PANEL-06) should enter `serialized` too if it can race on the same id; `markReplaced` still saves the old nota outside its id lock, as planned.

## Self-Check: PASSED

- FOUND: src/notas.ts, src/app.test.ts, src/notas.test.ts, README.md
- FOUND commits: 0e24d54, 1073268, 7dd4657, 203bee0 (descend from base 4d43bba)
