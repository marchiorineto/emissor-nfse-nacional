---
phase: 01
review: 01-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "/panel.css test says \"panel headers\" but only asserts nosniff"
  - id: IN-01
    severity: info
    disposition: open
    title: "Card test regex-matches CSS text and checks only /login and the cross-site 403"
  - id: IN-02
    severity: info
    disposition: open
    title: "/panel.css served Cache-Control: no-store, refetched on every page"
  - id: prev-WR-01
    severity: warning
    disposition: open
    title: "Login body limit rejects passwords that the password policy accepts (carried forward, re-verified)"
  - id: prev-IN-01
    severity: info
    disposition: open
    title: "parseHash accepts scrypt parameters whose memory exceeds SCRYPT_MAXMEM (carried forward, not re-reviewed)"
  - id: prev-IN-02
    severity: info
    disposition: open
    title: "Throttle cap evicts by insertion order, including in-flight or blocked entries (carried forward, not re-reviewed)"
  - id: prev-IN-03
    severity: info
    disposition: open
    title: "admin-password rewrites .env in place, not atomically (carried forward, not re-reviewed)"
  - id: prev-IN-04
    severity: info
    disposition: open
    title: "The page-wide markup test's \"correct password\" entry is really a 429 page"
open: 8
total: 8
recorded: 2026-11-20T21:45:59.986Z
---

# Phase 01 code review disposition

Current rows come from the 01-06 re-review (diff base 549fa34). Rows prefixed `prev-` are the open findings of the earlier 01-05 review (commit abfbe66), carried forward because the re-review overwrote 01-REVIEW.md with only the new diff's findings.
