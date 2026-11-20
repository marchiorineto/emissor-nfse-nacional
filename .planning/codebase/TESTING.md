---
last_mapped_commit: 264a35fb540cd6c69d2106674bf69b3f88cd45d1
last_mapped_at: 2026-11-20
---
# Testing Patterns

**Analysis Date:** 2026-11-20

## Test Framework

**Runner:**
- Vitest `^5.1.0` (devDependency in `package.json`).
- Config: no `vitest.config.*` or `vite.config.*` file. Vitest defaults apply. `src/**/*.test.ts` are picked up automatically.
- Runtime: Node. The CI workflow uses Node 24 (`.github/workflows/test.yml`); `package.json` requires `>=22.12.0`.

**Assertion Library:**
- Vitest built-in `expect`, with matchers `toMatchObject`, `toEqual`, `toBe`, `toContain`, `toHaveLength`, `rejects.toMatchObject`, `expect.any`, `expect.stringMatching`.

**Test helpers in use:**
- `pdf-lib` (`PDFDocument`) to inspect generated PDFs in `src/danfse.test.ts`.
- `node:child_process` `execFileSync` to call external validators: `xmllint` against the official XSDs and `xmlsec1` to verify XML signatures.
- `openssl` to create a throwaway self-signed certificate in `src/sign.test.ts`.

**Run Commands:**
```bash
pnpm test                    # vitest run (all tests, single pass)
pnpm exec vitest             # watch mode (default when not using "run")
pnpm exec vitest run src/notas.test.ts   # one file
pnpm exec vitest -t "never issues twice" # one test by name
pnpm run typecheck           # tsc --noEmit; type checks src/ including test files
```

**External tools required for the full suite:**
- `xmllint` (package `libxml2-utils`) for `src/dps.test.ts` schema checks.
- `xmlsec1` (package `xmlsec1`) for `src/sign.test.ts` and signature checks in `src/dps.test.ts`.
- `openssl` for the signing tests.
- The CI job installs all three: `sudo apt-get install -y libxml2-utils xmlsec1` (openssl is preinstalled on the runner). Install them locally before running `pnpm test` or those tests fail.

**Coverage:** no coverage tool or script is configured. No `--coverage` command exists in `package.json`.

## Test File Organization

**Location:**
- Co-located with the module under test, in `src/`: `src/notas.ts` and `src/notas.test.ts`.
- There is no `tests/` or `__tests__/` directory.
- Container JS (`container/sign.mjs`) has no test file of its own; it is exercised through `src/sign.test.ts`.

**Naming:**
- `<module>.test.ts`. One test file per source module that has logic: `config`, `danfse`, `dps`, `notas`, `request`, `sign`.
- `src/index.ts`, `src/repo.ts`, and `container/server.mjs` have no direct tests. `createMemoryRepo` is defined in `src/repo.ts` and is used by the tests as a double.

**Structure:**
```
src/
  notas.ts
  notas.test.ts      # imports createNotas, Gov, Config; builds a fake Gov and memory repo
  dps.ts
  dps.test.ts        # builds DPS XML; validates with xmllint and xmlsec1
  request.ts
  request.test.ts
  ...
```

## Test Structure

**Suite Organization:**
Group by public function, then by behavior. Use `describe` for the function or feature and `it` for one behavior, phrased as an outcome in English (the Portuguese domain terms appear inside fixture strings):

```typescript
// src/notas.test.ts
describe('issue', () => {
  it('issues the nota and keeps the access key and number', async () => {
    const { notas, fake } = setup()
    const nota = await notas.issue(request())
    expect(nota).toMatchObject({ status: 'issued', dpsNumber: 1, accessKey: expect.stringMatching(/^\d{50}$/), nfseNumber: '2' })
    expect(xmlValue(fake.sent[0] ?? '', 'dCompet')).toBe('2026-11-10')
  })
})

describe('cancel', () => {
  it('refuses a nota that was never issued', async () => {
    // ...
    await expect(notas.cancel('missing', {})).rejects.toMatchObject({ status: 404 })
  })
})
```

