---
phase: "01"
slug: "admin-password-and-login"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: "2026-11-20"
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register taken from the `<threat_model>` blocks of 01-01..01-04-PLAN.md; no extra threat flags in the SUMMARY files.
> Verified at ASVS L1 depth: the code was searched for each mitigation, and the full test suite passed (191 passed, 1 skipped).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| operator terminal/pipe → scripts/admin-password.mjs | Plaintext password must end in scrypt only | admin password (secret) |
| script → .env | Only persistent store; read by Node and Docker | scrypt hash (sensitive) |
| .env → server process | Stored hash parsed at login; must not cause unbounded work | scrypt hash |
| browser → POST /login | Untrusted, possibly automated form input reaches verifyPassword | password guess |
| browser cookie → server | `nfse_admin` value is attacker-controllable | session token |
| server HTML → browser | Pages must not carry secrets or unescaped values | CNPJ, environment, CSRF token |
| reverse proxy → server | X-Forwarded-For / -Proto / -Host | client address, scheme |
| CDN (jsDelivr) → browser | Serves Pico.css | stylesheet |
| browser (cookie) → /v1 and /health | Second credential reaches the API | session + CSRF token |
| external system (Bearer) → /v1 | Must behave exactly as before | API_TOKEN |
| operator → README / startup log | Guidance on restart and misconfiguration | operational guidance |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Information disclosure | scripts/admin-password.mjs | high | mitigate | Only `hashPassword` output written; input from hidden prompt or stdin, never argv/env (scripts/admin-password.mjs) | closed |
| T-01-02 | Information disclosure | .env permissions | medium | mitigate | `writeFileSync(..., { mode: 0o600 })` + `chmodSync(ENV_FILE, 0o600)` (scripts/admin-password.mjs) | closed |
| T-01-03 | Tampering | hash string in .env | medium | mitigate | base64url `$`-free format (src/password.ts hashPassword); `setVar` uses function replacement with flag `g` | closed |
| T-01-04 | Denial of service | src/password.ts parseHash/verifyPassword | medium | mitigate | `HASH_PATTERN` + N power of two in [2^10, 2^20], r,p ≤ 16, fixed salt/key lengths, `maxmem` 256 MiB, try/catch → false | closed |
| T-01-05 | Spoofing | weak admin password | medium | mitigate | `MIN_PASSWORD_LENGTH = 12`, `MAX_PASSWORD_LENGTH = 1024`, scrypt N=65536 r=8 p=2, 16-byte random salt | closed |
| T-01-06 | Tampering | partial .env write | low | mitigate | validatePassword + equality check run before the single writeFileSync | closed |
| T-01-07 | Spoofing | src/session.ts readSession | high | mitigate | HMAC-SHA256 over `session:<id>.<exp>`, `SESSION_PATTERN` regex, `timingSafeEqual` | closed |
| T-01-08 | Elevation of privilege | session lifetime | high | mitigate | readSession checks signed `exp` server-side: `Number(exp) * 1000 > nowMs` | closed |
| T-01-09 | Information disclosure | cookie theft by script | high | mitigate | `httpOnly: true` in setCookie; `hono/html` escaping; no `<script>` in pages; CSP `script-src 'self'` | closed |
| T-01-10 | Tampering | POST /logout cross-site | medium | mitigate | `sameSite: 'Strict'` + session-bound `csrfToken` compared with `timingSafeEqual` (src/admin.ts) | closed |
| T-01-11 | Information disclosure | API_TOKEN reuse/exposure | high | mitigate | `sessionKey(adminHash)` derives only from ADMIN_PASSWORD hash; pages render only CNPJ + environment | closed |
| T-01-12 | Information disclosure | login error message | low | mitigate | Single fixed message `Senha incorreta.` | closed |
| T-01-13 | Denial of service | scrypt on request path | medium | mitigate | Async `scrypt` callback API in `derive`; per-IP throttle (T-01-17) | closed |
| T-01-14 | Elevation of privilege | panel reachable while disabled | high | mitigate | `admin` undefined when ADMIN_PASSWORD empty (env.ts trims); `registerAdmin` called only `if (admin)` | closed |
| T-01-15 | Spoofing | copied cookie after logout | medium | accept | D-04: no revocation list, bounded by 12 h expiry; code comment in src/admin.ts | closed |
| T-01-16 | Information disclosure | cookie over plain HTTP | medium | mitigate | `secure: isHttps(url, PUBLIC_URL, X-Forwarded-Proto)` on set and delete | closed |
| T-01-17 | Spoofing | online guessing on POST /login | high | mitigate | `createLoginThrottle`: delay min(2^(n-1), 30) s, 429 + Retry-After before scrypt, in-flight mark per address | closed |
| T-01-18 | Spoofing | forged X-Forwarded-For dodging delay | medium | accept | D-09: no TRUST_PROXY; 12-char minimum + scrypt; `accepted risk (D-09)` comment on `clientIp` | closed |
| T-01-19 | Denial of service | unbounded throttle map | medium | mitigate | Prune at most once per 60 s, `THROTTLE_MAX_ENTRIES = 10_000` with oldest eviction, address cut to 64 chars | closed |
| T-01-20 | Denial of service | CPU/memory via scrypt floods | medium | mitigate | libuv pool bounds concurrency; one in-flight per address; `bodyLimit` 4 KB; 1024-code-point cap before scrypt. Residual (no global cap) per D-08 | closed |
| T-01-21 | Tampering | login CSRF | low | mitigate | `sameOriginLogin`: Sec-Fetch-Site first, Origin fallback, `null` refused → 403 | closed |
| T-01-22 | Spoofing | clickjacking /login, /admin | medium | mitigate | `PAGE_CSP` includes `frame-ancestors 'none'` on all panel routes | closed |
| T-01-23 | Tampering | compromised CDN Pico.css | medium | mitigate | `PICO_CSS_INTEGRITY` sha384 on pinned `@picocss/pico@2.1.1`; CSP `style-src https://cdn.jsdelivr.net`, `script-src 'self'` | closed |
| T-01-24 | Information disclosure | cached pages with CSRF token | low | mitigate | `pageHeaders` sets `Cache-Control: no-store` on /login, /logout, /admin/* | closed |
| T-01-25 | Tampering | cross-site writes to /v1 with cookie | high | mitigate | requireAuth: SameSite=Strict + `X-CSRF-Token` = `csrfToken(key, id)` compared in constant time on non-GET/HEAD (src/app.ts) | closed |
| T-01-26 | Elevation of privilege | wrong Bearer falling back to cookie | high | mitigate | `if (header !== undefined \|\| !admin)` runs only the Bearer branch when Authorization is present | closed |
| T-01-27 | Elevation of privilege | cookie honoured while panel off | high | mitigate | `admin` undefined when ADMIN_PASSWORD empty → cookie branch unreachable | closed |
| T-01-28 | Information disclosure | distinct 401 bodies | low | mitigate | Single `{ error: 'unauthorized' }` for all cookie failures; only CSRF failure is 403 | closed |
| T-01-29 | Elevation of privilege | session reach equal to token | low | accept | D-18: session has same reach as Bearer by design; single-admin panel | closed |
| T-01-30 | Repudiation / Spoofing | operator believes sessions ended without restart | medium | mitigate | Script prints restart message; README "Criar ou trocar a senha" section; `adminPanelNotice` at startup | closed |
| T-01-31 | Tampering | malformed ADMIN_PASSWORD | medium | mitigate | verifyPassword returns false on unparseable hash; `adminPanelNotice` warns `ADMIN_PASSWORD is not a valid hash` | closed |
| T-01-SC | Tampering | npm/pip/cargo installs | low | accept | No package installed in any plan (RESEARCH Package Legitimacy Audit) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01-01 | T-01-15 | Locked decision D-04: no server-side revocation list; a copied cookie stays valid until its 12 h signed expiry. Changing the password and restarting ends all sessions. | user decision D-04 (CONTEXT.md) | 2026-11-20 |
| AR-01-02 | T-01-18 | Locked decision D-09: no TRUST_PROXY setting, so with no proxy in front a client can rotate a fake X-Forwarded-For to dodge the delay. The 12-character minimum plus scrypt keep guessing impractical. | user decision D-09 (CONTEXT.md) | 2026-11-20 |
| AR-01-03 | T-01-29 | Decision D-18: the admin session has the same API reach as the Bearer token; the panel is single-admin. | user decision D-18 (CONTEXT.md) | 2026-11-20 |
| AR-01-04 | T-01-SC | No third-party package was installed in this phase; nothing to gate. | plan-time disposition | 2026-11-20 |
| AR-01-05 | T-01-20 (residual) | Decision D-08: no global login cap, since one would let an attacker lock the admin out; floods with a fresh forged address per request are bounded only by the libuv pool. | user decision D-08 (CONTEXT.md) | 2026-11-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 32 | 32 | 0 | gsd-secure-phase (orchestrator, ASVS L1 grep check; auditor skipped per short-circuit rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-20
