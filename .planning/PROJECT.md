# Emissor de NFS-e Nacional

## What This Is

A self-hosted NFS-e issuer that talks directly to the Sistema Nacional NFS-e API, with no intermediary and no per-nota
cost. It is a Node.js server with a SQLite database: the seller's system sends the sale data over an HTTP API and gets
back the authorized nota, its XML, PDF and signed links to send to the buyer. It serves Simples Nacional companies (ME,
EPP and MEI) providing services in their own city.

## Core Value

Every sale gets exactly one valid NFS-e: never issued twice, never lost, and recoverable when the government's answer
goes missing.

## Requirements

### Validated

<!-- Shipped and confirmed valuable (inferred from the existing codebase). -->

- ✓ Issue an NFS-e through `POST /v1/notas`, idempotent on the client's `id` — existing
- ✓ Recover lost government answers by looking up the DPS before resending — existing
- ✓ Cancel a nota (event 101101) through `POST /v1/notas/:id/cancel` — existing
- ✓ Replace an issued nota with a corrected one — existing
- ✓ DANFSe PDF from the government, with a generated fallback and QR code — existing
- ✓ Signed public links to the PDF and XML for the buyer's email — existing
- ✓ List notas by status with cursor pagination through `GET /v1/notas` — existing
- ✓ `/health` checks settings, certificate expiry and, with `?deep=1`, the city agreement — existing
- ✓ Runs as a plain Node.js server with SQLite and a Docker image (migrated from Cloudflare) — pre-v1.0
- ✓ Admin password set by a local script (`pnpm run admin-password`) and stored only as a scrypt hash in `.env` — Phase 1
- ✓ Password login opening a 12 h browser session to `/admin`, with `/v1` still on the Bearer token — Phase 1
- ✓ Admin panel lists, filters, opens and downloads notas (PDF) at `/admin` through the session cookie — Phase 2

### Active

- [ ] Admin panel to cancel, duplicate and issue notas through the existing `/v1` API (list, view and download shipped in Phase 2)

### Out of Scope

- Multiple admin users, roles or user management — one operator per install; the API token already covers systems
- Password reset by email — the operator has shell access and reruns the password script
- Editing an issued nota — fiscal documents cannot be edited; replacement already exists in the API
- A separate frontend build (React, bundler) — the panel must stay as simple to run as the server

## Context

- Brownfield: about 2,100 lines of TypeScript run directly by Node (type stripping), Hono on `@hono/node-server`,
  `node:sqlite`, `pdf-lib`, `uqr`. Tests with Vitest validate documents against the official XSDs and signatures with
  `xmlsec1`.
- The domain (`src/notas.ts`) depends only on the `Repo` and `Gov` interfaces; `src/app.ts` builds the HTTP routes
  from injected dependencies, which makes the routes testable.
- Settings live in `.env`; `pnpm run certificate` already writes secrets there.
- The codebase map in `.planning/codebase/` describes the pre-migration Cloudflare version and needs a refresh.
- Known issues from `CONCERNS.md`: `limit=-1` lifts the list cap; two paths can issue a nota twice (concurrent
  retries, a 2xx answer without an access key).
- Deadline outside this milestone: NT 009 layout and IBS/CBS become mandatory for Simples Nacional on 2027-01-01.
- Docs and user-facing text are in Brazilian Portuguese; code and comments in English.

## Constraints

- **Tech stack**: Node.js and Hono, no build step — the server runs TypeScript directly and must stay that way
- **Security**: the browser never holds `API_TOKEN`; the admin password is stored only as a hash
- **Compatibility**: external systems keep calling `/v1` with the Bearer token, unchanged
- **Dependencies**: prefer Node built-ins (`node:crypto` scrypt, HMAC) over new packages
- **Language**: admin UI in Brazilian Portuguese

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Plain Node.js server instead of Cloudflare Worker + container | Workers can't do the mTLS renegotiation; one process is simpler to run | ✓ Good |
| Keep SQLite (`node:sqlite`) with the D1 schema | The DPS counter and `id`→nota mapping need local state; D1 exports open as-is | ✓ Good |
| Certificate stored as base64 in `.env` | One place for secrets; tested with an 8 KB .pfx | ✓ Good |
| Admin panel calls `/v1` with an HttpOnly session cookie (CSRF-protected) | Reuses the existing API without exposing `API_TOKEN` to the browser | — Pending |
| Skip domain research for v1.0 | Small, well-understood scope over an existing API | — Pending |

## Current Milestone: v1.0 Painel administrativo

**Goal:** Let one administrator log in with a password and manage notas from the browser, using the existing `/v1` API.

**Target features:**
- `pnpm run admin-password` script that hashes a twice-entered password into `ADMIN_PASSWORD`
- `/login` and `/admin`, enabled only when `ADMIN_PASSWORD` is set
- Notas list with status; view, download, cancel, duplicate; issue form

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-21 after Phase 1 re-verification*
