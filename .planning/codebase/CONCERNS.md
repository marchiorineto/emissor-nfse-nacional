---
last_mapped_commit: 264a35fb540cd6c69d2106674bf69b3f88cd45d1
last_mapped_at: 2026-11-20
---
# Codebase Concerns

**Analysis Date:** 2026-11-20

## Tech Debt

**Two document layouts hard-coded in one builder:**
- Issue: `src/dps.ts` branches on `environment` in several places (`finNFSe` only in restricted; `cNBS` placed after `xDescServ` in production and before it in restricted; `tpAmb`). Production still runs layout 1.01 while restricted runs NT 009. The README says production moves to NT 009 "in the coming weeks" (see `docs/conformidade.md`, "O que vem pela frente").
- Files: `src/dps.ts` (`buildDps`, `LAYOUT_VERSION = '1.01'`), `container/server.mjs`, `schemas/production/` vs `schemas/restricted/`
- Impact: when production switches layouts, the production branch becomes the wrong one for the new schema and notas are rejected until the code is changed. The `schemas/production/` XSDs are still 1.01.
- Fix approach: move layout-specific ordering and fields behind one versioned builder (for example `buildDps(input, layout)`), add a test that validates both layouts against their XSDs, and retire the branch once production switches.

**Silent truncation of input text:**
- Issue: `text()` and `buildDps` slice values to the layout limits (`taker.name` 300, `email` 80, `description` 2000, `xMotivo` 255, `xLgr` 255) without telling the caller. `parseIssueRequest` checks only some limits (`taker.name` has no max check).
- Files: `src/dps.ts` (`text`, `buildDps`), `src/request.ts` (`parseTaker`)
- Impact: a long name or description is changed in the government record with no error.
- Fix approach: validate every field length in `src/request.ts` and return 400, as is already done for `phone` and `nif`.

**Known open gaps listed in the docs but not in code:**
- `ISSUER_SIMPLES_OPTION = "1"` is accepted in `src/config.ts`, but `totalTaxXml` in `src/dps.ts` still emits `indTotTrib`, which rule E0713 forbids for companies outside the Simples (`docs/conformidade.md`).
- `configProblems` accepts `DPS_SERIES` up to 5 digits (`/^\d{1,5}$/`), but the API reserves only 1 to 49999 (rule E0010).
- `taker.email` is not validated (`src/request.ts`); a malformed address gets rejected by the government (E0247).
- Files: `src/config.ts`, `src/dps.ts`, `src/request.ts`
- Fix approach: close each item in the code and turn the matching row of `docs/conformidade.md` into a test.

**Regex-based XML reading:**
- Issue: the government response and the notas are read with regular expressions instead of a parser: `xmlValue` in `src/dps.ts` (`<tag>([^<]*)</tag>`), `section` in `src/danfse.ts`, and the `NIF`/`vServ` checks in `src/notas.ts`. These match only the first occurrence, and they fail on attributes on the tag (`<xNome xml:lang="pt">`), on self-closing tags and on namespace prefixes.
- Files: `src/dps.ts` (`xmlValue`), `src/danfse.ts` (`section`, `field`), `src/notas.ts` (`findIssued`, `markIssued`)
- Impact: a valid government response with a different shape gives empty fields in the PDF and wrong `nNFSe`/`dhProc` values, with no error.
- Fix approach: use a small XML parser (for example `fast-xml-parser`, which works in Workers) for reading, and keep the regex code only for the signed-element extraction in `container/sign.mjs`.

**Duplicated environment and nota-status logic in the worker entry:**
- Issue: `src/index.ts` contains the HTTP routes, auth, link signing, container stub selection, and the government client adapter in one 199-line file. Routes have no dedicated tests.
- Files: `src/index.ts`
- Impact: the routing and auth rules are the most exposed code in the system and have the least coverage (see Test Coverage Gaps).
- Fix approach: move the government adapter (`createGov`, `govStub`) to `src/gov.ts` and the link signing to `src/links.ts`, and test the HTTP app with the Workers test helpers.

## Known Bugs

