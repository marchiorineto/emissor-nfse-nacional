// The issue form's pure helpers: no DOM, no network, so Node tests import this module as it is. The browser loads it as
// /admin/form.js (see PANEL_SCRIPTS in src/admin.ts).

const dayParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })

/** The calendar day in America/Sao_Paulo as YYYY-MM-DD; never derived from a UTC timestamp string. */
export const brasiliaToday = (now = new Date()) => {
  const parts = Object.fromEntries(dayParts.formatToParts(now).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/**
 * A suggested sale id: painel-AAAAMMDD-xxxxxx with today's Brasília date and 6 characters of [a-z0-9] drawn from
 * crypto.getRandomValues (which works on plain-HTTP origins, unlike randomUUID). Bytes 252 to 255 are skipped so the 36
 * letters stay equally likely (rejection sampling).
 */
export const suggestId = (now = new Date(), bytes = (count) => crypto.getRandomValues(new Uint8Array(count))) => {
  let suffix = ''
  while (suffix.length < 6) {
    for (const byte of bytes(12)) {
      if (byte < 252 && suffix.length < 6) suffix += ID_ALPHABET[byte % 36]
    }
  }
  return `painel-${brasiliaToday(now).replaceAll('-', '')}-${suffix}`
}

/**
 * Brazilian currency text as integer cents, read from its digit string and never through floating point; undefined unless
 * the value is greater than zero. "1234.56" is refused on purpose: with a dot and two digits it is ambiguous.
 */
export const parseBrl = (text) => {
  const clean = text.replace(/R\$|[\s ]/g, '')
  if (!/^(\d{1,3}(\.\d{3})*|\d+)(,\d{1,2})?$/.test(clean)) return undefined
  const [whole, fraction = ''] = clean.replaceAll('.', '').split(',')
  if (whole.length > 13) return undefined
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined
}

/** The digits of a text, every other character removed. */
export const digitsOnly = (text) => text.replace(/\D/g, '')

/**
 * The POST /v1/notas body of the form: optional fields that are empty are left out (never sent as ''), and the whole taker is
 * left out when none of its four fields is filled. It never carries replaces or export.
 */
export const buildIssueBody = (fields) => {
  const nbsCode = digitsOnly(fields.nbsCode)
  const email = fields.email.trim()
  const phone = digitsOnly(fields.phone)
  const name = fields.name.trim()
  const hasTaker = [fields.taxId, fields.name, fields.email, fields.phone].some((text) => text.trim() !== '')
  return {
    id: fields.id.trim(),
    competence: fields.competence,
    serviceCode: digitsOnly(fields.serviceCode),
    description: fields.description.trim(),
    valueCents: parseBrl(fields.value),
    ...(nbsCode ? { nbsCode } : {}),
    ...(hasTaker ? { taker: { taxId: digitsOnly(fields.taxId), name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) } } : {}),
  }
}

const MESSAGES = {
  id: 'Informe um identificador de 1 a 200 caracteres.',
  serviceCode: 'O código do serviço tem 6 dígitos (cTribNac).',
  nbsCode: 'O código NBS tem 9 dígitos.',
  description: 'Descreva o serviço.',
  value: 'Informe o valor como 1.234,56, maior que zero.',
  competence: 'Informe a competência.',
  competenceLate: 'A competência não pode ser depois de hoje.',
  taxId: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.',
  name: 'Informe o nome do tomador.',
  phone: 'O telefone deve ter de 6 a 20 dígitos.',
  email: 'Informe um e-mail válido.',
}

/** A mod-11 check digit over the digits so far, each weighted from the list. */
const checkDigit = (digits, weights) => {
  const rest = weights.reduce((sum, weight, i) => sum + Number(digits[i]) * weight, 0) % 11
  return rest < 2 ? 0 : 11 - rest
}

/** Whether 11 digits are a CPF: not one repeated digit, both check digits right. */
const validCpf = (digits) =>
  !/^(\d)\1{10}$/.test(digits) &&
  checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[9]) &&
  checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[10])

/** Whether 14 digits are a CNPJ: not one repeated digit, both check digits right. */
const validCnpj = (digits) =>
  !/^(\d)\1{13}$/.test(digits) &&
  checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[12]) &&
  checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[13])

/** Whether a YYYY-MM-DD text names a real calendar day. */
const realDay = (text) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * The rules checked before sending, one pt-BR message per failing field ({} when the form may go). The taker is optional, but
 * once any of its four fields is filled the API wants a valid CPF or CNPJ and a name. A competence after today (Brasília) is
 * refused here because the government would reject it (rule E0015). Dates compare as YYYY-MM-DD strings.
 */
