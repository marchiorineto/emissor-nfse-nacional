// The panel's browser module: reads GET /v1/notas with the session cookie and renders the list.
// Every API string reaches the DOM through textContent; nothing here ever parses markup or sets a style.
import {
  detailSections,
  errorBoxes,
  formatBrl,
  hasMore,
  isAlertStatus,
  listDate,
  listQuery,
  notaHash,
  numberCell,
  parseNotaHash,
  parseStatus,
  pdfFilename,
  pdfHref,
  statusLabel,
  statusNotice,
  statusSearch,
  takerCell,
} from './format.js'
import { errorSection, note, text } from './dom.js'

const body = document.getElementById('notas-body')
const state = document.getElementById('notas-state')
const table = body.closest('table')
const select = document.getElementById('status')
const more = document.getElementById('more')
const dialog = document.getElementById('nota-dialog')
const dialogTitle = document.getElementById('nota-title')
const dialogStatus = document.getElementById('nota-status')
const dialogBody = document.getElementById('nota-body')

/** Fetches a /v1 path with the session cookie as the only credential; a 401 sends the browser to the login. */
const api = async (path) => {
  const res = await fetch(path, { credentials: 'same-origin', headers: { accept: 'application/json' } })
  if (res.status === 401) {
    location.assign('/login')
    throw new Error('unauthorized')
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

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

  const pdf = cell('PDF')
  const href = pdfHref(nota)
  if (href) {
    const link = text('a', 'PDF')
    link.href = href
    link.download = pdfFilename(nota)
    link.setAttribute('aria-label', `Baixar PDF da ${number.text}`)
    pdf.append(link)
  }
  tr.append(pdf)
  return tr
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
 * a nota the admin has already left.
 */
const view = { status: null, last: null, generation: 0, nota: '', dialogGeneration: 0 }

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
    const { notas } = await api(listQuery({ status: view.status, last: append ? view.last : undefined }))
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

/** Renders what the dialog shows for a nota that was fetched. */
const renderNota = (nota) => {
  const number = numberCell(nota)
  dialogTitle.textContent = number.text
  const label = text(isAlertStatus(nota.status) ? 'strong' : 'span', statusLabel(nota.status))
  label.dataset.status = nota.status
  dialogStatus.replaceChildren(label)

  const parts = []
  const notice = statusNotice(nota)
  if (notice) parts.push(note(notice))
  for (const box of errorBoxes(nota)) parts.push(errorSection(box))
  for (const { title, rows } of detailSections(nota)) {
    const section = document.createElement('section')
    section.append(text('h3', title))
    const list = document.createElement('dl')
    for (const [name, value] of rows) list.append(text('dt', name), detailValue(value))
    section.append(list)
    parts.push(section)
  }
  dialogBody.replaceChildren(...parts)
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
  dialogTitle.textContent = 'Carregando nota…'
  dialogStatus.replaceChildren()
  dialogBody.replaceChildren()
  if (!dialog.open) dialog.showModal()
  try {
    const nota = await api(`/v1/notas/${encodeURIComponent(id)}`)
    if (generation !== view.dialogGeneration) return
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
  if (id !== view.nota) {
    view.nota = id
    if (id) openNota(id)
    else if (dialog.open) {
      view.dialogGeneration++
      dialog.close()
    }
  }
}

// Fechar, Esc or sync closing the dialog: forget the nota and drop the hash. replaceState fires no event and never leaves a bare #.
dialog.addEventListener('close', () => {
  if (dialog.open) return
  view.nota = ''
  view.dialogGeneration++
  if (parseNotaHash(location.hash) !== '') history.replaceState(null, '', location.pathname + location.search)
})

// A click on the dialog element itself lands on the backdrop (the article fills the rest): close like Fechar (D-13).
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close()
})

select.addEventListener('change', () => {
  history.pushState(null, '', location.pathname + statusSearch(select.value))
  sync()
})
window.addEventListener('popstate', sync)
window.addEventListener('hashchange', sync)
more.addEventListener('click', () => loadPage({ append: true }))

sync()