**`limit` query parameter can disable the page size limit:**
- Symptoms: `GET /v1/notas?limit=-1` returns every nota in the table. `limit=0` and non-numeric values silently become 50.
- Files: `src/index.ts` (line 156: `Math.min(Number(c.req.query('limit') ?? 50) || 50, MAX_LIST)`), `src/repo.ts` (`list` binds `LIMIT ?`)
- Trigger: `GET /v1/notas?limit=-1` with a valid bearer token. In SQLite a negative `LIMIT` means no limit.
- Workaround: none in code. Callers should send positive limits.
- Fix: clamp to `Math.min(Math.max(1, parsed), MAX_LIST)` and return 400 for values that are not integers.

**A nota can be marked `rejected` when the government actually accepted it:**
- Symptoms: an HTTP 2xx answer without `chaveAcesso` (or with an empty one) is recorded as `rejected` with code `HTTP 200`, although the government may have issued the NFS-e.
- Files: `src/notas.ts` (`send`: `if (result.status < 300 && accessKey)` falls through to `govErrors`, then `save(sending, { status: 'rejected', errors })`)
- Trigger: a government answer that is a success but lacks the access key (or a shape change in the response).
- Impact: the caller retries the same `id`. Because `rejected` starts a new request, a new DPS number is reserved, and the same sale can end up with two NFS-e.
- Fix approach: treat a 2xx answer without an access key as `unknown` (not `rejected`), and resolve it with `findIssued` on the next try.

**Concurrent requests with the same `id` can issue twice:**
- Symptoms: two simultaneous `POST /v1/notas` calls with the same `id` both see no existing nota, both reserve different DPS numbers, and both send to the government.
- Files: `src/notas.ts` (`issue`: read, then `repo.nextNumber()`, then `repo.save`), `src/repo.ts` (`save` is an upsert; `get` and `save` are separate statements)
- Trigger: a client retry while the first request is still waiting for the government (up to 30 s per call, see `TIMEOUT_MS` in `container/server.mjs`).
- Impact: double issuance of the same sale, which the README tells clients to avoid ("asking twice never issues twice").
- Fix approach: reserve the `id` atomically before the number, for example `INSERT INTO notas ... ON CONFLICT (id) DO NOTHING` followed by a read, or a Durable Object keyed by `id` that serializes `issue`.

**Duplicate-number recovery can attach another nota's access key:**
- Symptoms: after a DPS number collision (E0014), `findIssued` marks the nota `issued` with an NFS-e that belongs to someone else when the request has no `taker`.
- Files: `src/notas.ts` (`findIssued`: `sameTaker = nif ? ... : !taxId || nfseXml.includes(...)`)
- Trigger: a request without `taker` whose `valueCents` equals the value of another NFS-e on the same DPS id.
- Impact: wrong accessKey, wrong PDF and XML links, and a wrong status for the nota.
- Fix approach: compare `serviceCode`, `competence` and `description` as well, and require the DPS number to match the `nDPS` in the NFS-e.

**Replacement is not reconciled after a crash:**
- Symptoms: the government cancels the replaced NFS-e when the replacement is issued, but if the worker stops between the government's answer and `markReplaced`, the old nota stays `issued` locally.
- Files: `src/notas.ts` (`markReplaced` runs after `send`; the old nota is only updated in that call)
- Trigger: a crash or timeout after the replacement is accepted.
- Impact: `POST /v1/notas/:id/cancel` on the old nota will fail with the government's answer, and listings show a nota that the government no longer considers valid.
- Fix approach: call `markReplaced` whenever the replacement is found `issued` on any later `issue` call (already partly done) and also in a periodic reconciliation.

## Security Considerations

**Public link signatures are derived from the API token:**
- Risk: `linkSignature` in `src/index.ts` is an HMAC of the nota id, keyed by `links:${API_TOKEN}`. Links never expire, cannot be revoked one by one, and any holder of `API_TOKEN` can compute them. Rotating `API_TOKEN` to revoke access also breaks every link already sent to buyers.
- Files: `src/index.ts` (`linkSignature`, `linksOf`, `GET /notas/:id/:file`)
- Current mitigation: 128-bit truncated HMAC (`.slice(0, 32)` of hex), constant-time comparison (`timingSafeEqual`).
- Recommendations: use a separate secret (`LINK_KEY`) so token rotation does not change links, add an expiry or a per-nota random nonce stored in D1, and document how to revoke a link.

