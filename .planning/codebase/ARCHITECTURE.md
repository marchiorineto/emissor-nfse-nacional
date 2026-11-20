---
last_mapped_commit: 264a35fb540cd6c69d2106674bf69b3f88cd45d1
last_mapped_at: 2026-11-20
---
<!-- refreshed: 2026-11-20 -->
# Architecture

**Analysis Date:** 2026-11-20

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                  Client (sistema do vendedor, HTTP + Bearer)          │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ /v1/*  (requireToken), /notas/:id/*  (HMAC sig)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Cloudflare Worker — Hono app                                         │
│  `src/index.ts` (routes, auth, view/links, error mapping)            │
├───────────────────────┬──────────────────────────┬───────────────────┤
│  Parsing & config     │  Domain orchestration    │  Documents        │
│  `src/request.ts`     │  `src/notas.ts`          │  `src/dps.ts`     │
│  `src/config.ts`      │  (state machine, retry,  │  (XML build)      │
│                       │   replace, cancel)       │  `src/danfse.ts`  │
│                       │                          │  (PDF render)     │
└───────────────────────┴────────┬─────────────────┴───────────────────┘
                                 │ Repo (interface)        │ Gov (interface)
                                 ▼                         ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│  D1 (SQLite) `src/repo.ts`           │  │  Durable Object `GovClient`  │
│  table notas, counters               │  │  `src/index.ts` → container  │
│  `migrations/0001_init.sql`          │  │  `container/server.mjs`      │
└──────────────────────────────────────┘  │  signs (`container/sign.mjs`)│
                                          │  and calls gov over mTLS     │
                                          └──────────────┬───────────────┘
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │  sefin.* / adn.* (NFS-e      │
                                          │  Nacional, `src/dps.ts` hosts)│
                                          └──────────────────────────────┘
```

## Pattern Overview

**Overall:** Single-deployable serverless API with a functional core and thin adapters. Domain logic (`src/notas.ts`) is written against two injected interfaces (`Repo` and `Gov`), so the Worker wires in D1 and the container, and tests wire in an in-memory repo and fake gov.

**Key Characteristics:**
- One Cloudflare Worker (`src/index.ts`, entry in `wrangler.jsonc` `main`) hosts all HTTP routes; there is no separate backend service.
- Dependency injection by factory functions: `createNotas({ repo, gov, config, now })` in `src/notas.ts`, `createD1Repo(db)` in `src/repo.ts`, `createMemoryRepo()` in `src/repo.ts` (tests only).
- The only component that cannot run in a Worker is the mTLS client. It is isolated in a container (`container/`) reached through a Durable Object stub (`GOV` binding). The Worker never handles the private key.
- Documents are built as canonical XML strings in the Worker (`src/dps.ts`), signed in the container (`container/sign.mjs`), and validated only by external tooling (XSDs in `schemas/`, checked in CI via `.github/workflows/test.yml`).
- Persistence is a single JSON blob per nota (`notas.data`) plus a counter row, so the domain model (`Nota` in `src/notas.ts`) is the storage schema.
- Idempotency is keyed by the client's `id` (`IssueRequest.id`): asking twice returns the existing nota rather than issuing again.

## Layers

**HTTP / composition layer:**
- Purpose: Routing, auth, mapping domain results to HTTP status codes, building public links, assembling the Gov adapter.
- Location: `src/index.ts`
- Contains: Hono `app`, `requireToken` middleware, `GovClient` Durable Object class, `createGov` (adapter), `linkSignature`/`linksOf`/`view`, `STATUS_CODE` map.
- Depends on: `src/config.ts`, `src/notas.ts`, `src/repo.ts`, `src/request.ts`, `src/danfse.ts` (`publicLookupUrl`), `src/dps.ts` (`hosts`), `@cloudflare/containers`, `hono`.
- Used by: Cloudflare runtime only.

**Request validation layer:**
- Purpose: Turn untrusted JSON into a typed `IssueRequest` or a human-readable 400 message in Portuguese-style field messages (e.g. `'taker.name: required'`).
- Location: `src/request.ts`
- Contains: `parseIssueRequest` (exported), private `parseTaker`, `parseExport`, `parseReplaces`.
- Depends on: types from `src/dps.ts` and `src/notas.ts`.
- Used by: `POST /v1/notas` in `src/index.ts`.

**Configuration layer:**
- Purpose: Validate issuer vars from `wrangler.jsonc` and produce the `Config` used by the domain.
- Location: `src/config.ts`
- Contains: `configProblems` (returns a list of problems, also used by `GET /health`), `configFrom` (throws a 500 `notaError` when invalid).
- Depends on: `src/dps.ts` (`hosts`, `Issuer`), `src/notas.ts` (`notaError`, `Config`).
- Used by: `notasFor` in `src/index.ts`, `/health` in `src/index.ts`.

**Domain orchestration layer:**
- Purpose: The nota lifecycle: reserve DPS number, send, interpret the government answer, recover lost answers, replace and cancel.
- Location: `src/notas.ts`
- Contains: `createNotas` returning `Notas` (`issue`, `get`, `cancel`, `pdf`, `list`); internal `send` (recursive with collision retry), `findIssued`, `resolveReplacement`, `markReplaced`, `govErrors`.
- Depends on: `src/dps.ts` (`buildDps`, `buildCancellation`, `xmlValue`, `hosts`), `src/danfse.ts` (`renderDanfse`), and the injected `Repo`/`Gov`.
- Used by: `notasFor` in `src/index.ts`.

**Document layer:**
- Purpose: Pure construction of the government XML and of the PDF.
- Location: `src/dps.ts` (DPS and cancellation XML, Brasília time, XML escaping/unescaping), `src/danfse.ts` (PDF rendering with `pdf-lib` and a QR code from `uqr`).
- Depends on: `pdf-lib`, `uqr` for `danfse.ts`; nothing external for `dps.ts`.
- Used by: `src/notas.ts`, `src/index.ts` (`publicLookupUrl`).

**Persistence layer:**
- Purpose: Store notas and DPS counter in D1.
- Location: `src/repo.ts` (adapter), `migrations/0001_init.sql` (schema).
- Depends on: D1 binding `DB` (`wrangler.jsonc` `d1_databases`).
- Used by: `notasFor` in `src/index.ts`.

**Government transport layer:**
- Purpose: Sign XML and perform mTLS calls to the NFS-e Nacional API, which needs TLS renegotiation that Workers `fetch` cannot do.
- Location: Worker side is `createGov` and `govStub` in `src/index.ts`; container side is `container/server.mjs` (HTTP server on port 8080, routes `/health`, `/dps`, `/event`, `/get`) and `container/sign.mjs` (XMLDSig, RSA-SHA256, C14N).
- Depends on: `openssl` CLI in the container (`container/Dockerfile`, `node:24-alpine` + `openssl`), the certificate secrets `CERT_PFX_B64_*` and `CERT_PASSWORD`.
- Used by: `Gov` interface (`sendDps`, `sendEvent`, `get`) through `GovClient`.

**Operational scripts:**
- Purpose: Upload the A1 certificate as Worker secrets in chunks.
- Location: `scripts/upload-certificate.mjs` (run via `pnpm run certificate`, see `package.json`).
- Used by: Operator only; not part of request handling.

## Data Flow

### Primary Request Path: issue a nota (`POST /v1/notas`)

1. Bearer token checked by `requireToken` for `/v1/*` (`src/index.ts`).
2. Body parsed and validated by `parseIssueRequest` (`src/request.ts`); a string result becomes HTTP 400.
3. `notasFor(env).issue(request)` (`src/index.ts` → `src/notas.ts` `issue`):
   - Looks up `repo.get(request.id)`. An `issued` nota returns immediately (after `markReplaced`); `canceled`/`replaced` return as-is.
   - For a new id, `repo.nextNumber()` reserves a DPS number from the `counters` table (`src/repo.ts`), and the nota is saved with status `pending`.
4. `send` (`src/notas.ts`) builds the DPS XML with `buildDps` (`src/dps.ts`), with `issuedAt` shifted back 60 s (`CLOCK_SKEW_MS`), saves status `unknown`, then calls `gov.sendDps(sefin, xml)`.
5. `createGov` (`src/index.ts`) posts `{host, xml}` to the `GovClient` Durable Object stub (`govStub`, keyed by a hash of the certificate material so a new certificate gets a new container). The container signs and POSTs to `/SefinNacional/nfse` over mTLS (`container/server.mjs`).
6. Result mapping in `send`: `chaveAcesso` with status below 300 → `markIssued`; error list → `rejected`; `E0014` (duplicate DPS) → `findIssued` looks up the existing NFS-e and adopts it, or retries with a new number up to `MAX_NUMBER_COLLISIONS` (5); unreachable or 5xx → stays `unknown` for a later retry.
7. Response: `view(...)` adds public `links` (PDF, XML, government lookup), with status code from `STATUS_CODE` (`issued` 200, `rejected` 422, `pending`/`unknown` 202).

### Secondary Flow: cancellation (`POST /v1/notas/:id/cancel`)

1. `notas.cancel` requires status `issued` with an `accessKey` (otherwise 409).
2. `buildCancellation` (`src/dps.ts`) builds the event 101101 XML; `gov.sendEvent` posts it through the container to `/SefinNacional/nfse/{chave}/eventos`.
3. Success or an "already canceled" message marks `canceled`; other errors are stored in `cancelErrors` and the nota stays `issued`.

### Replacement flow

- `replaces` in the request (`src/request.ts` `parseReplaces`). `resolveReplacement` (`src/notas.ts`) converts a local `id` to an `accessKey`. After the new nota is issued, `markReplaced` sets the old nota to `replaced` with `replacedBy`.

### Public download flow (`GET /notas/:id/nfse.pdf|nfse.xml?sig=`)

1. HMAC signature check (`linkSignature`, keyed by `API_TOKEN`) with `timingSafeEqual` in `src/index.ts`.
2. The PDF comes from `notas.pdf` (`src/notas.ts`): the government DANFSe (`adn` host, `/danfse/{chave}`) when reachable, otherwise `renderDanfse` from `src/danfse.ts` on the stored `nfseXml`.

**State Management:**
- All state lives in D1, one row per nota (`notas.data` JSON, indexed by `status` and `created_at`). There is no in-memory cache across requests. Each request builds a new `Notas` via `notasFor` (`src/index.ts`).
- Container instances keep the certificate they started with; a per-certificate Durable Object (`GovClient`, `sleepAfter = '10m'`) isolates rotations.

## Key Abstractions

**`Nota` (state record):**
- Purpose: The full lifecycle record of one nota, persisted as JSON.
- Definition: `src/notas.ts` (`interface Nota`, `NotaStatus`).
- Pattern: Status machine `pending → unknown → issued | rejected`, `issued → canceled | replaced`. Transitions are only performed inside `createNotas` through `save`.

**`Repo` and `Gov` (ports):**
- Purpose: Decouple domain logic from D1 and from the container.
- Definitions: `src/notas.ts` (`interface Repo`, `interface Gov`, `GovResult` as a discriminated union on `reached`).
- Implementations: `createD1Repo` in `src/repo.ts`; `createMemoryRepo` in `src/repo.ts` (tests); `createGov` in `src/index.ts`; test fakes inside `src/notas.test.ts`.

**`Issuer` / `Config`:**
- Purpose: Issuer identity and environment that are constant per deployment.
- Definitions: `src/dps.ts` (`Issuer`), `src/notas.ts` (`Config`), built in `src/config.ts` (`configFrom`).

**`Taker` and `ServiceExport`:**
- Purpose: Domestic (CPF/CNPJ) and foreign (abroad, NIF or noNifReason) buyers, and export-of-services data.
- Definitions: `src/dps.ts` (`Taker`, `ForeignTaker`, `ForeignAddress`, `ServiceExport`).
- Validation: `src/request.ts` (`parseTaker`, `parseExport`).

**`GovError`:**
- Purpose: Normalised error from the government answer (`Codigo`/`Descricao`/`Complemento` or a fallback `HTTP <status>` code).
- Definition and builder: `src/notas.ts` (`govErrors`).

**Error model:**
- `notaError(status, message)` creates an `Error` with a `status`; `isNotaError` recognises it. Unknown errors become HTTP 500 `internal error` in `app.onError` (`src/index.ts`).

## Entry Points

**Worker HTTP entry:**
- Location: `src/index.ts` (`export default app`), configured by `wrangler.jsonc` `main`.
- Triggers: HTTP requests on `workers_dev` URL or a custom route (commented example in `wrangler.jsonc`).
- Responsibilities: Auth, routing, view composition.

**Durable Object / container entry:**
- Location: `src/index.ts` (`class GovClient extends Container`), and `container/server.mjs` (process entry, `CMD` in `container/Dockerfile`).
- Triggers: Calls from the Worker through the `GOV` binding.

**Operator entry points:**
- `pnpm run migrate` → `migrations/0001_init.sql` via wrangler D1.
- `pnpm run certificate <file.pfx>` → `scripts/upload-certificate.mjs`.
- `pnpm run dev` / `pnpm run deploy` → wrangler.
- `GET /health` in `src/index.ts`, `?deep=1` for a read-only government call.

## Architectural Constraints

- **Threading:** Single-threaded JavaScript on the Workers runtime (no worker threads). The container runs one Node process (`container/server.mjs`) that handles requests asynchronously; certificate parsing is synchronous at start (`loadCertificate` calls `execFileSync` for `openssl`).
- **Global state:** Module-level constants only in the Worker (`NOTA_STATUSES`, `MAX_LIST`, `STATUS_CODE` in `src/index.ts`). The container holds `certificate`, `pfx`, and `passphrase` as module-level values in `container/server.mjs`; a rotated certificate requires a new container instance, which is why `govStub` derives the instance name from a digest of the certificate material.
- **Concurrency:** Issuing for the same `id` concurrently is not serialised. Two simultaneous requests for a new id can each reserve a DPS number. The DPS number is protected from reuse by the counter but the nota row is written without a transaction or conditional update (`src/repo.ts` `save` is an upsert).
- **Circular imports:** None detected. Dependency direction: `index.ts` → `config.ts`, `notas.ts`, `repo.ts`, `request.ts`, `danfse.ts`, `dps.ts`; `notas.ts` → `dps.ts`, `danfse.ts`; `request.ts` → types only from `dps.ts`, `notas.ts`; `danfse.ts` → `dps.ts`.
- **Environment switch:** `NFSE_ENVIRONMENT` (`restricted` by default in `wrangler.jsonc`) selects the hosts in `src/dps.ts` (`hosts`) for both `sefin` and `adn`.
- **Layout version:** XML layout `1.01` and schema files under `schemas/production` and `schemas/restricted` must match the `LAYOUT_VERSION` constant in `src/dps.ts`.

## Anti-Patterns

### Recursive retry inside `send`

**What happens:** `send` in `src/notas.ts` calls itself with a new `dpsNumber` on `E0014` collisions, up to `MAX_NUMBER_COLLISIONS`.
**Why it's wrong:** Each retry rebuilds the XML and re-sends to the government; the retry count is bounded, but the control flow mixes state persistence and HTTP calls in one recursion that is hard to reason about when a Worker request times out mid-chain.
**Do this instead:** Keep the bounded loop, but persist each step before the next send (as it already does with `save(sending, ...)`), and add new retry branches as explicit cases in `send` rather than new recursive entry points.

### Logic in the container that should stay in the Worker

**What happens:** `container/server.mjs` only transports, but `signXml` in `container/sign.mjs` must reproduce canonical XML exactly as `src/dps.ts` writes it (the comment at the top of `sign.mjs` states this).
**Why it's wrong:** Any change to XML serialisation in `src/dps.ts` (whitespace, namespace placement, self-closing tags) silently breaks signatures, and the failure only appears at the government.
**Do this instead:** Change `src/dps.ts` and `container/sign.mjs` together and keep the `xmlsec1` checks in CI (`.github/workflows/test.yml`) and `src/sign.test.ts` green.

### Full-record JSON storage with status duplicated in columns

**What happens:** `src/repo.ts` writes `status` both in its own column and inside `data`, and `list` filters on the column while the record is read from `data`.
**Why it's wrong:** Any code path that updates `nota.status` without the column (only `save` writes both, so currently safe) would desynchronise filters from records.
**Do this instead:** Always go through `repo.save` (the only write path); do not add raw SQL updates to `notas` outside `src/repo.ts`.

## Error Handling

**Strategy:** Domain errors are thrown as `notaError(status, message)` and rendered as JSON `{ error }` by `app.onError`. Government failures are data, not exceptions: `GovResult` carries `reached` and `status`, and `send` decides the nota status from them.

**Patterns:**
- Unreachable or 5xx government answer keeps the nota `unknown` (never `rejected`), so a retry asks the government rather than re-issuing blindly (`src/notas.ts` `send`, `issue`).
- Lost-answer recovery: an `unknown` nota is resolved by `findIssued` on the next `issue` call (`src/notas.ts`).
- Container errors map to HTTP status in `container/server.mjs` (`error.status ?? 502`); 503 means the certificate is missing or unreadable.
- Unexpected errors are logged with `console.error('nfse: unexpected error', error)` and returned as 500 `internal error` (`src/index.ts`).

## Cross-Cutting Concerns

**Logging:** `console.log` with a `nfse:` prefix in `src/index.ts` (issue, cancel) and `console.error` for unexpected errors; `observability.enabled` in `wrangler.jsonc`.
**Validation:** Hand-written checks in `src/request.ts` and `src/config.ts`; no schema library. XSD validation is only in the test pipeline (`schemas/`).
**Authentication:** Bearer token `API_TOKEN` for `/v1/*` and `/health` (`requireToken` in `src/index.ts`, compared with `timingSafeEqual`). Public download links use HMAC-SHA256 over the nota id, keyed by `links:${API_TOKEN}` (`linkSignature`). The government client certificate is a secret read only by the container.

---

*Architecture analysis: 2026-11-20*
