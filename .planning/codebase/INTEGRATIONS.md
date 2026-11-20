---
last_mapped_commit: 264a35fb540cd6c69d2106674bf69b3f88cd45d1
last_mapped_at: 2026-11-20
---
# External Integrations

**Analysis Date:** 2026-11-20

## APIs & External Services

**Sistema Nacional NFS-e (Receita Federal / Governo Federal):**
- Purpose: Issue (DPS to NFS-e), query, and cancel municipal service invoices; fetch the official DANFSe PDF and municipal agreement parameters
- Hosts (`src/dps.ts`, `hosts`):
  - `restricted` (default, `NFSE_ENVIRONMENT`): `sefin.producaorestrita.nfse.gov.br` and `adn.producaorestrita.nfse.gov.br`
  - `production`: `sefin.nfse.gov.br` and `adn.nfse.gov.br`
- Endpoints used (all called from `src/notas.ts` and `src/index.ts` through the container):
  - `POST /SefinNacional/nfse` - submit a signed DPS (`sendDps`), receives the NFS-e
  - `POST /SefinNacional/nfse/{chave}/eventos` - submit a signed cancellation event (`sendEvent`)
  - `GET /SefinNacional/dps/{dpsId}` - look up a DPS (`src/notas.ts`)
  - `GET /SefinNacional/nfse/{accessKey}` - fetch an issued NFS-e
  - `GET /danfse/{accessKey}` (ADN host) - official DANFSe PDF; falls back to local rendering in `src/danfse.ts` when unavailable
  - `GET /parametrizacao/{ISSUER_CITY_CODE}/convenio` (ADN host) - municipal agreement check (`src/index.ts`, `/health`)
- Protocol: HTTPS with mutual TLS using the company's ICP-Brasil A1 certificate (client cert presented via TLS renegotiation, which Workers `fetch` cannot do; hence the container)
- Payloads: XML (`NFSe_v1.01.xsd`, `DPS_v1.01.xsd`, `evento_v1.01.xsd`, `pedRegEvento_v1.01.xsd`, namespace `http://www.sped.fazenda.gov.br/nfse`), gzip + base64 in fields named `*XmlGZipB64` (`container/server.mjs`, `decodeJson`)
- Auth: client certificate only (`pfx` / `passphrase` in `container/server.mjs`, `gov()`); no API key
- SDK/Client: none; raw `https.request` in `container/server.mjs`
- Schemas: `schemas/production/` and `schemas/restricted/` (official XSDs, used by tests via `xmllint`)
- Reference docs: `docs/README.md`, `docs/rejeicoes.md`, `docs/municipios.md`, `docs/regras-municipais.md`

**Public NFS-e consultation portal:**
- Purpose: Public link to verify an issued NFS-e, embedded as a QR code on the DANFSe
- URL: `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave={accessKey}` (`publicLookupUrl` in `src/danfse.ts`); also returned as `links.lookup` in API responses (`src/index.ts`)
- Auth: none (public)

**Digital signature (XMLDSig):**
- Purpose: Sign DPS (`infDPS`) and event (`infPedReg`) XML before submission
- Implementation: `container/sign.mjs`, RSA-SHA256, SHA-256 digests, canonicalization `http://www.w3.org/TR/2001/REC-xml-c14n-20010315`, enveloped-signature transform. No external service.

**Certificate Authorities:**
- Not integrated programmatically. The A1 e-CNPJ `.pfx` is supplied by the user and uploaded with `scripts/upload-certificate.mjs` (`pnpm run certificate <file.pfx>`).

## Data Storage

**Databases:**
- Cloudflare D1 (SQLite) database `emissor-nfse`
  - Binding: `DB` (`wrangler.jsonc`, `d1_databases`)
  - Migrations: `migrations/0001_init.sql` (tables `notas` and `counters`)
  - Client: raw prepared statements via the D1 binding in `src/repo.ts` (`createD1Repo`); no ORM
  - Notes: `notas.data` holds the JSON-serialized nota; DPS numbers come from an atomic `counters` row (`name = 'dps'`), upserted with `RETURNING value`
  - Apply migrations: `pnpm run migrate` (`wrangler d1 migrations apply emissor-nfse --remote`)