**Patterns:**
- **Setup helper:** a `setup()` function returns the fixtures for one test (`src/notas.test.ts`). It builds fresh repo and fake gov per call; no `beforeEach` is used there.
- **Request builder with overrides:** `const request = (overrides: Partial<IssueRequest> = {}): IssueRequest => ({ ...defaults, ...overrides })`. Use it for every case and override only the field under test. Same pattern in `src/config.test.ts` (`vars(overrides)`), `src/dps.test.ts` (`input(overrides)`), and `src/danfse.test.ts` (`nfseXml(overrides)`).
- **Fixed clock:** pass `now: () => new Date('2026-11-12T15:00:00Z')` to the factory. Tests never depend on real time. Use an explicit fixed date for `issuedAt`/`competence` when building XML.
- **Scripted fakes:** `createFakeGov()` in `src/notas.test.ts` queues per-call answers in `sendScript` (`ok(400, ...)`, `'lose-after-issuing'`, `'unreachable'`). Push the scenario, then call the code under test. Use this for lost answers, duplicates, and refusals.
- **Mutating a fake mid-test:** overriding a method on the fake is accepted when a single case needs it: `fake.gov.sendEvent = async () => ok(400, {...})` (`src/notas.test.ts`), and `{ ...fake.gov, get: ... }` to wrap one method.
- **Simulating crashes:** write the stored state directly through the repo to reproduce a crash mid-flow: `await repo.save({ ...unknown, status: 'pending' })` (`src/notas.test.ts`).
- **Test names carry the business rule:** names state the guarantee ("never issues twice for the same id", "keeps the rejection, and a corrected retry reuses the DPS number"). Keep that style.

**Assertion style:**
- Prefer `toMatchObject` for partial shape checks on domain objects.
- Use `expect.any(String)`, `expect.stringMatching(...)` for generated values (timestamps, access keys).
- Check XML by value with `xmlValue(xml, 'tag')` from `src/dps.ts`, or by substring with `toContain(...)` for exact fragments like `<subst>...</subst>`.
- Use `rejects.toMatchObject({ status: 409 })` for thrown `notaError` values.
- Use `toBe` on decoded PDF text: `new TextDecoder().decode(pdf.slice(0, 5))` equals `'%PDF-'`.

## Mocking

**Framework:** no mocking library (`vi.mock`, `vi.fn`, `vi.spyOn`) is used. The project uses hand-written doubles that implement the module's exported interfaces.

**Patterns:**
```typescript
// src/notas.test.ts: a double implementing the Gov interface
const gov: Gov = {
  sendDps: async (_host, xml) => { /* scripted answer */ },
  sendEvent: async (_host, accessKey) => { /* ... */ },
  get: async (_host, path) => { /* keyed by path */ },
}
```

```typescript
// src/notas.test.ts: wrapping one method of a double
const gov: Gov = { ...fake.gov, get: async (host, path) => (path.startsWith('/danfse/') ? ok(503, {...}) : fake.gov.get(host, path)) }
```

**What to Mock:**
- The government transport. Everything that would cross the `Gov` interface (`sendDps`, `sendEvent`, `get`) is replaced by `createFakeGov()` or a per-test override.
- The persistence layer. Use `createMemoryRepo()` from `src/repo.ts`, not a D1 mock.
- The clock. Inject `now`.

**What NOT to Mock:**
- Schema and signature validation. `src/dps.test.ts` runs real `xmllint` against `schemas/production/` and `schemas/restricted/`, and `src/sign.test.ts` runs real `xmlsec1`. A mock here would hide the failures that matter.
- XML generation. Tests build real DPS and NFS-e XML through `buildDps` and `buildCancellation` (`src/dps.ts`).
- PDF output. `src/danfse.test.ts` parses the generated PDF with `pdf-lib`.

**Real signing in tests:**
- `src/sign.test.ts` creates a throwaway RSA key and certificate with `openssl req -x509 -newkey rsa:2048 -nodes ...` in a `mkdtemp` directory. Never use the project's certificate or secrets in tests.
- `--lax-key-search` is added only for xmlsec1 1.3+; the test detects the version (`LAX_KEY_SEARCH` in `src/sign.test.ts`).

## Fixtures and Factories

