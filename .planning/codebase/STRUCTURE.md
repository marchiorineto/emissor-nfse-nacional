---
last_mapped_commit: 264a35fb540cd6c69d2106674bf69b3f88cd45d1
last_mapped_at: 2026-11-20
---
# Codebase Structure

**Analysis Date:** 2026-11-20

## Directory Layout

```
emissor-nfse-nacional/
├── src/                    # Worker source (TypeScript): routes, domain, XML, PDF, D1 adapter
│   ├── index.ts            # Hono app, routes, auth, GovClient Durable Object class (Worker entry)
│   ├── notas.ts            # Nota lifecycle orchestration (createNotas) and shared types
│   ├── dps.ts              # DPS and cancellation XML builders, hosts, Brasília time
│   ├── danfse.ts           # Local DANFSe PDF renderer (pdf-lib + uqr QR code)
│   ├── request.ts          # Validation of POST /v1/notas bodies
│   ├── config.ts           # Issuer vars validation and Config factory
│   ├── repo.ts             # D1 Repo adapter and in-memory Repo for tests
│   └── *.test.ts           # Vitest unit tests, one per module (co-located)
├── container/              # Node process run in a Cloudflare container (mTLS + XMLDSig)
│   ├── server.mjs          # HTTP server on :8080; routes /health, /dps, /event, /get
│   ├── sign.mjs            # XMLDSig signer (RSA-SHA256, C14N) used by server.mjs
│   └── Dockerfile          # node:24-alpine + openssl, legacy OpenSSL provider
├── scripts/                # Operator scripts (run with pnpm)
│   └── upload-certificate.mjs  # Uploads the A1 .pfx as CERT_PFX_B64_* secrets + CERT_PASSWORD
├── migrations/             # D1 SQL migrations (applied by wrangler)
│   └── 0001_init.sql       # notas and counters tables
├── schemas/                # Official NFS-e Nacional XSDs, layout 1.01 (reference only, used by CI)
│   ├── production/         # XSDs of the production environment
│   └── restricted/         # XSDs of the restricted (test) environment
├── docs/                   # Portuguese user documentation
│   ├── README.md           # Docs index
│   ├── conformidade.md     # Compliance notes
│   ├── municipios.md       # Municipality notes
│   ├── quem-pode-usar.md   # Who may use the emitter (Simples Nacional options)
│   ├── regras-municipais.md# Municipal rules
│   └── rejeicoes.md        # Government rejection codes
├── .github/workflows/
│   └── test.yml            # CI: typecheck, vitest, xmllint/xmlsec1 tooling
├── .planning/codebase/     # Generated codebase maps (this document set)
├── .claude/                # GSD tooling install (not project code; ignored by mapping)
├── wrangler.jsonc          # Worker config: bindings (D1 DB, GOV container, vars), routes
├── package.json            # Scripts (dev, deploy, migrate, certificate, typecheck, test)
├── pnpm-workspace.yaml     # pnpm workspace settings
├── pnpm-lock.yaml          # Locked dependencies
├── tsconfig.json           # TypeScript config (typecheck via tsc --noEmit)
├── worker-configuration.d.ts  # Generated Env/binding types (pnpm run types)
├── .dev.vars.example       # Template of local secrets for wrangler dev (no real values)
├── README.md               # Project overview and installation guide (Portuguese)
└── LICENSE                 # MIT
```

## Directory Purposes

**`src/`:**
- Purpose: All Worker code. Flat layout, no subfolders; one module per concern.
- Contains: Modules and their co-located `*.test.ts` files.
- Key files: `src/index.ts` (entry), `src/notas.ts` (domain core), `src/dps.ts` (government XML).

**`container/`:**
- Purpose: The only code that performs mTLS calls to the government and holds the private key at runtime.
- Contains: Plain `.mjs` files with no build step (`node --openssl-legacy-provider server.mjs` in `container/Dockerfile`).
- Key files: `container/server.mjs`, `container/sign.mjs`.
- Note: `container/` is copied into the image with `COPY server.mjs sign.mjs ./`. Any new file needed at runtime must be added to that `COPY` line.

