---
phase: 01-admin-password-and-login
plan: 01
subsystem: auth
tags: [scrypt, node-crypto, env-file, cli-script, vitest]

requires: []
provides:
  - "src/password.ts: salted scrypt hash, strict parse and non-blocking verify, shared by the script and the server"
  - "scripts/admin-password.mjs and `pnpm run admin-password`: asks twice (hidden on a terminal, two lines when piped) and stores only the hash in .env"
  - ".env.example: documented empty ADMIN_PASSWORD"
affects: [01-02 server login (imports verifyPassword/parseHash), 01-03, 01-04, README docs]

actuals:
  tokens: 6000
  tasks: 3
  commits: 4
plan_head_before: 84bee096edf8c1e25990d5da993bf877d5406b25
plan_head_after: c18ddbfade4dcadcc31759136baac8ebc7710cb3

tech-stack:
  added: []
  patterns:
    - "Hash format scrypt:<N>:<r>:<p>:<salt b64url>:<key b64url>, free of $ # = and spaces so it is safe unquoted in .env and Compose"
    - "Single private derive() applies NFKC and maxmem, so hashing and verifying cannot diverge"
    - "Script integration tests run a temp copy of scripts/ and src/ so the repository's .env is never touched"

key-files:
  created:
    - src/password.ts
    - src/password.test.ts
    - scripts/admin-password.mjs
    - src/adminPasswordScript.test.ts
  modified:
    - package.json
    - .env.example

key-decisions:
  - "scrypt N=65536 r=8 p=2 keylen 32, 16-byte salt, maxmem 256 MiB; stored hashes are bounds-checked on parse (N power of two 1024..2^20, r and p 1..16, fixed salt and key lengths)"
  - "No-terminal input is two stdin lines, never an environment variable (the package script loads .env first, so ADMIN_PASSWORD in the environment is the old hash)"
  - "setVar rewrites every ADMIN_PASSWORD= line (gm flags) because Node's .env parser keeps the last value of a repeated name"

requirements-completed: [PASS-01, PASS-02, PASS-03, PASS-04]

coverage:
  - id: D1
    description: "src/password.ts hashes with salted scrypt, counts code points, applies NFKC on both sides, rejects malformed or out-of-bounds stored hashes with false, and does not block the event loop"
    requirement: PASS-03
    verification:
      - kind: unit
        ref: "src/password.test.ts (21 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "`pnpm run admin-password` writes a verifiable scrypt hash to .env from two piped lines, replaces it on a second run, and tells the operator to restart"
    requirement: PASS-04
    verification:
      - kind: integration
        ref: "src/adminPasswordScript.test.ts#writes a scrypt hash that verifies the password to .env and tells the operator to restart"
        status: pass
      - kind: integration
        ref: "src/adminPasswordScript.test.ts#replaces the hash on a second run with one that verifies only the new password"
        status: pass
    human_judgment: false
  - id: D3
    description: "Mismatched, empty, short and overlong entries exit 1 with a pt-BR error and leave .env byte-identical (or absent)"
    requirement: PASS-02
    verification:
      - kind: integration
        ref: "src/adminPasswordScript.test.ts#bad entries leave .env alone"
        status: pass
    human_judgment: false
  - id: D4
    description: "The script edits only ADMIN_PASSWORD lines (all duplicates), keeps order and CRLF, creates .env from .env.example, ends at mode 0600, and never leaks the plaintext"
    requirement: PASS-03
    verification:
      - kind: integration
        ref: "src/adminPasswordScript.test.ts#good entries edit only the ADMIN_PASSWORD lines"
        status: pass
    human_judgment: false
  - id: D5
    description: "Both prompts on a real terminal show no typed character"
    requirement: PASS-01
    verification: []
    human_judgment: true
    rationale: "Raw-mode terminal echo cannot be observed from a non-interactive agent shell; the plan's Task 3 human-check covers it"

duration: 3min
completed: 2026-11-20
status: complete
---

# Phase 1 Plan 01: Admin Password Script and Hash Module Summary

**`pnpm run admin-password` stores a salted scrypt hash (N=65536, r=8, p=2) as ADMIN_PASSWORD in .env, backed by a shared `src/password.ts` whose `verifyPassword` the server will reuse**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-20T20:00:27Z
- **Completed:** 2026-11-20T20:03:40Z
- **Tasks:** 3
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `src/password.ts` exports the contract plan 01-02 imports (`MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH`, `SCRYPT_PARAMS`, `SCRYPT_MAXMEM`, `ParsedHash`, `validatePassword`, `hashPassword`, `parseHash`, `verifyPassword`). Verification uses the async `crypto.scrypt`, never throws, and bounds the stored parameters so a corrupted `.env` cannot cause a huge allocation.
- `scripts/admin-password.mjs` follows `certificate.mjs`: hidden raw-mode prompts on a terminal, two stdin lines otherwise, validation and equality check before any write, one write followed by `chmodSync(0o600)`, and the restart notice (D-02).
- `.env.example` documents an empty `ADMIN_PASSWORD=`; the `admin-password` package script uses the same node flags as `certificate` (D-20).
- 36 new tests (21 unit, 15 script integration) plus the existing suite: `pnpm test` 136 passed, 1 skipped; `pnpm run typecheck` clean.