**Container HTTP server has no authentication and accepts arbitrary paths:**
- Risk: `container/server.mjs` listens on port 8080 with no check of the caller. It relies on the Durable Object being the only route to it. Its `POST /get` route sends the client certificate to any `host` and `path` it receives. `POST /event` puts `chave` into the URL path unchecked (`/SefinNacional/nfse/${chave}/eventos`).
- Files: `container/server.mjs` (routes `POST /get`, `POST /event`, `gov()`), `src/notas.ts` (`cancel` passes `nota.accessKey`)
- Current mitigation: the Worker only builds `sefin`/`adn` hosts from `src/dps.ts` (`hosts`) and the access key comes from a stored nota. Container ports are not exposed publicly by `wrangler.jsonc`.
- Recommendations: allow only the two known hosts and a path pattern (`^/SefinNacional/`, `^/danfse/`, `^/parametrizacao/`) and validate `chave` as 50 digits in `container/server.mjs`.

**Example environment file is tracked in git and lists secret names:**
- Risk: `.dev.vars.example` is committed. It names `API_TOKEN`, `CERT_PASSWORD` and `CERT_PFX_B64_1`. Only `.dev.vars` is ignored by `.gitignore`. If any value in the example is not an obvious placeholder, it is a leaked credential.
- Files: `.dev.vars.example`, `.gitignore`
- Current mitigation: none verified in this analysis. Values were not read.
- Recommendations: confirm every value in `.dev.vars.example` is a placeholder, rotate any that are real, and keep the example file with empty values.

**Certificate and password reach the container as environment variables:**
- Risk: `GovClient` (`src/index.ts`) copies `CERT_PFX_B64_*` and `CERT_PASSWORD` into the container environment. Anything that can read the container's environment (a debug shell, a crash dump) gets the private key material.
- Files: `src/index.ts` (`GovClient` constructor), `container/server.mjs` (reads `process.env`)
- Current mitigation: the values are Worker secrets and the container is private to the account.
- Recommendations: accept the material over the Durable Object's internal call once at start, or at least make sure `console.error` in `src/index.ts` never dumps the container's env.

**No rate limiting and no request size limit:**
- Risk: `/v1/*` and the public `/notas/:id/:file` routes have no rate limit. `c.req.json()` in `src/index.ts` reads any body size, and each request can start the container and call the government.
- Files: `src/index.ts` (all routes), `wrangler.jsonc` (no rate limiting rule)
- Current mitigation: bearer token on `/v1/*` and `/health`; 128-bit link signatures.
- Recommendations: add a Cloudflare rate limiting rule for `/v1/*` and `/notas/*`, and a body size check before `c.req.json()`.

**Unvalidated e-mail sent to the government:**
- Risk: the buyer's e-mail is used as the link destination by the caller but is not checked. A malformed value makes the government reject the nota (E0247), and the caller has no warning before the call.
- Files: `src/request.ts` (`parseTaker`)
- Current mitigation: documented as an open item in `docs/conformidade.md`.
- Recommendations: validate the e-mail format in `parseTaker`.

## Performance Bottlenecks

**`list` loads the full nota, including the signed XML, for every row:**
- Problem: `GET /v1/notas` selects the whole `data` JSON for up to 100 rows, and each `Nota` can contain `nfseXml` and `request` (several kilobytes each).
- Files: `src/repo.ts` (`list`, `get`), `src/index.ts` (`view` strips `nfseXml` only after parsing)
- Cause: `data` stores the whole record in one JSON column; the `status`/`created_at` columns are the only indexed fields.
- Improvement path: store `nfse_xml` in a separate table or column and select only the summary columns in `list`.

**Cold start of the container on every health check and after 10 minutes idle:**
- Problem: `GET /health` and the first `POST /v1/notas` after an idle period start a container (`sleepAfter = '10m'`, `src/index.ts`).
- Files: `src/index.ts` (`GovClient`, `/health`), `wrangler.jsonc` (`containers`, `instance_type: "lite"`)
- Cause: each certificate has its own container instance, and the container must start before the TLS call.
- Improvement path: the government call timeout (`TIMEOUT_MS = 30_000` in `container/server.mjs`) plus the cold start can exceed the Worker's wait; treat a timeout during cold start as `unknown` (already done) and keep a warm instance with a scheduled `/health` call if latency matters.