**`scripts/`:**
- Purpose: One-off operator tooling, not imported by the Worker.
- Contains: `scripts/upload-certificate.mjs` (run via `pnpm run certificate`, with `--openssl-legacy-provider`).

**`migrations/`:**
- Purpose: Numbered D1 schema migrations applied by `pnpm run migrate` (`wrangler d1 migrations apply`), configured by `migrations_dir` in `wrangler.jsonc`.
- Contains: `0001_init.sql` only. New schema changes go in `migrations/0002_*.sql` with the next number.

**`schemas/`:**
- Purpose: Official XSDs (`DPS_v1.01.xsd`, `NFSe_v1.01.xsd`, `evento_v1.01.xsd`, `pedRegEvento_v1.01.xsd`, `CNC_v1.00.xsd`, plus the `tipos*` and `xmldsig-core-schema.xsd` dependencies). Not read by runtime code.
- Contains: Two parallel sets, `production/` and `restricted/`, whose content matches the environment in `src/dps.ts` `hosts`.
- Generated: No (provided by the government). Committed: Yes.

**`docs/`:**
- Purpose: User-facing documentation in Portuguese, linked from `README.md`.
- Contains: Markdown files only.

**`.github/workflows/`:**
- Purpose: CI. Runs on push to `main` and on pull requests (`.github/workflows/test.yml`), steps: `pnpm run typecheck`, `pnpm test`, with `xmlsec1` and `libxml2-utils` installed.

**`.planning/codebase/`:**
- Purpose: Architecture, stack and convention documents consumed by GSD commands.
- Generated: Yes (by `/gsd-map-codebase`). Committed: Expected to be committed.

**`.claude/`:**
- Purpose: GSD tooling installation.
- Not project code; excluded from this map.

## Key File Locations

**Entry Points:**
- `src/index.ts`: Worker HTTP entry (`export default app`) and `GovClient` Durable Object class.
- `container/server.mjs`: Container process entry.
- `scripts/upload-certificate.mjs`: Certificate upload entry.

**Configuration:**
- `wrangler.jsonc`: Worker, D1, container and Durable Object bindings; issuer `vars` with inline Portuguese documentation.
- `src/config.ts`: Validation of those vars at runtime.
- `.dev.vars.example`: Local development secrets template (`API_TOKEN`, `CERT_PFX_B64_*`, `CERT_PASSWORD`); the real `.dev.vars` is git-ignored.
- `tsconfig.json`: TypeScript compiler options.
- `pnpm-workspace.yaml`: pnpm workspace settings.

**Core Logic:**
- `src/notas.ts`: Nota lifecycle (issue, send, cancel, replace, PDF fallback).
- `src/dps.ts`: XML construction for DPS and cancellation; layout constants (`LAYOUT_VERSION`, `APP_VERSION`, `TAX_ID_CNPJ`).
- `src/request.ts`: Input validation for issuing.
- `src/repo.ts`: Persistence.
- `container/sign.mjs`: XMLDSig.

**Testing:**
- `src/*.test.ts`: Unit tests co-located with their module (`config`, `danfse`, `dps`, `notas`, `request`, `sign`).
- No test directory and no separate fixtures folder were found.

**Documentation:**
- `README.md`, `docs/*.md`, `schemas/README.md`.

## Naming Conventions

**Files:**
- TypeScript modules: lowercase single word, e.g. `src/notas.ts`, `src/dps.ts`, `src/repo.ts`.
- Tests: `<module>.test.ts` next to the module, e.g. `src/notas.test.ts`.
- Container and scripts: lowercase with hyphens for multiword names, e.g. `scripts/upload-certificate.mjs`; ESM `.mjs` for plain Node code.
- Migrations: `NNNN_description.sql`, e.g. `migrations/0001_init.sql`.
- Schemas: keep the government names and versions, e.g. `DPS_v1.01.xsd`.
- Documentation: lowercase hyphenated Portuguese names in `docs/`, e.g. `docs/quem-pode-usar.md`.

