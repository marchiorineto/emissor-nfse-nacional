---
status: testing
phase: 03-nota-actions
source: [03-VERIFICATION.md]
started: 2026-11-22T20:20:00Z
updated: 2026-11-22T20:20:00Z
---

## Current Test

number: 1
name: Issue form under real Pico CSS
expected: |
  pt-BR errors under the right fields and nothing sent; a valid form lands on the nota details; the resubmit shows 'Esta nota já foi emitida com este id.'; a fresh form remembers service code, NBS and description but no client data; the form fits a phone with no sideways scroll.
awaiting: user response

## Tests

### 1. Issue form under real Pico CSS
How: open /admin, click Emitir nota, submit empty, submit a wrong CPF, issue a valid nota, reload /admin/emitir?id=<that id> and submit again, open a fresh form. Check desktop and phone width (PANEL_SMOKE_SHOTS=DIR gives emitir-wide.png and emitir-narrow.png).
expected: pt-BR errors under the right fields and nothing sent; a valid form lands on the nota details; the resubmit shows 'Esta nota já foi emitida com este id.'; a fresh form remembers service code, NBS and description but no client data; the form fits a phone with no sideways scroll.
result: [pending]

### 2. Cancel confirm step under real Pico CSS
How: click Cancelar in an Emitida row, change the reason, Voltar, reopen from the dialog, confirm; repeat with the list filtered by Emitida; view on a phone (cancel-wide.png, cancel-narrow.png).
expected: The section shows number, client and value; the confirm button is clearly red and distinct from Voltar; nothing happens until it is clicked; afterwards dialog and row say Cancelada (or the row leaves a filtered list); layout fits a phone.
result: [pending]

### 3. Duplicar, Tentar de novo and row actions
How: Duplicar on Emitida, Rejeitada, Cancelada and a taker-abroad nota; reload a duplicate form; submit one duplicate; Tentar de novo on a Pendente or Sem resposta nota; list at desktop and phone width (actions-wide.png, actions-narrow.png); read the new README subsection.
expected: Each duplicate opens filled with client, service and value, today's date and a new id (the abroad one says what was left out); reload keeps the id; the submitted duplicate is a new nota and the original is unchanged; Tentar de novo updates in place; PDF, Cancelar and Duplicar read clearly at both widths; README matches the panel.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