**Durable Objects (state for the mTLS client):**
- Durable Object namespace `GOV` -> class `GovClient` (SQLite-backed, `migrations` tag `v1` in `wrangler.jsonc`)
- Instance name derived from SHA-256 of certificate material (`govStub` in `src/index.ts`), so each certificate has its own container

**File Storage:**
- Local filesystem only for development and build: none at runtime
- PDFs and XMLs are not stored; the DANFSe is fetched or generated on demand (`src/danfse.ts`) and XML is kept in the nota record

**Caching:**
- None detected

## Authentication & Identity

**API consumers:**
- Bearer token: `Authorization: Bearer <API_TOKEN>` checked with timing-safe comparison (`requireToken`, `timingSafeEqual` in `src/index.ts`) on `/v1/*` and `/health`
- Public note links (`/notas/:id/nfse.pdf` and `nfse.xml`) are authenticated by an HMAC-SHA256 signature keyed with `links:${API_TOKEN}` (`linkSignature` in `src/index.ts`), truncated to 32 hex characters. Rotating `API_TOKEN` invalidates existing links.

**Issuer identity:**
- ICP-Brasil A1 certificate (e-CNPJ) stored as Worker secrets `CERT_PFX_B64_1..N` and `CERT_PASSWORD`; loaded into the container environment (`envVars` in `GovClient`, `src/index.ts`)
- Certificate is parsed at container start with `openssl pkcs12 -legacy` (`container/server.mjs`); `notAfter` is reported by `/health`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry or similar)

**Logs:**
- Cloudflare Workers observability (`observability.enabled: true` in `wrangler.jsonc`)
- Container errors surface through `/health?deep=1` (`container.error`, see `README.md` troubleshooting)

## CI/CD & Deployment

**Hosting:**
- Cloudflare Workers (API, D1, Durable Objects) and Cloudflare Containers, deployed with `pnpm run deploy` (`wrangler deploy`)

**CI Pipeline:**
- GitHub Actions, `.github/workflows/test.yml`
  - Triggers: push to `main`, all pull requests
  - Steps: `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7` (Node 24), apt install `libxml2-utils xmlsec1`, `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm test`
  - Permissions: `contents: read`
  - No deployment step in CI

## Environment Configuration

**Required env vars (`wrangler.jsonc` `vars`, validated by `src/config.ts`):**
- `NFSE_ENVIRONMENT` - `restricted` or `production`
- `ISSUER_CNPJ` - provider CNPJ
- `ISSUER_CITY_CODE` - 7-digit IBGE municipality code
- `ISSUER_MUNICIPAL_SUBSCRIPTION` - optional; required when the municipality uses the CNC (error E0116)
- `ISSUER_SIMPLES_OPTION` - `2` (MEI) or `3` (ME/EPP)
- `ISSUER_SIMPLES_APURATION` - `1`, `2`, or `3`
- `ISSUER_SIMPLES_TOTAL_TAX_PERCENT` - nominal Simples bracket rate, e.g. `6.00`
- `DPS_SERIES` - 1 to 49999

**Required secrets (Wrangler secrets, or `.dev.vars` locally):**
- `API_TOKEN` - bearer token for the API and link signing key
- `CERT_PASSWORD` - password of the A1 `.pfx`
- `CERT_PFX_B64_1` ... `CERT_PFX_B64_N` - base64 of the `.pfx`, chunked (Cloudflare secrets are capped at 5 kB)

**Secrets location:**
- Cloudflare Worker secrets (set via `pnpm wrangler secret put` and `scripts/upload-certificate.mjs`)
- Local development: `.dev.vars` (gitignored); template `.dev.vars.example`
- `.gitignore` excludes `.dev.vars`, `.env`, `*.pfx`, `*.p12`, `*.pem`, `*.key`

## Webhooks & Callbacks

**Incoming:**
- None. The API is pull-based: consumers call `POST /v1/notas`, `GET /v1/notas`, `GET /v1/notas/:id`, `GET /v1/notas/:id/pdf`, `POST /v1/notas/:id/cancel`, and `GET /health`. Public links `GET /notas/:id/nfse.pdf` and `GET /notas/:id/nfse.xml` are for end customers (`src/index.ts`).

**Outgoing:**
- None. No outbound webhooks or callbacks to consumers are implemented.
- Outbound calls are only to the Sistema Nacional NFS-e hosts listed above, made by the container.

---

*Integration audit: 2026-11-20*