**Test Data:**
- Inline per-file factories, not shared fixture files. Each test file defines its own `config`, `issuer`, `request`/`input`/`vars`/`nfseXml` builders at the top.
- Realistic Brazilian values are used throughout: CNPJ `11222333000181`, IBGE city code `3550308`, CPF `12345678909`, service code `080201`, NBS code `115022000`, currency `220` (USD). Reuse these in new tests.
- Taker names include XML-sensitive characters on purpose (`'Maria & João <Silva>'`, `'Acme & Co'`) to verify escaping.
- Access keys are 50-digit strings: `'3'.repeat(50)`, or a generated key padded with `padStart(50, '4')`.

**Location:**
- Defined at the top of each `*.test.ts` file. No shared `fixtures/` directory exists.
- Schema files used as validators are in `schemas/production/` and `schemas/restricted/`.
- Temporary files go to `mkdtempSync(join(tmpdir(), 'nfse-...-'))` at module load (`src/dps.test.ts`, `src/sign.test.ts`).

## Coverage

**Requirements:** None enforced. No threshold in config and no coverage step in `.github/workflows/test.yml`.

**View Coverage:**
```bash
pnpm exec vitest run --coverage   # not wired up; needs a coverage provider installed first
```

## Test Types

**Unit Tests:**
- Most tests. Pure functions and factories with doubles: `src/config.test.ts`, `src/request.test.ts`, `src/notas.test.ts`.
- Scope: validation rules, state transitions (`pending` → `unknown` → `issued` / `rejected` / `canceled` / `replaced`), idempotency by request `id`, DPS number reuse and collision handling.

**Integration-style Tests:**
- `src/dps.test.ts` validates generated XML against the official XSDs with `xmllint`.
- `src/sign.test.ts` signs with the container's `signXml` and verifies with `xmlsec1`, an independent implementation.
- `src/danfse.test.ts` renders a real PDF and checks it with `pdf-lib`.

**E2E Tests:**
- Not used. Nothing exercises the deployed Worker, the Cloudflare container, D1, or the live government endpoints. `pnpm run dev` (`wrangler dev`) and `pnpm run types` are manual.
- Checks against the government are done manually with `/health?deep=1` (`src/index.ts`) on the `restricted` environment.

## Common Patterns

**Async Testing:**
```typescript
it('resends with the same number when the lost DPS never reached the government', async () => {
  const { notas, fake } = setup()
  fake.sendScript.push('unreachable')
  const unknown = await notas.issue(request())
  expect(unknown.status).toBe('unknown')
  const issued = await notas.issue(request())
  expect(issued).toMatchObject({ status: 'issued', dpsNumber: unknown.dpsNumber })
})
```
Mark the test `async`, `await` each call, and assert after each step when the sequence matters.

**Error Testing:**
```typescript
await expect(notas.issue(request({ id: 'b', replaces: replaces('missing') }))).rejects.toMatchObject({ status: 404 })
```
Assert the `status` of `notaError`. Use `rejects.toMatchObject` for promise rejections; do not wrap in `try/catch`.

**Schema/Tool Error Testing:**
```typescript
const schemaErrors = (xml, environment, schema): string => {
  // writes the XML to a temp file; returns xmllint's stderr, or '' when valid
}
expect(schemaErrors(buildDps(input()).xml, 'production', 'DPS_v1.01.xsd')).toBe('')
```
Helpers that call external tools return `''` on success and the tool's message on failure, so `expect(...).toBe('')` prints the reason when it fails.

**Table-driven cases:**
- Use a `for` loop over values with a shared body when the rule is the same across inputs (`src/config.test.ts`: `for (const option of ['1', '2'])`).

## Adding a New Test

1. Create or extend `src/<module>.test.ts`, next to the module.
2. Copy the nearest file's builder (`request`, `input`, `vars`) and override only the field under test.
3. For government behavior, script the answer on `createFakeGov()` (`sendScript`) rather than writing a new fake.
4. For XML output, assert with `xmlValue`, and add an `xmllint` or `xmlsec1` check if the change touches the layout or signature.
5. Run `pnpm test` and `pnpm run typecheck`. Both run in CI and must pass.

---

*Testing analysis: 2026-11-20*
