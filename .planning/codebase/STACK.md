---
last_mapped_commit: 264a35fb540cd6c69d2106674bf69b3f88cd45d1
last_mapped_at: 2026-11-20
---
# Technology Stack

**Analysis Date:** 2026-11-20

## Languages

**Primary:**
- TypeScript (strict, ES2024 target) - Cloudflare Worker API and all business logic in `src/` (`src/index.ts`, `src/notas.ts`, `src/dps.ts`, `src/config.ts`, `src/repo.ts`, `src/request.ts`, `src/danfse.ts`; XML signing lives in `container/sign.mjs`)
- Configured by `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noEmit`; types from `worker-configuration.d.ts` and `node`)

**Secondary:**
- JavaScript (ESM, `.mjs`) - Government-facing container process in `container/server.mjs` and `container/sign.mjs`; certificate upload helper in `scripts/upload-certificate.mjs`
- SQL (SQLite dialect) - D1 schema in `migrations/0001_init.sql`
- XML / XSD - Fiscal documents validated against official schemas in `schemas/production/` and `schemas/restricted/`
- Markdown - Portuguese documentation in `README.md` and `docs/`

## Runtime

**Environment:**
- Cloudflare Workers runtime (workerd) for the API, `compatibility_date` `2026-11-01` in `wrangler.jsonc`
- Cloudflare Containers (Docker image, `node:24-alpine`) for the mTLS client in `container/Dockerfile`
- Node.js `>=22.12.0` required for local tooling (`engines` in `package.json`); CI uses Node 24 (`.github/workflows/test.yml`)
- Container runs `node --openssl-legacy-provider server.mjs` to read legacy RC2/3DES `.pfx` certificates
- `openssl` CLI installed in the container image (`apk add openssl`) and invoked via `execFileSync` in `container/server.mjs`

**Package Manager:**
- pnpm `11.15.1` (declared via `packageManager` in `package.json`)
- Workspace file: `pnpm-workspace.yaml` (`allowBuilds` for `esbuild` and `workerd`)
- Lockfile: present (`pnpm-lock.yaml`), CI uses `pnpm install --frozen-lockfile`

## Frameworks

**Core:**
- Hono `^4.13.18` - HTTP router and middleware for the Worker in `src/index.ts`
- Cloudflare `@cloudflare/containers` `^0.3.7` - `Container` base class for `GovClient` in `src/index.ts`
- Node `http` and `https` modules (inside the container only) - `container/server.mjs`

**Testing:**
- Vitest `^5.1.0` - test runner, run with `pnpm test` (`vitest run`); tests in `src/*.test.ts`
- External CLI tools used by tests: `xmllint` (XSD validation, `src/dps.test.ts`) and `xmlsec1` (signature checks, `src/sign.test.ts`)

**Build/Dev:**
- Wrangler `^4.160.1` - dev, deploy, D1 migrations, secrets, type generation (`pnpm dev`, `pnpm deploy`, `pnpm migrate`, `pnpm types`)
- TypeScript `^7.0.2` - type checking only (`pnpm typecheck`, `tsc --noEmit`); Wrangler performs bundling
- Docker - builds the container image during `wrangler deploy` / `wrangler dev`

## Key Dependencies

**Critical:**
- `hono` `^4.13.18` - Routing, `c.json`, bearer-token middleware (`app.use('/v1/*', requireToken)` in `src/index.ts`)
- `@cloudflare/containers` `^0.3.7` - Runs the government client as a Durable Object-backed container (`GovClient` in `src/index.ts`)
- `pdf-lib` `^1.17.1` - Generates the DANFSe PDF fallback when the government PDF is unavailable (`src/danfse.ts`)
- `uqr` `^0.1.3` - QR code generation for the public consultation link on the DANFSe (`src/danfse.ts`)

**Dev / test:**
- `@types/node` `^26.6.6` - Node typings for `tsconfig` `types`
- `typescript` `^7.0.2`
- `vitest` `^5.1.0`
- `wrangler` `^4.160.1`

**Infrastructure (no npm package; system or platform):**
- `openssl` - PKCS#12 parsing and key extraction in the container (`container/server.mjs`)
- `xmllint` / `xmlsec1` - test-time validation (CI installs `libxml2-utils xmlsec1`)
- Node `node:crypto` - RSA-SHA256 XMLDSig signing in `container/sign.mjs` (`createSign`, `createHash`)
- Node `node:zlib` - gzip/base64 of XML payloads exchanged with the government (`container/server.mjs`)
- Web Crypto (`crypto.subtle`) - HMAC-SHA256 for public PDF/XML link signatures in `src/index.ts`

## Configuration

**Environment:**
- Non-secret settings are declared in `wrangler.jsonc` under `vars`: `NFSE_ENVIRONMENT` (`restricted` or `production`), `ISSUER_CNPJ`, `ISSUER_CITY_CODE`, `ISSUER_MUNICIPAL_SUBSCRIPTION`, `ISSUER_SIMPLES_OPTION`, `ISSUER_SIMPLES_APURATION`, `ISSUER_SIMPLES_TOTAL_TAX_PERCENT`, `DPS_SERIES`
- Secrets (set with `wrangler secret put`, never in the repo): `API_TOKEN`, `CERT_PASSWORD`, `CERT_PFX_B64_1` ... `CERT_PFX_B64_N` (base64 `.pfx` split into 5 kB chunks)
- Local development secrets: `.dev.vars` (gitignored), template `.dev.vars.example` lists `API_TOKEN`, `CERT_PASSWORD`, `CERT_PFX_B64_1`
- Config validation: `src/config.ts` (`configFrom`, `configProblems`) reads the issuer variables and reports problems through `/health?deep=1`
- Typed bindings generated into `worker-configuration.d.ts` via `pnpm run types`

**Bindings (`wrangler.jsonc`):**
- D1 database `DB` (`emissor-nfse`, migrations in `migrations/`)
- Durable Object `GOV` bound to class `GovClient` (SQLite-backed, migration tag `v1`)
- Container image `./container/Dockerfile`, `instance_type` `lite`, `max_instances` 3, `sleepAfter` 10 minutes (`src/index.ts`)
- Observability enabled (`observability.enabled: true`)

**Build:**
- `wrangler.jsonc` - Worker entry `src/index.ts`, container and D1 config
- `tsconfig.json` - type-check only
- `container/Dockerfile` - `node:24-alpine`, copies `server.mjs` and `sign.mjs`, exposes 8080
- `pnpm-workspace.yaml` - build allow-list

## Platform Requirements

**Development:**
- Node.js 22.12+ and pnpm (via `corepack enable`)
- Docker running (container image is built locally by Wrangler)
- Cloudflare account on the Workers Paid plan (containers)
- `xmllint` and `xmlsec1` for `pnpm test` (`brew install libxmlsec1` on macOS; `sudo apt install libxml2-utils xmlsec1` on Debian/Ubuntu)
- `openssl` available for the container (provided by image)

**Production:**
- Cloudflare Workers (`workers_dev: true` by default; custom domain optional via `routes` in `wrangler.jsonc`)
- Cloudflare D1 (`emissor-nfse`), applied with `pnpm run migrate`
- Cloudflare Containers, one container per certificate (`max_instances: 3`)
- Government endpoints: Sistema Nacional NFS-e API (see `INTEGRATIONS.md`)

---

*Stack analysis: 2026-11-20*
