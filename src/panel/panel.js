// The panel's browser module: reads GET /v1/notas with the session cookie and renders the list.
// Every API string reaches the DOM through textContent; nothing here ever parses markup or sets a style.
import { formatBrl, isAlertStatus, listDate, listQuery, numberCell, statusLabel, takerCell } from './format.js'

const body = document.getElementById('notas-body')
const state = document.getElementById('notas-state')
const table = body.closest('table')

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

  tr.append(cell('PDF'))
  return tr
}

/** Shows a message in the status line, or hides the line when there is none. */
const say = (message) => {
  state.textContent = message
  state.hidden = message === ''
}

/** Loads the newest page and replaces the rows with it. */
const loadFirstPage = async () => {
  say('Carregando notas…')
  table.setAttribute('aria-busy', 'true')
  body.replaceChildren()
  try {
    const { notas } = await api(listQuery())
    body.append(...notas.map(renderRow))
    say(notas.length === 0 ? 'Nenhuma nota encontrada.' : '')
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') return
    say('Não foi possível carregar as notas. Tente de novo.')
  } finally {
    table.removeAttribute('aria-busy')
  }
}

loadFirstPage()
