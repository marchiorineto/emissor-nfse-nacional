---
last_mapped_commit: 264a35fb540cd6c69d2106674bf69b3f88cd45d1
last_mapped_at: 2026-11-20
---
# Coding Conventions

**Analysis Date:** 2026-11-20

## Naming Patterns

**Files:**
- Source modules are lowercase single words, one concern each: `src/notas.ts`, `src/dps.ts`, `src/request.ts`, `src/repo.ts`, `src/config.ts`, `src/danfse.ts`. Signing lives in `container/sign.mjs`, not in `src/`.
- Tests sit next to the module they cover with a `.test.ts` suffix: `src/notas.test.ts` tests `src/notas.ts`.
- Container and script files are plain ESM JavaScript with `.mjs`: `container/server.mjs`, `container/sign.mjs`, `scripts/upload-certificate.mjs`.
- Entry point for the Worker is `src/index.ts` (Hono app, default export plus the `GovClient` Container class).

**Functions:**
- camelCase for everything callable. Factories are `create*` and return an object of closures: `createNotas` in `src/notas.ts`, `createD1Repo` in `src/repo.ts`, `createMemoryRepo` in `src/repo.ts`, `createGov` in `src/index.ts`.
- Pure helpers are arrow functions bound with `const`: `const govErrors = (status, json) => ...` in `src/notas.ts`. Prefer `export const name = (...) => ...` over `function` declarations.
- Predicates use `is`/`has` style: `isNotaError` in `src/notas.ts`, `isText` in `src/request.ts`.
- Builders use `build*`: `buildDps`, `buildCancellation` in `src/dps.ts`.
- Parsers use `parse*`: `parseIssueRequest`, `parseTaker`, `parseExport` in `src/request.ts`.
- Formatting/serialization helpers use `to*` or `*Date`/`*Time`: `brasiliaDate`, `brasiliaDateTime`, `centsToDecimal` in `src/dps.ts`.

**Variables:**
- camelCase. Module-level constants are SCREAMING_SNAKE_CASE: `DUPLICATE_DPS`, `MAX_NUMBER_COLLISIONS`, `CLOCK_SKEW_MS`, `NOTA_STATUSES`, `MAX_LIST`, `PAGE`, `LINE` (`src/notas.ts`, `src/index.ts`, `src/danfse.ts`).
- Regex constants are named constants too: `ALREADY_CANCELED` in `src/notas.ts`, `SIMPLES_RATE` in `src/config.ts`, `COUNTRY` in `src/request.ts`.
- Lookup tables are `Record<...>` constants: `OP_SIMPLES`, `TRIB_ISSQN`, `RET_ISSQN` in `src/danfse.ts`; `STATUS_CODE` in `src/index.ts`.

**Types:**
- PascalCase interfaces and type aliases: `Nota`, `NotaStatus`, `IssueRequest`, `ReplaceRequest`, `GovError`, `GovResult`, `Repo`, `Gov`, `Notas` in `src/notas.ts`.
- Domain vocabulary is Portuguese and mirrors the government schema field names: `Taker`, `Issuer`, `ServiceExport`, `Replacement` in `src/dps.ts`; XML tags such as `nNFSe`, `dhProc`, `vServ`, `chSubstda` appear verbatim in code.
- Use `type` imports inline with `verbatimModuleSyntax` enabled: `import { createNotas, type Config, type Gov } from './notas'` (see `src/notas.test.ts`, `src/index.ts`).
- Prefer `interface` for object shapes that are implemented or extended; use `type` for unions and mapped results: `export type GovResult = { reached: true; ... } | { reached: false; ... }` in `src/notas.ts`.
- Use discriminated results where the outcome is one of several shapes (`reached: true|false`, `'not-found' | 'not-ours' | 'unreachable' | {accessKey}`). Narrow with `typeof found === 'object'` or `=== 'unreachable'` as in `src/notas.ts`.
- `as const satisfies` for typed constant tables: `hosts` in `src/dps.ts`.
- `noUncheckedIndexedAccess` is on (`tsconfig.json`), so indexed access returns `T | undefined`. Handle it with `?? ''` or `?.`, e.g. `fake.sent[0] ?? ''` in tests and `match(...)?.[1]` in `src/dps.ts`.

## Language