export const validateForm = (fields, today) => {
  const problems = {}
  const id = fields.id.trim()
  if (id.length < 1 || id.length > 200) problems.id = MESSAGES.id
  if (digitsOnly(fields.serviceCode).length !== 6) problems.serviceCode = MESSAGES.serviceCode
  if (fields.nbsCode.trim() !== '' && digitsOnly(fields.nbsCode).length !== 9) problems.nbsCode = MESSAGES.nbsCode
  if (fields.description.trim() === '') problems.description = MESSAGES.description
  if (parseBrl(fields.value) === undefined) problems.value = MESSAGES.value
  if (!realDay(fields.competence)) problems.competence = MESSAGES.competence
  else if (fields.competence > today) problems.competence = MESSAGES.competenceLate

  const taker = [fields.taxId, fields.name, fields.email, fields.phone].some((text) => text.trim() !== '')
  if (taker) {
    const taxId = digitsOnly(fields.taxId)
    if (!(taxId.length === 11 ? validCpf(taxId) : taxId.length === 14 && validCnpj(taxId))) problems.taxId = MESSAGES.taxId
    if (fields.name.trim() === '') problems.name = MESSAGES.name
    if (fields.phone.trim() !== '' && !/^\d{6,20}$/.test(digitsOnly(fields.phone))) problems.phone = MESSAGES.phone
    if (fields.email.trim() !== '' && !/^[^\s@]+@[^\s@]+$/.test(fields.email.trim())) problems.email = MESSAGES.email
  }
  return problems
}

/** The 400 messages of parseIssueRequest by prefix, each with the form field it is about. */
const PROBLEM_PREFIXES = [
  ['id:', 'id', MESSAGES.id],
  ['competence:', 'competence', MESSAGES.competence],
  ['serviceCode:', 'serviceCode', MESSAGES.serviceCode],
  ['nbsCode:', 'nbsCode', MESSAGES.nbsCode],
  ['description:', 'description', MESSAGES.description],
  ['valueCents:', 'value', MESSAGES.value],
  ['taker.name:', 'name', MESSAGES.name],
  ['taker.taxId:', 'taxId', MESSAGES.taxId],
  ['taker.phone:', 'phone', MESSAGES.phone],
  ['taker.email:', 'email', MESSAGES.email],
]

/** The form field and the pt-BR message for a 400 answer of the API; an unknown message keeps the API text after a pt-BR lead-in. */
export const issueProblem = (message) => {
  const known = PROBLEM_PREFIXES.find(([prefix]) => message.startsWith(prefix))
  return known ? { field: known[1], message: known[2] } : { field: '', message: `A API recusou o pedido: ${message}` }
}

/**
 * Whether the nota an answer carries was already issued before this request: its status is issued, canceled or replaced and its
 * updatedAt is earlier than the request's start on the server clock (the Date header minus the time the browser waited). The
 * creation time cannot tell, because a rejected or pending nota keeps it when it is sent again and issued. A missing or
 * unparseable Date header gives false: the nota is simply shown.
 */
export const isAlreadyIssued = (nota, { date, elapsedMs }) => {
  if (!['issued', 'canceled', 'replaced'].includes(nota.status)) return false
  const serverNow = Date.parse(date ?? '')
  if (Number.isNaN(serverNow)) return false
  return Date.parse(nota.updatedAt) < serverNow - elapsedMs
}

/** The pt-BR hints for a nota the government did not issue: a 2xx answer carrying an error first, then the E0015 competence rule; each at most once. */
export const issueHints = (nota) => {
  const codes = (nota.errors ?? []).map((error) => error.code)
  return [
    ...(codes.some((code) => /^HTTP 2\d\d$/.test(code)) ? ['O governo pode ter emitido esta nota mesmo com este erro. Confira na consulta pública antes de enviar de novo.'] : []),
    ...(codes.includes('E0015')
      ? ['A competência não pode ser depois da data de emissão. Se ela é hoje e passou há pouco da meia-noite, espere um minuto e envie de novo com o mesmo identificador.']
      : []),
  ]
}

/** The localStorage key of the remembered service fields. */
export const SERVICE_DEFAULTS_KEY = 'nfse-painel:servico'

const SERVICE_KEYS = ['serviceCode', 'nbsCode', 'description']

/** The remembered serviceCode, nbsCode and description (only string values); {} when storage is missing, holds malformed JSON or throws. */
export const loadServiceDefaults = (storage) => {
  try {
    const saved = JSON.parse(storage?.getItem(SERVICE_DEFAULTS_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return {}
    return Object.fromEntries(SERVICE_KEYS.filter((key) => typeof saved[key] === 'string').map((key) => [key, saved[key]]))
  } catch {
    return {}
  }
}

/** Remembers serviceCode, nbsCode and description, nothing else (never the taker or the value); never throws. */
export const saveServiceDefaults = (storage, fields) => {
  try {
    storage?.setItem(SERVICE_DEFAULTS_KEY, JSON.stringify(Object.fromEntries(SERVICE_KEYS.map((key) => [key, fields[key]]))))
  } catch {
    // A full or blocked storage only means the fields are not remembered.
  }
}
