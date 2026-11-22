// The panel's browser module: reads GET /v1/notas with the session cookie and renders the list.
// Every API string reaches the DOM through textContent; nothing here ever parses markup or sets a style.
import {
  ALREADY_ISSUED_NOTICE,
  CANCEL_REASONS,
  canCancel,
  cancelProblem,
  cancelSuggestion,
  detailSections,
  errorBoxes,
  formatBrl,
  hasMore,
  isAlertStatus,
  listDate,
  listQuery,
  notaHash,
  numberCell,
  parseNotaFlags,
  parseNotaHash,
  parseStatus,
  pdfFilename,
  pdfHref,
  reasonProblem,
  statusLabel,
  statusNotice,
  statusSearch,
  takerCell,
} from './format.js'
import { pageApi } from './api.js'
import { errorSection, note, text } from './dom.js'
import { canRetry, duplicateHref, issueHints, issueProblem, retryBody } from './form.js'

const body = document.getElementById('notas-body')
const state = document.getElementById('notas-state')
const table = body.closest('table')
const select = document.getElementById('status')
const more = document.getElementById('more')
const dialog = document.getElementById('nota-dialog')
const dialogTitle = document.getElementById('nota-title')
const dialogStatus = document.getElementById('nota-status')
const dialogBody = document.getElementById('nota-body')
const dialogActions = document.getElementById('nota-actions')

/** The one door to /v1: the session cookie, the page's CSRF token on a write, and a 401 sending the browser to the login. */
const api = pageApi()

/** A table cell labelled with its column name, which the narrow-screen cards show through data-label. */
const cell = (label) => {
  const td = document.createElement('td')
  td.setAttribute('role', 'cell')
  td.dataset.label = label
  return td
}

/** One table row for a nota. */
const renderRow = (nota) => {
  const tr = document.createElement('tr')
  tr.setAttribute('role', 'row')
  tr.dataset.status = nota.status
  tr.dataset.id = nota.id

  tr.append(Object.assign(cell('Competência'), { textContent: listDate(nota) }))

  const taker = takerCell(nota.request.taker)
  const client = cell('Cliente')
  client.append(text('span', taker.name))
  if (taker.detail) client.append(text('small', taker.detail))
  tr.append(client)

  tr.append(Object.assign(cell('Valor'), { textContent: formatBrl(nota.request.valueCents) }))

  const number = numberCell(nota)
  const numberTd = cell('Número')
  const numberLink = text('a', number.text)
  numberLink.href = notaHash(nota.id)
  if (number.muted) numberLink.dataset.muted = ''
  numberTd.append(numberLink)
  tr.append(numberTd)

  const situation = cell('Situação')
  const label = text(isAlertStatus(nota.status) ? 'strong' : 'span', statusLabel(nota.status))
  label.dataset.status = nota.status
  situation.append(label)
  tr.append(situation)

  const actions = cell('Ações')
  const href = pdfHref(nota)
  if (href) {
    const link = text('a', 'PDF')
    link.href = href
    link.download = pdfFilename(nota)
    link.setAttribute('aria-label', `Baixar PDF da ${number.text}`)
    actions.append(link)
  }
  if (canCancel(nota)) {
    const cancel = text('a', 'Cancelar')
    cancel.href = notaHash(nota.id, { cancelar: true })
    cancel.setAttribute('aria-label', `Cancelar a ${number.text}`)
    actions.append(cancel)
  }
  const duplicate = text('a', 'Duplicar')
  duplicate.href = duplicateHref(nota.id)
  duplicate.setAttribute('aria-label', `Duplicar a ${number.text}`)
  actions.append(duplicate)
  tr.append(actions)
  return tr
}

/**
 * Brings the list row of a nota in line with its new state, whether the row came with the first page or with Carregar mais.
 * Under a status filter a nota whose status no longer matches leaves the list (D-19), the cursor staying where it was so Carregar
 * mais keeps paging; otherwise the row is replaced in place (D-14).
 */
const patchRow = (nota) => {
  const row = [...body.children].find((tr) => tr.dataset.id === nota.id)
  if (!row) return
  if (view.status && view.status !== nota.status) {
    row.remove()
    if (body.children.length === 0) say('Nenhuma nota encontrada.')
  } else row.replaceWith(renderRow(nota))
}