- Code identifiers and most code comments are in English.
- Domain identifiers, XML field names, user-facing HTTP error messages, and the public documentation are in Portuguese: `'taker.name: required'` and `'Link inválido.'` in `src/request.ts` and `src/index.ts`; `docs/*.md` and `README.md` are Portuguese.
- Some comments in `wrangler.jsonc` and `scripts/upload-certificate.mjs` are in Portuguese. Follow the language of the surrounding file.
- Error messages returned to API clients use a `field.path: expectation` shape: `'taker.abroad.nif: up to 40 characters'`, `'replaces.id: nota not found'`, `'reasonCode: 1, 2 or 9'`. Keep this shape for new validation errors.

## Code Style

**Formatting:**
- No formatter config is committed (no Prettier, Biome, or `.editorconfig`). Style is consistent by convention:
  - 2-space indentation.
  - No semicolons (`src/*.ts` contains none at statement ends).
  - Single quotes for strings; template literals for interpolation.
  - Trailing commas in multi-line objects, arrays, and parameter lists.
  - No parentheses around single arrow parameters in most places (`(error) => ...`, `(json) => ...`), but the code is not strict about this; match the surrounding file.
- Lines are long in practice: about 70 lines in `src/*.ts` exceed 140 characters, and the longest is about 300. Break a line only when it hurts readability; do not wrap to a fixed width.

**Linting:**
- No ESLint or Biome config. Type checking is the enforced gate: `pnpm run typecheck` runs `tsc --noEmit` with `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and `isolatedModules` (`tsconfig.json`).
- `tsconfig.json` includes only `src/`. `container/` and `scripts/` are plain JavaScript and are not type checked.
- `// @ts-expect-error` is used only to import the container's plain JS module into a TypeScript test (`src/sign.test.ts`). Do not add other suppressions.

## Import Organization

**Order (observed in `src/notas.ts`, `src/index.ts`, `src/danfse.ts`):**
1. Third-party packages: `hono`, `pdf-lib`, `uqr`, `@cloudflare/containers`, `vitest`.
2. Node built-ins use the `node:` prefix: `node:child_process`, `node:fs`, `node:os`, `node:path` (`src/dps.test.ts`, `src/sign.test.ts`).
3. Local modules with relative paths and no extension: `./dps`, `./notas`, `./repo`.

**Path Aliases:**
- None. `tsconfig.json` has no `paths`. Use relative imports.

**Other:**
- Barrel files are not used. Each module exports what callers need directly.
- Named exports are the default. The Worker entry point is the one `export default app` in `src/index.ts`; the Container class is a named export `GovClient`.
- Use `import.meta.dirname` for paths relative to the project root in tests and scripts (`src/dps.test.ts`, `scripts/upload-certificate.mjs`).

## Error Handling

**Domain errors:**
- Create HTTP-aware errors with `notaError(status, message)` from `src/notas.ts`. It returns an `Error` with a numeric `status`. Check with `isNotaError(error)`.
- Throw `notaError` for conditions the caller can fix: `notaError(404, 'nota not found')`, `notaError(409, 'nota is ${status}, not issued')`, `notaError(502, 'government did not answer; try again')`.
- `configFrom` in `src/config.ts` throws `notaError(500, ...)` with all problems joined by `; `.

**HTTP boundary:**
- A single `app.onError` in `src/index.ts` maps `isNotaError` errors to `{ error: message }` with the given status. Anything else is logged with `console.error('nfse: unexpected error', error)` and returned as `500 { error: 'internal error' }`. Do not leak stack traces.
- Input parsing returns a string on failure and the typed value on success, rather than throwing (`parseIssueRequest` in `src/request.ts` returns `IssueRequest | string`). The route then does `if (typeof request === 'string') return c.json({ error: request }, 400)`. Follow this pattern for new request parsers.
- Malformed JSON bodies are handled with `.json().catch(() => null)` and then rejected by the parser (`src/index.ts`).

**Government calls:**
- Never throw on a government answer. Return a `GovResult`: `{ reached: false, error }` when the network or container failed, or `{ reached: true, status, json }` otherwise.
- Convert the government's error list to `GovError[]` with `govErrors(status, json)` in `src/notas.ts`. It always returns at least one entry, including `HTTP <status>` when the body has no error list.
- Best-effort fallbacks are explicit: the DANFSe falls back to local rendering when the government service is down (`src/notas.ts`, `pdf`).

**Try/catch:**
- Use `try/catch` only at I/O boundaries: the container call in `createGov` (`src/index.ts`), the health check, and the container fetch. Convert to a value (`{ reached: false, error: String(error) }`) instead of rethrowing.

## Logging

**Framework:** `console` (no logging library).

