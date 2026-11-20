---
phase: 01
review: 01-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Login body limit rejects passwords that the password policy accepts (carried forward, re-verified)"
  - id: IN-01
    severity: info
    disposition: open
    title: "parseHash accepts scrypt parameters whose memory exceeds SCRYPT_MAXMEM (carried forward, not re-reviewed)"
  - id: IN-02
    severity: info
    disposition: open
    title: "Throttle cap evicts by insertion order, including in-flight or blocked entries (carried forward, not re-reviewed)"
  - id: IN-03
    severity: info
    disposition: open
    title: "admin-password rewrites .env in place, not atomically (carried forward, not re-reviewed)"
  - id: IN-04
    severity: info
    disposition: open
    title: "The page-wide markup test's \"correct password\" entry is really a 429 page"
open: 5
total: 5
recorded: 2026-11-20T21:08:26.395Z
---

# Phase 01: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