/** Shows a message in the status line, or hides the line when there is none. */
const say = (message) => {
  state.textContent = message
  state.hidden = message === ''
}

/**
 * What the list shows now: the status filter taken from the URL, the cursor after the last row shown, and a counter that
 * retires responses of older loads (a filter change bumps it, so an in-flight page of the old filter is never appended).
 * `nota` is the id the dialog shows ('' when closed), taken from the URL hash, and `dialogGeneration` retires the response of
 * a nota the admin has already left. `jaEmitida` is the #...&ja-emitida flag of the open nota (the form was sent with an id that was
 * already issued) and `current` the nota last rendered, so a change of the flag re-renders without fetching again. `cancel` is the
 * #...&cancelar flag: the cancel section is showing; `cancelDraft` is what the admin chose and typed there ({ id, code, reason }),
 * kept while the section is drawn again for the same nota; `cancelling` holds the ids whose cancel request is in flight. `retrying` is
 * true while a Tentar de novo request is in flight (one at a time).
 */
const view = { status: null, last: null, generation: 0, nota: '', dialogGeneration: 0, jaEmitida: false, current: null, cancel: false, cancelDraft: null, cancelling: new Set(), retrying: false }

/** Loads one page of the current filter: the newest one (replacing the rows) or, appending, the page after the last row shown. */
const loadPage = async ({ append }) => {
  const generation = view.generation + (append ? 0 : 1)
  view.generation = generation
  if (!append) {
    view.last = null
    body.replaceChildren()
    more.hidden = true
    say('Carregando notas…')
  }
  more.disabled = true
  table.setAttribute('aria-busy', 'true')
  try {
    const { notas } = await api.get(listQuery({ status: view.status, last: append ? view.last : undefined }))
    if (generation !== view.generation) return
    body.append(...notas.map(renderRow))
    if (notas.length > 0) view.last = { createdAt: notas[notas.length - 1].createdAt, id: notas[notas.length - 1].id }
    more.hidden = !hasMore(notas.length)
    say(!append && notas.length === 0 ? 'Nenhuma nota encontrada.' : '')
  } catch (error) {
    if (generation !== view.generation) return
    if (error instanceof Error && error.message === 'unauthorized') return
    say('Não foi possível carregar as notas. Tente de novo.')
  } finally {
    if (generation === view.generation) {
      more.disabled = false
      table.removeAttribute('aria-busy')
    }
  }
}

/** The hash of the open nota without the cancel flag, keeping the ja-emitida one: what Voltar and a finished cancel go back to. */
const plainHash = (id) => notaHash(id, { jaEmitida: view.jaEmitida })

/** Voltar: closes the cancel section without sending anything, forgets the draft and leaves #nota=<id>. */
const closeCancel = (id) => {
  view.cancel = false
  view.cancelDraft = null
  history.replaceState(null, '', location.pathname + location.search + plainHash(id))
  if (view.current) renderNota(view.current)
}

/**
 * Confirmar cancelamento (D-13, D-14): the only place a cancellation is sent. The row is patched from any answer that carries
 * the nota, even when the admin left the dialog meanwhile; the dialog is touched only while it still shows the same nota.
 */
