// The /admin/emitir module: keeps the sale id in the URL, checks the form, posts it to POST /v1/notas with the session cookie and
// the CSRF token, and says in pt-BR what every answer means. A success hands over to the details dialog of /admin; every failure
// keeps the fields and the id, so sending again is always safe (the server answers the nota the id already has). Every API string
// reaches the DOM through textContent; nothing here ever parses markup or sets a style.
import { errorBoxes, notaHash } from './format.js'
import { pageApi } from './api.js'
import { errorSection, note } from './dom.js'
import {
  brasiliaToday,
  buildIssueBody,
  DROPPED_ABROAD_NOTICE,
  isAlreadyIssued,
  issueHints,
  issueProblem,
  loadServiceDefaults,
  prefillFromNota,
  saveServiceDefaults,
  suggestId,
  validateForm,
} from './form.js'

const FIELD_KEYS = ['id', 'taxId', 'name', 'email', 'phone', 'serviceCode', 'nbsCode', 'description', 'value', 'competence']

const form = document.getElementById('emitir-form')
const submit = document.getElementById('emitir-submit')
const state = document.getElementById('emitir-state')
const errors = document.getElementById('emitir-errors')
const field = Object.fromEntries(FIELD_KEYS.map((key) => [key, document.getElementById(`field-${key}`)]))
const api = pageApi()

const LOST = 'Não foi possível confirmar o resultado. Envie de novo: o mesmo identificador não gera uma segunda nota.'
const CHECK_FIELDS = 'Confira os campos destacados.'

/** Shows a message in the status line, or hides the line when there is none. */
const say = (message) => {
  state.textContent = message
  state.hidden = message === ''
}