**Patterns:**
- Prefix messages with the component name and a colon: `console.log('nfse: issue', {...})`, `console.log('nfse: cancel', {...})`, `console.error('nfse: unexpected error', error)`.
- Log structured context as the second argument (an object), not interpolated strings.
- Log identifiers and statuses, never certificate material, `API_TOKEN`, or the XML bodies. The existing logs carry `id`, `status`, `dps`, `errors`.
- Scripts print user messages in Portuguese with `console.log`, `console.warn`, `console.error` (`scripts/upload-certificate.mjs`).

## Comments

**When to Comment:**
- Document the *why* and the non-obvious rule, usually with the government rule or layout name. Examples: `// Rule E0242: a NIF needs the address abroad` (`src/request.ts`), `// dhEmi must not be after the government's clock; stay a bit behind ours.` (`src/notas.ts`), `// xmlsec1 1.3 looks keys up strictly` (`src/sign.test.ts`).
- Comments on exported functions and types are JSDoc-style `/** ... */` one-liners. Field-level docs appear on interface members: `/** Date the service was provided (YYYY-MM-DD, Brasília); defaults to today. */`.
- Do not narrate what the code does. Describe the constraint behind it.

**JSDoc/TSDoc:**
- Use `/** ... */` on exported functions, types, and non-obvious constants. Keep to one or two lines.
- Use `@param`/`@returns` only when they add something; the codebase does not use them.
- Put status-state documentation on the type it describes: the `NotaStatus` union documents each state in `src/notas.ts`.

## Function Design

**Size:** Factories can be long (`createNotas` in `src/notas.ts` is about 150 lines) because they hold closures over shared dependencies. Keep individual helper closures short, and extract a named helper (`findIssued`, `resolveReplacement`, `markReplaced`) when logic gets a second responsibility.

**Parameters:**
- Use a single options object for more than two related inputs: `createNotas({ repo, gov, config, now })`, `buildDps({ environment, issuer, ... })`, `renderDanfse(xml, { isCanceled })`.
- Inject dependencies through factory parameters rather than module imports. Clock is injected as `now: () => Date` so tests can fix time (`src/notas.ts`).
- Optional parameters default with `= ` in the signature: `collisions = 0`, `withXml = false`.

**Return Values:**
- Return domain objects directly. Use `Promise<T>` with `null` for "not found" (`get(id): Promise<Nota | null>`), not exceptions.
- Use a discriminated union for outcomes with more than one non-error meaning (see `findIssued` in `src/notas.ts`).
- Use `Object.assign(new Error(message), { status })` for typed errors (`notaError`).

**Immutability:**
- Update records by spreading into a new object and saving: `save(nota, changes)` returns `{ ...nota, ...changes, updatedAt }` in `src/notas.ts`. Do not mutate stored `Nota` objects.

## Module Design

**Exports:**
- Export interfaces for dependency contracts (`Repo`, `Gov`, `Config`, `Notas`) and export a factory that implements them (`createNotas`, `createD1Repo`, `createMemoryRepo`). Tests swap implementations.
- Infrastructure adapters live in one module each: D1 in `src/repo.ts`, government transport in `src/index.ts` (`createGov`), the signing and mTLS process in `container/`.

**Barrel Files:** Not used.

**Pure core, thin shell:**
- Business logic in `src/notas.ts`, `src/dps.ts`, `src/request.ts`, `src/config.ts`, `src/danfse.ts` takes data and returns data. It has no `fetch` or D1 calls.
- `src/index.ts` is the only module that touches Cloudflare bindings (`Env`, `DurableObjectState`, `D1Database`). Keep bindings out of the core modules.
- Environment variables are read through typed `IssuerVars` (`src/config.ts`), never via `process.env` in the Worker.

## Security-Sensitive Conventions

- Compare secrets with `timingSafeEqual` from `src/index.ts`, which uses `crypto.subtle.timingSafeEqual`. Do not use `===` for tokens or link signatures.
- Sign public links with HMAC via `linkSignature` in `src/index.ts`. Keep the 32-hex-character truncation there.
- Never read or print `.env`, `.dev.vars`, `*.pfx`, or secret values. `.gitignore` excludes `.dev.vars`, `.env`, `*.pfx`, `*.p12`, `*.pem`, `*.key`.
- Certificate material is delivered as Cloudflare secrets split into `CERT_PFX_B64_<n>` parts (`src/index.ts`, `scripts/upload-certificate.mjs`).

---

*Convention analysis: 2026-11-20*