const confirmCancel = async (id, { code, reason, state, confirm }) => {
  if (view.cancelling.has(id)) return
  const problem = reasonProblem(reason.value)
  if (problem) {
    state.textContent = problem
    reason.setAttribute('aria-invalid', 'true')
    reason.setAttribute('aria-describedby', 'cancel-state')
    return
  }
  view.cancelling.add(id)
  const generation = view.dialogGeneration
  state.textContent = ''
  confirm.disabled = true
  confirm.setAttribute('aria-busy', 'true')
  try {
    const answer = await api.request('POST', `/v1/notas/${encodeURIComponent(id)}/cancel`, { reasonCode: code.value, reason: reason.value.trim() })
    const nota = answer.body
    const isNota = Boolean(nota) && typeof nota === 'object' && nota.id === id && typeof nota.status === 'string'
    if (isNota) patchRow(nota)
    if (generation !== view.dialogGeneration) return
    if (answer.status === 200 && isNota && nota.status === 'canceled') {
      view.cancel = false
      view.cancelDraft = null
      view.jaEmitida = false
      view.current = nota
      history.replaceState(null, '', location.pathname + location.search + notaHash(id))
      renderNota(nota)
    } else if (answer.status === 422 && isNota) {
      // The government refused: show its cancelErrors under the section, which stays open with the draft.
      view.current = nota
      renderNota(nota)
    } else {
      state.textContent = cancelProblem(answer.status, nota)
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') return
    if (generation === view.dialogGeneration) state.textContent = cancelProblem(0, null)
  } finally {
    view.cancelling.delete(id)
    const button = document.getElementById('cancel-confirm')
    if (button && view.nota === id) {
      button.disabled = false
      button.removeAttribute('aria-busy')
    }
  }
}

/** The cancel section of a nota: summary, reason code and text, Confirmar cancelamento and Voltar. Built from buttons only, never a form, so Enter cannot send it. */
const cancelSection = (nota) => {
  const section = document.createElement('section')
  section.id = 'cancel-form'
  section.setAttribute('aria-labelledby', 'cancel-title')
  const title = text('h3', 'Cancelar esta nota')
  title.id = 'cancel-title'
  const summary = text('p', `${numberCell(nota).text} · ${takerCell(nota.request.taker).name} · ${formatBrl(nota.request.valueCents)}`)

  const codeLabel = text('label', 'Motivo')
  codeLabel.htmlFor = 'cancel-code'
  const code = document.createElement('select')
  code.id = 'cancel-code'
  for (const reasonCode of CANCEL_REASONS) {
    const option = text('option', `${reasonCode.code} – ${reasonCode.label}`)
    option.value = reasonCode.code
    code.append(option)
  }
  const draft = view.cancelDraft?.id === nota.id ? view.cancelDraft : null
  code.value = draft?.code ?? '2'

  const reasonLabel = text('label', 'Descrição do motivo')
  reasonLabel.htmlFor = 'cancel-reason'
  const reason = document.createElement('textarea')
  reason.id = 'cancel-reason'
  reason.maxLength = 255
  reason.rows = 3
  reason.value = draft ? draft.reason : cancelSuggestion(code.value)

  const state = text('p', '')
  state.id = 'cancel-state'
  state.setAttribute('role', 'status')

  const saveDraft = () => {
    view.cancelDraft = { id: nota.id, code: code.value, reason: reason.value }
  }
  let previous = code.value
  // A new code swaps the suggestion only while the text is still the previous suggestion (or empty): the admin's own words stay.
  code.addEventListener('change', () => {
    if (reason.value === '' || reason.value === cancelSuggestion(previous)) reason.value = cancelSuggestion(code.value)
    previous = code.value
    saveDraft()
  })
  reason.addEventListener('input', () => {
    saveDraft()
    if (reason.getAttribute('aria-invalid') === 'true') {
      reason.removeAttribute('aria-invalid')
      if (state.textContent === reasonProblem('')) state.textContent = ''
    }
  })

  const confirm = text('button', 'Confirmar cancelamento')
  confirm.type = 'button'
  confirm.id = 'cancel-confirm'
  confirm.setAttribute('data-danger', '')
  confirm.disabled = view.cancelling.has(nota.id)
  const back = text('button', 'Voltar')
  back.type = 'button'
  back.id = 'cancel-back'
  back.className = 'secondary'

  confirm.addEventListener('click', () => confirmCancel(nota.id, { code, reason, state, confirm }))
  back.addEventListener('click', () => closeCancel(nota.id))

  section.append(title, summary, codeLabel, code, reasonLabel, reason, state, confirm, back)
  return section
}

/** Shows a status line first in the dialog body (p#nota-message), replacing the previous one; no text removes it. */
const dialogMessage = (message) => {
  document.getElementById('nota-message')?.remove()
  if (message === '') return
  const line = text('p', message)
  line.id = 'nota-message'
  line.setAttribute('role', 'status')
  dialogBody.prepend(line)
}

/** The pt-BR line for a retry answer that is not a nota the dialog can show; status 0 means no answer arrived. */
const retryProblem = (status, body) => {
  const message = typeof body?.error === 'string' ? body.error : ''
  if (status === 400 && message !== '') return `Não foi possível reenviar: ${issueProblem(message).message}`
  if (status === 403) return 'A sessão mudou. Recarregue a página e tente de novo.'
  if ((status === 404 || status === 409) && message !== '') return `Não foi possível reenviar: ${message}`
  return 'Não foi possível confirmar o resultado. Tente de novo: o mesmo identificador não gera uma segunda nota.'
}

/** What the dialog says after a retry that came back as a nota: nothing for an issued one, the outcome for the others. */
const RETRY_MESSAGES = { 202: 'O governo ainda não respondeu. Tente de novo mais tarde.', 422: 'O governo rejeitou a nota.' }

/**
 * Tentar de novo (D-10): posts the nota's stored request again under the same id, so the server asks the government before sending
 * and can never issue twice. The row is patched from any answer that carries the nota (D-19 removal included), even when the admin
 * left the dialog; the dialog is touched only while it still shows the same nota. One request at a time.
 */
const retryNota = async () => {
  if (view.retrying || !view.current || !canRetry(view.current)) return
  const nota = view.current
  const generation = view.dialogGeneration
  view.retrying = true
  const button = document.getElementById('nota-retry')
  if (button) {
    button.disabled = true
    button.setAttribute('aria-busy', 'true')
  }
  dialogMessage('Reenviando…')
  try {
    const answer = await api.request('POST', '/v1/notas', retryBody(nota))
    const body = answer.body
    const isNota = Boolean(body) && typeof body === 'object' && body.id === nota.id && typeof body.status === 'string'
    if (isNota) patchRow(body)
    if (generation !== view.dialogGeneration) return
    if (isNota && [200, 202, 422].includes(answer.status)) {
      view.current = body
      renderNota(body)
      dialogMessage(RETRY_MESSAGES[answer.status] ?? '')
    } else {
      dialogMessage(retryProblem(answer.status, body))
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') return
    if (generation === view.dialogGeneration) dialogMessage(retryProblem(0, null))
  } finally {
    view.retrying = false
    const again = document.getElementById('nota-retry')
    if (again && view.nota === nota.id) {
      again.disabled = false
      again.removeAttribute('aria-busy')
    }
  }
}

/** Renders what the dialog shows for a nota that was fetched. */
const renderNota = (nota) => {
  const number = numberCell(nota)
  dialogTitle.textContent = number.text
  const label = text(isAlertStatus(nota.status) ? 'strong' : 'span', statusLabel(nota.status))
  label.dataset.status = nota.status
  dialogStatus.replaceChildren(label)

  const cancelable = canCancel(nota)
  const parts = []
  if (view.jaEmitida) parts.push(note(ALREADY_ISSUED_NOTICE))
  const notice = statusNotice(nota)
  if (notice) parts.push(note(notice))
  if (view.cancel && cancelable) parts.push(cancelSection(nota))
  for (const box of errorBoxes(nota)) parts.push(errorSection(box))
  for (const hint of issueHints(nota)) parts.push(note(hint))
  for (const { title, rows } of detailSections(nota)) {
    const section = document.createElement('section')
    section.append(text('h3', title))
    const list = document.createElement('dl')
    for (const [name, value] of rows) list.append(text('dt', name), detailValue(value))
    section.append(list)
    parts.push(section)
  }
  dialogBody.replaceChildren(...parts)

  const actions = []
  if (canRetry(nota)) {
    const retry = text('button', 'Tentar de novo')
    retry.type = 'button'
    retry.id = 'nota-retry'
    retry.disabled = view.retrying
    retry.addEventListener('click', retryNota)
    actions.push(retry)
  }
  if (cancelable && !view.cancel) {
    const link = text('a', 'Cancelar')
    link.href = notaHash(nota.id, { cancelar: true, jaEmitida: view.jaEmitida })
    link.setAttribute('role', 'button')
    actions.push(link)
  }
  // Duplicar is offered for every status (D-15): it opens a new form, so it never touches this nota.
  const duplicate = text('a', 'Duplicar')
  duplicate.href = duplicateHref(nota.id)
  duplicate.setAttribute('role', 'button')
  actions.push(duplicate)
  dialogActions.replaceChildren(...actions)
}

/** The prefixes a link in the dialog may start with: a nota's hash, the same-origin PDF route, an https page. Anything else is shown as plain text. */
const LINK_PREFIXES = ['#nota=', '/v1/notas/', 'https://']

/** The dd of one detail row: text through textContent, or a link only when its href starts with an allowed prefix. */
const detailValue = (value) => {
  if (typeof value === 'string') return text('dd', value)
  const dd = text('dd', '')
  if (!LINK_PREFIXES.some((prefix) => value.href.startsWith(prefix))) {
    dd.textContent = value.text
    return dd
  }
  const link = text('a', value.text)
  link.href = value.href
  if (value.download) link.download = value.download
  if (value.external) {
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
  }
  dd.append(link)
  return dd
}

/** Opens the dialog on a nota: shows it at once as loading, then fills it with GET /v1/notas/<id>; a stale response is dropped. */
const openNota = async (id) => {
  const generation = ++view.dialogGeneration
  view.current = null
  dialogTitle.textContent = 'Carregando nota…'
  dialogStatus.replaceChildren()
  dialogBody.replaceChildren()
  dialogActions.replaceChildren()
  if (!dialog.open) dialog.showModal()
  try {
    const nota = await api.get(`/v1/notas/${encodeURIComponent(id)}`)
    if (generation !== view.dialogGeneration) return
    view.current = nota
    renderNota(nota)
  } catch (error) {
    if (generation !== view.dialogGeneration) return
    if (error instanceof Error && error.message === 'unauthorized') return
    dialogTitle.textContent = error instanceof Error && error.message === 'HTTP 404' ? 'Nota não encontrada.' : 'Não foi possível carregar a nota. Tente de novo.'
  }
}

/** Brings the list and the dialog in line with the URL, the one source of truth for both; does nothing for what is unchanged. */
const sync = () => {
  const status = parseStatus(location.search)
  if (status !== view.status) {
    view.status = status
    select.value = status
    loadPage({ append: false })
  }
  const id = parseNotaHash(location.hash)
  const { cancelar, jaEmitida } = parseNotaFlags(location.hash)
  if (id !== view.nota) {
    view.nota = id
    view.jaEmitida = jaEmitida
    view.cancel = cancelar
    view.cancelDraft = null
    if (id) openNota(id)
    else if (dialog.open) {
      view.dialogGeneration++
      dialog.close()
    }
  } else if (id && (jaEmitida !== view.jaEmitida || cancelar !== view.cancel)) {
    view.jaEmitida = jaEmitida
    view.cancel = cancelar
    if (view.current) renderNota(view.current)
  }
}

// Fechar, Esc or sync closing the dialog: forget the nota and drop the hash. replaceState fires no event and never leaves a bare #.
dialog.addEventListener('close', () => {
  if (dialog.open) return
  view.nota = ''
  view.jaEmitida = false
  view.cancel = false
  view.cancelDraft = null
  view.current = null
  view.dialogGeneration++
  if (parseNotaHash(location.hash) !== '') history.replaceState(null, '', location.pathname + location.search)
})

// A click on the dialog element itself lands on the backdrop (the article fills the rest): close like Fechar (D-13), but only
// when the press started on the backdrop too, so a text selection dragged out of the reason field never closes the dialog.
let pressedOnBackdrop = false
dialog.addEventListener('mousedown', (event) => {
  pressedOnBackdrop = event.target === dialog
})
dialog.addEventListener('click', (event) => {
  const closes = event.target === dialog && pressedOnBackdrop
  pressedOnBackdrop = false
  if (closes) dialog.close()
})

select.addEventListener('change', () => {
  history.pushState(null, '', location.pathname + statusSearch(select.value))
  sync()
})
window.addEventListener('popstate', sync)
window.addEventListener('hashchange', sync)
more.addEventListener('click', () => loadPage({ append: true }))

sync()
