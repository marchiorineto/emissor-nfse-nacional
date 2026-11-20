---
status: testing
phase: 02-notas-panel
source: [02-VERIFICATION.md]
started: 2026-11-20T23:35:00Z
updated: 2026-11-20T23:35:00Z
---

## Current Test

number: 1
name: Open /admin in a real desktop browser and a 375 px window with the Pico CDN reachable, with notas in several states (Rejeitada with government errors, Emitida, Cancelada, Pendente or Sem resposta)
expected: |
  Ledger-like table on desktop; Rejeitada and Sem resposta bold, red, with a left accent; bordered cards on the phone with no sideways scroll; the dialog sits over the list with the red Erros na emissão box, notices, and readable sections
awaiting: user response

## Tests

### 1. Open /admin in a real desktop browser and a 375 px window with the Pico CDN reachable, with notas in several states (Rejeitada with government errors, Emitida, Cancelada, Pendente or Sem resposta)
expected: Ledger-like table on desktop; Rejeitada and Sem resposta bold, red, with a left accent; bordered cards on the phone with no sideways scroll; the dialog sits over the list with the red Erros na emissão box, notices, and readable sections
result: [pending]

### 2. In the operator's own browser: change the Situação filter, press Back, reload, click Carregar mais, click an Emitida row's PDF link, open a nota from its number, copy its URL into a new tab, close with Fechar / Esc / outside click / Back
expected: URL carries ?status=; list follows Back and reload; paging appends under the filter; the PDF saves as nfse-NUMBER.pdf with no new tab; the copied URL reopens the same nota; Back after closing the dialog feels acceptable (see IN-03 in 02-REVIEW.md: it takes two presses today)
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
