// The /admin/emitir module: keeps the sale id in the URL, posts the form to POST /v1/notas with the session cookie and the CSRF
// token, and hands over to the details dialog of /admin. Every API string reaches the DOM through textContent; nothing here
// ever parses markup or sets a style.
import { errorBoxes, notaHash } from './format.js'
import { pageApi } from './api.js'
import { errorSection, note } from './dom.js'
import { brasiliaToday, buildIssueBody, issueHints, suggestId } from './form.js'

const FIELD_KEYS = ['id', 'taxId', 'name', 'email', 'phone', 'serviceCode', 'nbsCode', 'description', 'value', 'competence']

const form = document.getElementById('emitir-form')
const submit = document.getElementById('emitir-submit')
const state = document.getElementById('emitir-state')
const errors = document.getElementById('emitir-errors')
const field = Object.fromEntries(FIELD_KEYS.map((key) => [key, document.getElementById(`field-${key}`)]))
const api = pageApi()

/** Shows a message in the status line, or hides the line when there is none. */
const say = (message) => {
  state.textContent = message
  state.hidden = message === ''
}

/** Writes the sale id into ?id= (removed when empty) without adding a history entry; no other query parameter is touched. */
const writeId = (value) => {
  const params = new URLSearchParams(location.search)
  if (value === '') params.delete('id')
  else params.set('id', value)
  const query = params.toString()
  history.replaceState(null, '', location.pathname + (query === '' ? '' : `?${query}`))
}

// The id exists before the first submit and lives in the URL, so a reload keeps it; only a visit without ?id= makes another.
const known = new URLSearchParams(location.search).get('id')?.trim() ?? ''
const id = known === '' ? suggestId() : known
field.id.value = id
writeId(id)
field.competence.value = brasiliaToday()
say('')
errors.tabIndex = -1

field.id.addEventListener('input', () => writeId(field.id.value.trim()))

/** The ten fields as typed. */
const readFields = () => Object.fromEntries(FIELD_KEYS.map((key) => [key, field[key].value]))

let sending = false

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (sending) return
  sending = true
  let leaving = false
  const body = buildIssueBody(readFields())
  submit.disabled = true
  form.setAttribute('aria-busy', 'true')
  errors.replaceChildren()
  say('Enviando a nota…')
  try {
    const answer = await api.request('POST', '/v1/notas', body)
    if (answer.status === 200 || answer.status === 202) {
      leaving = true
      location.replace(`/admin${notaHash(body.id)}`)
      return
    }
    if (answer.status === 422 && answer.body && typeof answer.body === 'object') {
      // The government refused the nota: its errors verbatim, then the hints; the fields and the id stay, so a resend is one click.
      errors.replaceChildren(...errorBoxes(answer.body).map(errorSection), ...issueHints(answer.body).map(note))
      say('O governo rejeitou a nota. Corrija os dados e envie de novo: o mesmo identificador reenvia a nota, sem criar outra.')
      errors.focus()
      return
    }
    say('Não foi possível confirmar o resultado. Envie de novo: o mesmo identificador não gera uma segunda nota.')
  } catch (error) {
    // A 401 already sent the browser to /login.
    if (error instanceof Error && error.message === 'unauthorized') {
      leaving = true
      return
    }
    say('Não foi possível confirmar o resultado. Envie de novo: o mesmo identificador não gera uma segunda nota.')
  } finally {
    sending = leaving
    if (!leaving) {
      submit.disabled = false
      form.removeAttribute('aria-busy')
    }
  }
})