**Pagination by `created_at` alone:**
- Problem: `list` filters `created_at < ?` with no tie-breaker. Notas created in the same millisecond can be skipped or repeated between pages.
- Files: `src/repo.ts` (`list`), `migrations/0001_init.sql` (index `notas_status_created`)
- Cause: no unique secondary key in the ordering.
- Improvement path: order by `(created_at, id)` and use a compound cursor.

## Fragile Areas

**Canonical XML contract between the Worker and the signer:**
- Files: `src/dps.ts` (`buildDps`, `el`, `opt`), `container/sign.mjs` (`signXml`)
- Why fragile: `signXml` assumes the Worker output has no whitespace between tags, no self-closing tags, and a single `Id`-bearing element. It adds `xmlns` by string replacement and takes the first `<inf... Id="...">` through the last matching close tag. A change in `buildDps` (for example a pretty-printer, or a second `Id` element) produces a signature the government rejects, with no local error.
- Safe modification: keep `buildDps` output canonical, and add a test that signs the output and checks the digest with `xmlsec1` (the CI already installs it).
- Test coverage: `src/sign.test.ts` covers signing; the interaction with real `buildDps` output is only covered by the XSD tests.

**Duplicate definitions of the environment and the issuer:**
- Files: `src/config.ts` (`configProblems`, `configFrom`), `src/dps.ts` (`hosts`, `Environment`), `src/index.ts` (`/health` reads `c.env.NFSE_ENVIRONMENT` directly)
- Why fragile: `/health` uses `hosts[environment as Environment]` before validation, so an invalid value throws inside the `try` and returns a generic error instead of the config message.
- Safe modification: call `configProblems` first in every route that uses the environment.

**State machine spread over `issue` and `send`:**
- Files: `src/notas.ts` (`issue`, `send`, `findIssued`, `markIssued`, `markReplaced`)
- Why fragile: the statuses `pending`, `unknown`, `issued`, `rejected`, `canceled`, `replaced` are changed in several places, and recursion in `send` (up to `MAX_NUMBER_COLLISIONS`) re-saves the nota each time. The `Nota` record is stored as JSON, so older records keep their old shape.
- Safe modification: add a transition table and a test for each arc (for example `unknown` to `rejected`, `pending` to `issued`), and version the stored JSON.

**Free-form Portuguese error text is matched as data:**
- Files: `src/notas.ts` (`ALREADY_CANCELED = /j[aá] (foi |est[aá] )?cancelad|cancelamento.*j[aá]/i`, `DUPLICATE_DPS = 'E0014'`)
- Why fragile: a cancelled nota is recognized from the government's message text. A wording change in the government's answer turns an "already canceled" answer into a stored error, and the nota stays `issued` locally.
- Safe modification: prefer the government's error codes, and keep the regex only as a fallback with a test for each known message.

**Certificate rotation depends on container lifecycle:**
- Files: `src/index.ts` (`govStub`, `certificateParts`), `wrangler.jsonc` (`max_instances: 3`)
- Why fragile: each certificate change creates a new container and the old one sleeps only after 10 minutes. Three rotations in that window hit `max_instances`, and new requests fail.
- Safe modification: rotate the certificate at a low-traffic time, and check `GET /health` after `pnpm run certificate`.

## Scaling Limits

**One container per certificate, capped at three:**
- Current capacity: `max_instances: 3` and `instance_type: "lite"` in `wrangler.jsonc`.
- Limit: concurrent government calls are limited by the container's single Node process and a 30 s timeout per call (`container/server.mjs`).
- Scaling path: for more volume, raise `max_instances` after checking the account's container quota, or use a queue for the government calls.