**Directories:**
- Lowercase single words: `src`, `container`, `scripts`, `migrations`, `schemas`, `docs`.

**Code identifiers:**
- Factories are `create*` (`createNotas`, `createD1Repo`, `createMemoryRepo`, `createGov`); pure helpers are `const` arrow functions; parse functions are `parse*` (`parseIssueRequest`, `parseTaker`).
- Constants in `SCREAMING_SNAKE_CASE` (`DPS_COUNTER`, `MAX_LIST`, `STATUS_CODE`, `CLOCK_SKEW_MS`).
- Government XML element names are kept verbatim in code (`infDPS`, `vServ`, `chaveAcesso`, `nNFSe`), and user-facing messages are in Portuguese-style field form (e.g. `'taker.taxId: a CPF or CNPJ ...'`).
- Environment variables and Worker vars: `UPPER_SNAKE_CASE` (`ISSUER_CNPJ`, `NFSE_ENVIRONMENT`, `CERT_PFX_B64_1`).

## Where to Add New Code

**New HTTP endpoint:**
- Route and auth wiring: `src/index.ts` (add under the `app.get`/`app.post` block, and `/v1/*` is already protected by `requireToken`).
- Input validation: a `parse*` function in `src/request.ts` (or a new module if it is not an issue request).
- Domain behaviour: a new method on `createNotas` in `src/notas.ts`, exposed through the `Notas` interface.
- Tests: `src/notas.test.ts` for domain behaviour, `src/request.test.ts` for validation.

**New nota state or transition:**
- Type: `NotaStatus` and `Nota` in `src/notas.ts`; status code mapping in `STATUS_CODE` (`src/index.ts`); list filter list `NOTA_STATUSES` (`src/index.ts`).
- Persistence: no schema change needed, since `data` holds the record; add a migration only for new columns or indexes.

**New government operation (XML document or call):**
- XML builder: `src/dps.ts` (follow `buildDps` and `buildCancellation`, canonical form, `el`/`opt` helpers).
- Signing: `container/sign.mjs` if the root element differs from `infDPS`/`infPedReg` (signing looks for an element with `Id`).
- Transport: a new route in `container/server.mjs` (`routes` object) and a matching method on the `Gov` interface in `src/notas.ts` and `createGov` in `src/index.ts`.
- Tests: `src/dps.test.ts`, `src/sign.test.ts`.

**New PDF or document rendering:**
- Implementation: `src/danfse.ts`; reuse `unescapeXml` and `xmlValue` from `src/dps.ts`.

**New issuer configuration var:**
- Declare in `wrangler.jsonc` `vars` (with a comment in Portuguese), add to `IssuerVars` and `configProblems` in `src/config.ts`, map into `Config` in `configFrom`, and document in `.dev.vars.example` if it is a secret.

**New persistence query:**
- `src/repo.ts` only (the `Repo` interface in `src/notas.ts` must be extended and `createMemoryRepo` updated for tests).

**New migration:**
- `migrations/0002_<description>.sql` (next number), applied with `pnpm run migrate`.

**Utilities:**
- Shared XML helpers: `src/dps.ts` (exported `xmlValue`, `unescapeXml`, `brasiliaDate`). There is no generic `utils` module.

## Special Directories

**`schemas/`:**
- Purpose: Official government XSDs for XML validation in CI.
- Generated: No.
- Committed: Yes.

**`worker-configuration.d.ts`:**
- Purpose: Generated `Env` type for bindings and vars.
- Generated: Yes, by `pnpm run types` (`wrangler types`).
- Committed: Yes.

**`.planning/codebase/`:**
- Purpose: Codebase maps for GSD.
- Generated: Yes.
- Committed: Expected.

**`.claude/`:**
- Purpose: GSD tooling.
- Generated: Yes (installer).
- Committed: Not part of project code.

---

*Structure analysis: 2026-11-20*
