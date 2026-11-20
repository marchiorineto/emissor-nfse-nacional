# Roadmap: Emissor de NFS-e Nacional

## Milestones

- 🚧 **v1.0 Painel administrativo** - Phases 1-3 (in progress)

## Overview

v1.0 adds a browser panel on top of the existing `/v1` API, so one administrator can manage notas without the Bearer
token. The work follows the dependency chain of the panel itself: first the password and the login session (the panel
cannot exist without a safe way in), then the read-only views that reuse `GET /v1/notas`, then the actions that change
fiscal state (issue, cancel, duplicate). The panel stays plain HTML served by the existing Hono server, with no build
step, and its text is in Brazilian Portuguese. External systems keep calling `/v1` with the Bearer token, unchanged.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Admin Password and Login** - Operator sets a hashed admin password with a script and logs in to a session-protected `/admin`
- [ ] **Phase 2: Notas Panel** - Logged-in admin lists, filters, opens and downloads notas
- [ ] **Phase 3: Nota Actions** - Logged-in admin issues, cancels and duplicates notas

## Phase Details

### Phase 1: Admin Password and Login
**Goal**: The operator can protect the install with an admin password and log in and out of the browser panel, while `/v1` keeps working with the Bearer token exactly as today.
**Depends on**: Nothing (first phase)
**Requirements**: PASS-01, PASS-02, PASS-03, PASS-04, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06
**Success Criteria** (what must be TRUE):
  1. Operator runs `pnpm run admin-password`, types the password twice without it being echoed, and `.env` then holds only a salted scrypt hash in `ADMIN_PASSWORD` with every other line kept (`.env` is created from `.env.example` when missing). If the two entries differ, are empty, or have fewer than 12 characters, the script exits with an error and `.env` is left unchanged.
  2. With `ADMIN_PASSWORD` empty, `/login` and `/admin` answer 404 and `/v1` accepts only the Bearer token, exactly as today.
  3. With a password set, the admin opens `/login`, enters it and lands on `/admin`; a wrong password shows an error that says nothing more than that it failed, and repeated failures from the same address are slowed down.
  4. A successful login sets an HttpOnly, SameSite=Strict session cookie (Secure over HTTPS) that expires after 12 hours; with it the browser can call the `/v1` routes, POST calls also need a CSRF token, and external systems' Bearer calls behave unchanged.
  5. The admin can log out, which ends the session, and visiting `/admin` without a valid session redirects to `/login`; running `pnpm run admin-password` again replaces the hash and every earlier session stops working.
**Plans:** 1/4 plans executed

Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Password module (`src/password.ts`) and `pnpm run admin-password` script writing a scrypt hash to `.env` (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 01-02-PLAN.md — Login, signed session cookie, `/admin` skeleton, logout, 404 when disabled (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 01-03-PLAN.md — Login hardening: per-IP 429 backoff, cross-site check, body limit, page security headers (wave 3)
- [ ] 01-04-PLAN.md — `/v1` and `/health` through the session cookie with CSRF, Bearer priority, startup notice, README (wave 3)
**UI hint**: yes

### Phase 2: Notas Panel
**Goal**: A logged-in admin can browse the notas and inspect and download any of them from `/admin`.
**Depends on**: Phase 1
**Requirements**: PANEL-01, PANEL-02, PANEL-03, PANEL-04
**Success Criteria** (what must be TRUE):
  1. `/admin` lists the notas newest first, each with date, client, value, DPS/NFS-e number and status, loaded from `GET /v1/notas` through the session cookie, with `API_TOKEN` never reaching the browser.
  2. The admin can filter the list by status and load the next page, and the filter stays applied while more notas load.
  3. The admin can open a nota and see all its details, including the government's errors when it was rejected.
  4. For an issued nota, the admin can download the PDF and the XML from the panel.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Nota Actions
**Goal**: A logged-in admin can issue, cancel and duplicate notas from the panel without ever causing a second nota for the same sale.
**Depends on**: Phase 2
**Requirements**: ACT-01, ACT-02, ACT-03
**Success Criteria** (what must be TRUE):
  1. The admin fills the issue form (id, client, service code, description, value, competence), submits it to `POST /v1/notas`, and sees the resulting nota, or the validation and government errors when it fails.
  2. Submitting the form again with the same `id` (double click, reload) shows the nota already issued instead of creating a second one.
  3. The admin can cancel an issued nota by choosing the reason and confirming; nothing is sent before the confirmation, and afterwards the panel shows the canceled status or the government's cancel errors.
  4. The admin can duplicate a nota, which opens the issue form filled with that nota's data and a new suggested `id`, and submitting it issues a separate nota.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Admin Password and Login | 1/4 | In Progress | - |
| 2. Notas Panel | 0/TBD | Not started | - |
| 3. Nota Actions | 0/TBD | Not started | - |
