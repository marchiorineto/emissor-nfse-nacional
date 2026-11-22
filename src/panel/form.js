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
  const taxId = digitsOnly(fields.taxId)
  const name = fields.name.trim()
  const hasTaker = fields.taxId.trim() !== '' || name !== '' || email !== '' || phone !== ''
  return {
    id: fields.id.trim(),
    competence: fields.competence,
    serviceCode: digitsOnly(fields.serviceCode),
    description: fields.description.trim(),
    valueCents: parseBrl(fields.value),
    ...(nbsCode ? { nbsCode } : {}),
    ...(hasTaker ? { taker: { taxId, name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) } } : {}),
  }
}