**DPS numbering is a single counter:**
- Current capacity: one row in `counters` (`name = 'dps'`), series from `DPS_SERIES` (1 to 49999 per the API's range).
- Limit: the counter is global across all sales for one CNPJ, and it is incremented on every attempt, including failed ones (`repo.nextNumber()` in `src/notas.ts`). The series range is finite and gaps are not reused.
- Scaling path: nothing to scale now; watch the value of `counters.dps` against the series limit, and add an alert before the range runs out.

## Dependencies at Risk

**`pdf-lib`:**
- Risk: the library has been without a significant release for a long time (as of this analysis). It is used only for the fallback DANFSe in `src/danfse.ts`.
- Impact: PDF rendering stops working if it breaks on a new Workers runtime. The fallback is used when the government's DANFSe service does not answer.
- Migration plan: keep the government's DANFSe as the primary path (already done), and evaluate a maintained alternative only if the fallback is needed more often.

**Container base image not pinned:**
- Risk: `container/Dockerfile` uses `node:24-alpine` and `apk add openssl` without a version or digest. Builds can change without a code change.
- Impact: the TLS behavior (`--openssl-legacy-provider`) and the OpenSSL version used to read `.pfx` files can change silently.
- Migration plan: pin the image by digest and the Alpine `openssl` package version.

**`--openssl-legacy-provider` used globally:**
- Risk: the flag is set in `container/Dockerfile` and in `package.json` (`certificate` script) to read RC2/3DES `.pfx` files. It weakens the TLS default for the whole process.
- Impact: any TLS connection made by the container uses the legacy provider.
- Migration plan: re-issue the certificate in a modern format, then remove the flag.

## Missing Critical Features

**Certificate expiry alert:**
- Problem: `GET /health` reports `certNotAfter` (`container/server.mjs`), but nothing alerts before the certificate expires. Expiry stops all issuance.
- Blocks: unattended operation for a full year.

**Reconciliation of `unknown` and `pending` notas:**
- Problem: notas left in `unknown` or `pending` are fixed only when the caller retries the same `id` (`README.md`, "Nota parada em unknown"). There is no background job.
- Blocks: detecting lost answers automatically, and freeing reserved DPS numbers.

**IBS and CBS for companies in the Simples Nacional:**
- Problem: required from 1 January 2027 (`docs/conformidade.md`, `docs/quem-pode-usar.md`). The `IBSCBS` group is not built.
- Blocks: issuing ME/EPP notas after that date.

**Cancellation events beyond 101101:**
- Problem: only the cancellation event is implemented (`buildCancellation` in `src/dps.ts`). Other events listed in `docs/conformidade.md` (item 19) are not supported.
- Blocks: correction letters and similar events.

## Test Coverage Gaps

**HTTP layer and authentication:**
- What's not tested: routes, bearer token check, `timingSafeEqual`, link signatures, error mapping in `app.onError`.
- Files: `src/index.ts` (no test file exists)
- Risk: a regression in `requireToken` or the public link check would not be caught.
- Priority: High

**D1 repository:**
- What's not tested: `createD1Repo` in `src/repo.ts` (SQL, `ON CONFLICT`, `LIMIT`, `before` filter). Only `createMemoryRepo` is used by tests.
- Files: `src/repo.ts`, `migrations/0001_init.sql`
- Risk: the `limit` bug above and the pagination issue would not show in tests. The memory repo's `list` ignores `before`, so the two implementations already differ.
- Priority: High

**Concurrency in `issue`:**
- What's not tested: two simultaneous issues with the same `id`.
- Files: `src/notas.test.ts`
- Risk: the double-issuance bug above.
- Priority: High

**Container server:**
- What's not tested: `container/server.mjs` routes, path validation, error status mapping.
- Files: `container/server.mjs`, `container/sign.mjs` (signing is tested in `src/sign.test.ts`)
- Risk: the path and host issues above.
- Priority: Medium

**Certificate upload script:**
- What's not tested: `scripts/upload-certificate.mjs` (stale secret deletion, CNPJ mismatch warning).
- Files: `scripts/upload-certificate.mjs`
- Risk: a stale `CERT_PFX_B64_*` part could be left behind after a certificate change.
- Priority: Low

**Government response shapes:**
- What's not tested: responses without `chaveAcesso`, HTML error pages, and changed field names in the response.
- Files: `src/notas.ts`, `src/dps.ts` (`xmlValue`)
- Risk: the `rejected`-on-2xx bug above.
- Priority: Medium

---

*Concerns audit: 2026-11-20*
