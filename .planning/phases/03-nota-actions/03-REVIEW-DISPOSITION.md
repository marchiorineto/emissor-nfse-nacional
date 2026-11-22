---
phase: 03
review: 03-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Replacement path touches the replaced nota outside that nota's lock"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Duplicar and ?de= prefill bypass every length limit, so fiscal text is cut silently"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Prefill from ?de= overwrites what the user types while the source loads, and submit is only guarded by the disabled button"
  - id: IN-01
    severity: info
    disposition: open
    title: "`?de=` with a blank value skips service defaults and loads nothing"
  - id: IN-02
    severity: info
    disposition: open
    title: "`state` parameter in `confirmCancel` shadows the module-level `state`"
  - id: IN-03
    severity: info
    disposition: open
    title: "Redundant session check in `GET /admin/emitir`"
open: 6
total: 6
recorded: 2026-11-22T20:00:54.359Z
---

# Phase 03: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
