# Phase 2: Notas Panel - Discussion Log

> **Audit trail only.** Do not use this file as input to planning, research or execution agents.
> The decisions are captured in CONTEXT.md. This log keeps the alternatives that were considered.

**Date:** 2026-11-20
**Phase:** 02-notas-panel
**Areas discussed:** how the list loads, list columns and formatting, nota details, PDF and XML download

---

## How the list loads

| Question | Options | Selected |
|----------|---------|----------|
| How is the list built? | JS calls /v1 (rec.) / HTML built on the server / You decide | JS calls /v1 |
| Next page | "Carregar mais" button (rec.) / Pages in the URL | "Carregar mais" button |
| Status filter in the URL? | Yes, in the URL (rec.) / No, only on screen | Yes, in the URL |
| Page size | 50 (rec.) / 20 / 100 | **20** |

## List columns and formatting

| Question | Options | Selected |
|----------|---------|----------|
| Client | Name + CPF/CNPJ (rec.) / Name only | Name + CPF/CNPJ |
| Date | Creation date (rec.) / Issue date, else creation / Competence | **Competence** |
| Status | pt-BR label with emphasis (rec.) / Plain pt-BR label | Label with emphasis |
| Phone | Horizontal scrolling (rec.) / Stacked cards / You decide | **Stacked cards** |
| Number | NFS-e, else DPS (rec.) / Both always | NFS-e, else DPS |
| Competence not given | Use the creation date (rec.) / Show month/year | Use the creation date |
| Opening a nota | The row or card is a link (rec.) / "Ver" button | The row is a link |

## Nota details

| Question | Options | Selected |
|----------|---------|----------|
| Where | /admin/notas/:id page (rec.) / Panel on the same page | **Panel on the same page** |
| Format | Organized sections (rec.) / Organized + raw JSON / JSON only | Organized sections |
| Government errors | Highlighted box at the top (rec.) / Table in a section | Highlighted box |
| Notice for Pendente/Sem resposta | Yes, a short notice (rec.) / No | Yes, a short notice |
| How the panel opens | Modal `<dialog>` (rec.) / Row that expands | `<dialog>` |
| Direct link | Yes, in the URL hash (rec.) / No | Yes, in the hash |

## PDF and XML download

| Question | Options | Selected |
|----------|---------|----------|
| XML source | New /v1/notas/:id/xml route (rec.) / Signed links / ?xml=1 as a Blob | **Other: "Não preciso do xml"** |
| PDF | Open in a new tab (rec.) / Download directly | **Download directly** |
| Where | Only in the details (rec.) / In the list and the details | **In the list and the details** |
| When | Whenever there is an access key (rec.) / Only issued notas | Whenever there is an access key |
| What to do with PANEL-04 | Drop the XML from the requirement / Keep the XML through the signed link | **Drop the XML from the requirement** |

**Notes:** PANEL-04 in REQUIREMENTS.md and criterion 4 of Phase 2 in ROADMAP.md were changed to cover only the PDF.

## Claude's Discretion

- How the script is structured.
- The loading, empty and error states.
- What happens on a 401 in the middle of use.
- A tiebreak for the `createdAt` cursor.
- The formatting helpers.
- How the filter control looks.

## Deferred Ideas

- XML download in the panel.
- A retry button for pending notas (Phase 3).
- PANEL-05, PANEL-06 and PANEL-07, which are already tracked for v2.
