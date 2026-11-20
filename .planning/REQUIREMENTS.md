# Requirements: Emissor de NFS-e Nacional

**Defined:** 2026-11-20
**Core Value:** Every sale gets exactly one valid NFS-e: never issued twice, never lost, and recoverable when the government's answer goes missing.

## v1 Requirements

Requirements for milestone v1.0 (Painel administrativo). Each maps to roadmap phases.

### Admin password

- [ ] **PASS-01**: Operator can run `pnpm run admin-password`, which asks for the password twice without echoing it
- [ ] **PASS-02**: If the two entries differ (or are empty, or shorter than 12 characters), the script exits with an error and `.env` is left unchanged
- [ ] **PASS-03**: If they match, the script stores only a salted scrypt hash in `ADMIN_PASSWORD` in `.env`, creating `.env` from `.env.example` when missing and keeping all other lines
- [ ] **PASS-04**: Running the script again replaces the hash, and existing admin sessions stop working

### Authentication

- [ ] **AUTH-01**: When `ADMIN_PASSWORD` is empty, `/login` and `/admin` answer 404 and `/v1` accepts only the Bearer token, exactly as today
- [x] **AUTH-02**: Admin can open `/login`, enter the password, and land on `/admin` when it matches the hash
- [x] **AUTH-03**: A wrong password shows an error on `/login` without saying more, and repeated failures from the same address are slowed down
- [ ] **AUTH-04**: A successful login sets an HttpOnly, SameSite=Strict session cookie (Secure over HTTPS) that expires after 12 hours
- [ ] **AUTH-05**: With that cookie, the browser can call the `/v1` routes; write calls (POST) also need a CSRF token, and external systems keep using the Bearer token unchanged
- [x] **AUTH-06**: Admin can log out, which ends the session; visiting `/admin` without a valid session redirects to `/login`

### Notas panel

- [ ] **PANEL-01**: Admin sees the notas on `/admin`, newest first, with date, client, value, DPS/NFS-e number and status, loaded from `GET /v1/notas`
- [ ] **PANEL-02**: Admin can filter the list by status and load the next page
- [ ] **PANEL-03**: Admin can open a nota and see all its details, including the government's errors when it was rejected
- [ ] **PANEL-04**: Admin can download the PDF and the XML of an issued nota

### Nota actions

- [ ] **ACT-01**: Admin can issue a nota from a form (id, client, service code, description, value, competence) that posts to `POST /v1/notas`, and sees the result or the validation and government errors
- [ ] **ACT-02**: Admin can cancel an issued nota, choosing the reason, after a confirmation step, through `POST /v1/notas/:id/cancel`
- [ ] **ACT-03**: Admin can duplicate a nota, which opens the issue form filled with that nota's data and a new suggested `id`

## v2 Requirements

Deferred. Tracked but not in the current roadmap.

### Panel

- **PANEL-05**: Admin can search notas by client name or tax ID
- **PANEL-06**: Admin can replace an issued nota from the panel (the API already supports `replaces`)
- **PANEL-07**: Admin sees certificate expiry and `/health` status on the panel

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multiple admin users or roles | One operator per install; systems use the API token |
| Password reset by email | The operator has shell access and reruns `pnpm run admin-password` |
| Editing an issued nota | Fiscal documents can't be edited; replacement covers corrections |
| Frontend build step or framework (React, bundler) | The panel must stay as simple to run as the server |
| Exposing `API_TOKEN` to the browser | The session cookie replaces it for the panel |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PASS-01 | Phase 1 | Pending |
| PASS-02 | Phase 1 | Pending |
| PASS-03 | Phase 1 | Pending |
| PASS-04 | Phase 1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1 | Complete |
| PANEL-01 | Phase 2 | Pending |
| PANEL-02 | Phase 2 | Pending |
| PANEL-03 | Phase 2 | Pending |
| PANEL-04 | Phase 2 | Pending |
| ACT-01 | Phase 3 | Pending |
| ACT-02 | Phase 3 | Pending |
| ACT-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-11-20*
*Last updated: 2026-11-20 after roadmap creation*