/** localStorage, or undefined when the browser blocks it (reading the property can throw). */
const storage = () => {
  try {
    return localStorage
  } catch {
    return undefined
  }
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
// A competence after today in Brasília would be rejected by the government (E0015).
field.competence.max = brasiliaToday()
// A fresh form remembers the service fields of the last one (D-04); a form built from another nota (?de=) keeps its own.
if (!new URLSearchParams(location.search).has('de')) {
  const remembered = loadServiceDefaults(storage())
  for (const key of ['serviceCode', 'nbsCode', 'description']) if (typeof remembered[key] === 'string') field[key].value = remembered[key]
}
say('')
errors.tabIndex = -1

/**
 * ?de=<id> (D-17): fills the form from the nota with that id. The new id is already in the URL, so a reload during the fetch keeps it
 * and refills the form; the id is only ever placed inside an encoded same-origin path. The submit button stays off while the source
 * loads. Every value goes in through the control's value property, never as markup.
 */
const loadSource = async (de) => {
  submit.disabled = true
  form.setAttribute('aria-busy', 'true')
  say('Carregando a nota de origem…')
  try {
    const source = await api.get(`/v1/notas/${encodeURIComponent(de)}`)
    const { fields, dropped } = prefillFromNota(source)
    for (const [key, value] of Object.entries(fields)) field[key].value = value
    if (dropped) form.before(note(DROPPED_ABROAD_NOTICE))
    say('')
  } catch (error) {
    // A 401 already sent the browser to /login.
    if (error instanceof Error && error.message === 'unauthorized') return
    say(error instanceof Error && error.message === 'HTTP 404' ? 'Nota não encontrada.' : 'Não foi possível carregar a nota de origem. Recarregue a página.')
  } finally {
    if (!sending) {
      submit.disabled = false
      form.removeAttribute('aria-busy')
    }
  }
}

/** Removes the error shown next to a field. */
const clearFieldError = (key) => {
  const control = field[key]
  const errorId = `field-${key}-error`
  document.getElementById(errorId)?.remove()
  control.removeAttribute('aria-invalid')
  const rest = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((token) => token !== '' && token !== errorId)
  if (rest.length > 0) control.setAttribute('aria-describedby', rest.join(' '))
  else control.removeAttribute('aria-describedby')
}

/** Shows a pt-BR error right after a field: aria-invalid on the control and a small that its aria-describedby names first. */
const showFieldError = (key, message) => {
  const control = field[key]
  const errorId = `field-${key}-error`
  let small = document.getElementById(errorId)
  if (!small) {
    small = document.createElement('small')
    small.id = errorId
    control.after(small)
  }
  small.textContent = message
  control.setAttribute('aria-invalid', 'true')
  const rest = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((token) => token !== '' && token !== errorId)
  control.setAttribute('aria-describedby', [errorId, ...rest].join(' '))
}

for (const key of FIELD_KEYS) field[key].addEventListener('input', () => clearFieldError(key))
field.id.addEventListener('input', () => writeId(field.id.value.trim()))

/** The ten fields as typed. */
const readFields = () => Object.fromEntries(FIELD_KEYS.map((key) => [key, field[key].value]))

let sending = false

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (sending) return
  for (const key of FIELD_KEYS) clearFieldError(key)
  errors.replaceChildren()

  // Invalid input never reaches the API: the errors show next to their fields and the first one takes the focus.
  const fields = readFields()
  const problems = validateForm(fields, brasiliaToday())
  const invalid = Object.keys(problems).sort((a, b) => (field[a].compareDocumentPosition(field[b]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  if (invalid.length > 0) {
    for (const key of invalid) showFieldError(key, problems[key])
    say(CHECK_FIELDS)
    field[invalid[0]].focus()
    return
  }
  saveServiceDefaults(storage(), fields)

  sending = true
  let leaving = false
  const request = buildIssueBody(fields)
  submit.disabled = true
  form.setAttribute('aria-busy', 'true')
  say('Enviando a nota…')
  try {
    const answer = await api.request('POST', '/v1/notas', request)
    const nota = answer.body !== null && typeof answer.body === 'object' ? answer.body : undefined
    if ((answer.status === 200 || answer.status === 202) && nota && typeof nota.status === 'string') {
      // The nota the id has: new, resent after a rejection, or already issued before this request (D-09: no GET before, no second nota).
      leaving = true
      location.replace(`/admin${notaHash(request.id, { jaEmitida: isAlreadyIssued(nota, answer) })}`)
      return
    }
    if (answer.status === 422 && nota) {
      // The government refused the nota: its errors verbatim, then the hints; fields and id stay, so a resend is one click (D-08).
      errors.replaceChildren(...errorBoxes(nota).map((box) => errorSection(box)), ...issueHints(nota).map((hint) => note(hint)))
      say('O governo rejeitou a nota. Corrija os dados e envie de novo: o mesmo identificador reenvia a nota, sem criar outra.')
      errors.focus()
      return
    }
    const message = typeof nota?.error === 'string' ? nota.error : ''
    if (answer.status === 400 && message !== '') {
      const problem = issueProblem(message)
      if (problem.field !== '') {
        showFieldError(problem.field, problem.message)
        say(CHECK_FIELDS)
        field[problem.field].focus()
      } else {
        say(problem.message)
      }
      return
    }
    if (answer.status === 403) {
      // A stale CSRF token (another login in another tab): reloading is safe because the id is in the URL.
      say('A sessão mudou. Recarregue a página e envie de novo; o identificador continua o mesmo.')
      const reload = document.createElement('button')
      reload.type = 'button'
      reload.textContent = 'Recarregar'
      reload.addEventListener('click', () => location.reload())
      errors.replaceChildren(reload)
      return
    }
    if ((answer.status === 404 || answer.status === 409) && message !== '') {
      say(`Não foi possível emitir: ${message}`)
      return
    }
    // A 5xx, an answer that is not JSON or any other status: the result is unknown, never reported as a failure.
    say(LOST)
  } catch (error) {
    // A 401 already sent the browser to /login.
    if (error instanceof Error && error.message === 'unauthorized') {
      leaving = true
      return
    }
    say(LOST)
  } finally {
    sending = leaving
    if (!leaving) {
      submit.disabled = false
      form.removeAttribute('aria-busy')
    }
  }
})

const source = new URLSearchParams(location.search).get('de')
if (source !== null && source.trim() !== '') loadSource(source.trim())