## Task Commits

1. **Task 1: tracer, end-to-end happy path** - `de690c0` (feat)
2. **Task 2: hash contract tests** - `fc1011b` (test)
3. **Task 3 RED: .env editing and bad-entry tests** - `daffe42` (test)
4. **Task 3 GREEN: `gm` setVar and .env.example entry** - `c18ddbf` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## TDD Gate Compliance

- **Task 2 (RED gate not observable):** the plan's Task 1 spec already required the full `src/password.ts` contract, so the Task 2 tests passed on first run (unexpected green by construction, not a wrong test). To prove the tests discriminate, each was mutation-checked against the implementation: switching `derive` to `scryptSync` fails only the event-loop test; dropping NFKC fails only the accent test; dropping `maxmem` fails the suite; dropping the length guard in `verifyPassword` fails the overlong test (that test was strengthened mid-task so it hashes the 1025-character password and expects `false`, since a plain wrong-password check passed with or without the guard). The implementation was restored from a saved copy after each mutation; `git status` showed `src/password.ts` unchanged.
- **Task 3 RED:** `daffe42` ran 15 tests, 2 failed on the planned assertions (`.env.example` produced no ADMIN_PASSWORD line so the line count was 41 vs 40; a duplicate `ADMIN_PASSWORD=old2` line was left with the old value). The classifier `gsd_run check tdd-red-evidence` was not run (`workflow.tdd_mode` not enabled for this plan; the RED assessment above was done by reading the vitest output). The other 13 tests pin behavior Task 1 already provided.
- **Task 3 GREEN:** `c18ddbf` made all 36 tests pass.

## Decisions Made

- Followed the plan's recorded decisions (hash format, scrypt parameters, stdin-only input, code-point counting, NFKC in the single derive helper, global-flag `setVar`).
- `verifyPassword` wraps `derive` in try/catch (the plan required "never throws"); the N=2^20, r=16 case is rejected by scrypt itself for exceeding `maxmem` and resolves `false`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed the locked dependencies in the fresh worktree**
- **Found during:** Task 1 setup
- **Issue:** the worktree had no `node_modules`, so vitest and tsc could not run.
- **Fix:** `pnpm install --frozen-lockfile --offline`, which installs only the versions already pinned in `pnpm-lock.yaml`; no package was added or substituted and the lockfile did not change.
- **Files modified:** none tracked

**2. [Process] Task 2 had no RED phase** - see TDD Gate Compliance above. No code deviation.

---

**Total deviations:** 1 auto-fixed (Rule 3), 1 process note.
**Impact on plan:** none on scope or behavior.

## Issues Encountered

- A first draft of the "over the maximum length" test did not discriminate (a wrong password returns `false` with or without the guard). Fixed by hashing the overlong password itself and expecting `false`; confirmed it fails with the guard removed.

## Known Stubs

None.

## Threat Flags

None. The only new surface is a local CLI script writing `.env`, covered by the plan's threat model (T-01-01 to T-01-06): plaintext never reaches `.env`/stdout/stderr (tested), mode 0600 (tested), `$`-free hash with function replacement and every duplicate rewritten (tested), parse bounds and `maxmem` (tested), validation before the single write (tested).

## User Setup Required

None - no external service configuration required. One manual check remains (PASS-01): in a real terminal run `pnpm run admin-password` and confirm neither prompt echoes what is typed, then that both final messages print. This sets the real panel password, so use a scratch clone if preferred.

## Next Phase Readiness

- Plan 01-02 can `import { verifyPassword, parseHash, MAX_PASSWORD_LENGTH } from './password.ts'` and derive the session key from the stored hash.
- Reminder carried to docs (README): `Dockerfile` does not copy `scripts/` (RESEARCH Pitfall 10); not part of this plan.

---
*Phase: 01-admin-password-and-login*
*Completed: 2026-11-20*

## Self-Check: PASSED

All created files exist (`src/password.ts`, `src/password.test.ts`, `scripts/admin-password.mjs`, `src/adminPasswordScript.test.ts`); commits `de690c0`, `fc1011b`, `daffe42`, `c18ddbf` are ancestors of HEAD.
