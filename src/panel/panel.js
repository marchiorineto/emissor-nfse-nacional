// The panel's browser module: reads GET /v1/notas with the session cookie and renders the list.
// Every API string reaches the DOM through textContent; nothing here ever parses markup or sets a style.
import { formatBrl, hasMore, isAlertStatus, listDate, listQuery, numberCell, parseStatus, pdfFilename, pdfHref, statusLabel, statusSearch, takerCell } from './format.js'

const body = document.getElementById('notas-body')
const state = document.getElementById('notas-state')
const table = body.closest('table')
const select = document.getElementById('status')
const more = document.getElementById('more')

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

/** An element holding one piece of text. */
const text = (tag, value) => {
  const el = document.createElement(tag)
  el.textContent = value
  return el
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
  const numberText = text('span', number.text)
  if (number.muted) numberText.dataset.muted = ''
  numberTd.append(numberText)
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
 */
const view = { status: null, last: null, generation: 0 }

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

/** Brings the list in line with the URL, the one source of truth for the filter; does nothing when the filter is unchanged. */
const sync = () => {
  const status = parseStatus(location.search)
  if (status === view.status) return
  view.status = status
  select.value = status
  loadPage({ append: false })
}

select.addEventListener('change', () => {
  history.pushState(null, '', location.pathname + statusSearch(select.value))
  sync()
})
window.addEventListener('popstate', sync)
more.addEventListener('click', () => loadPage({ append: true }))

sync()
