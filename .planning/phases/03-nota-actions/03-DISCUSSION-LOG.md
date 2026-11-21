# Phase 3: Nota Actions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-21
**Phase:** 03-nota-actions
**Areas discussed:** Issue form, Id and resubmit, Cancel flow, Duplicate

---

## Issue form

| Question | Options | Selected |
|----------|---------|----------|
| Where the form opens | Dialog over the list (rec.) / Own page /admin/emitir / You decide | Own page /admin/emitir |
| Taker kinds | Brazil only, optional (rec.) / Brazil + abroad/export / Brazil required | Brazil only, optional |
| Service code, NBS, description | Plain fields, last values remembered (rec.) / Always empty / Fixed list in .env | Plain fields, last values remembered |
| Value and competence | R$ text + date defaulting to today (rec.) / R$ text + date left empty / You decide | R$ text + date defaulting to today |
| How it submits | JS fetch to POST /v1/notas (rec.) / Classic form POST to a server route | JS fetch to POST /v1/notas |

**Notes:** The user chose a separate page over the recommended dialog.

---

## Id and resubmit

| Question | Options | Selected |
|----------|---------|----------|
| Suggested id format | painel-AAAAMMDD-xxxxxx (rec.) / Random UUID / No prefix | painel-AAAAMMDD-xxxxxx |
| Keeping the id across a reload | Id in the URL (rec.) / sessionStorage draft / You decide | Id in the URL |
| Where the result shows | Go to /admin#nota=<id> (rec.) / Result on the form page | Go to /admin#nota=<id> |
| Retry for Pendente / Sem resposta | Yes, in the details dialog (rec.) / No, not now | Yes, in the details dialog |
| Id already issued with different data | Show as "already issued" (rec.) / Check before submit | Show as "already issued" |

---

## Cancel flow

| Question | Options | Selected |
|----------|---------|----------|
| Where Cancelar lives | Details dialog only (rec.) / Dialog + list row action | Dialog + list row action |
| Reason choice | Code select + text prefilled per code (rec.) / Code select + empty text / Code only | Code select + text prefilled per code |
| Confirmation | Cancel form + explicit confirm button (rec.) / Extra "Tem certeza?" / Type the NFS-e number | Cancel form + explicit confirm button |
| After sending | Refresh dialog and list row (rec.) / Reload the whole list | Refresh dialog and list row |
| Row action behavior | Opens the dialog in cancel mode (rec.) / Inline form in the row | Opens the dialog in cancel mode |

**Notes:** The user chose to add a row action as well as the dialog button.

---

## Duplicate

| Question | Options | Selected |
|----------|---------|----------|
| Which notas | Any status (rec.) / Only Emitida, Cancelada, Substituída | Any status |
| Fields carried over | All but id and competence (rec.) / Everything but id | All but id and competence |
| Where and how | Dialog + row, /admin/emitir?de=<id> (rec.) / Dialog only | Dialog + row, /admin/emitir?de=<id> |
| Sends replaces? | No, a separate nota (rec.) / Offer "substituir" | No, a separate nota |

---

## Claude's Discretion

- Splitting the code into modules.
- Browser validation and pt-BR mapping of the `/v1` 400 messages.
- CPF and CNPJ masks.
- The row layout with three actions.
- The suggested reason texts for codes 1 and 9.
- How a row updates in place.

## Deferred Ideas

- Takers abroad and the export group in the form.
- Replacement from the panel (PANEL-06).
- A government-side list through the ADN distribution feed, from a background research report delivered during this
  session.
- The government's DANFSe API was switched off on 03/08/2026 (NT 008 v1.02); the `pdf()` call always falls back, and
  is worth a quick task.
