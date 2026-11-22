// Pure helpers of the notas list: columns, labels and the list query. No DOM access, so vitest runs them in Node.

/** Notas per page; the panel always sends it, never relying on the API default. */
export const PAGE_SIZE = 20

/** The statuses in the order the filter offers them. */
export const STATUS_ORDER = ['issued', 'rejected', 'canceled', 'replaced', 'pending', 'unknown']

const STATUS_LABELS = {
  issued: 'Emitida',
  rejected: 'Rejeitada',
  canceled: 'Cancelada',
  replaced: 'Substituída',
  pending: 'Pendente',
  unknown: 'Sem resposta',
}

/** The pt-BR label of a status; a value the panel does not know is returned as given. */
export const statusLabel = (status) => STATUS_LABELS[status] ?? status

/** Whether the status needs emphasis in the list: the government refused it or never answered. */
export const isAlertStatus = (status) => status === 'rejected' || status === 'unknown'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Integer cents as R$ 1.234,56. */
export const formatBrl = (cents) => brl.format(cents / 100)

/** YYYY-MM-DD as DD/MM/YYYY by splitting the text, never through Date (no timezone day shift); anything else as given. */
export const formatCompetence = (value) => value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')

const brasilia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })

/** The calendar day of an ISO instant in America/Sao_Paulo, as DD/MM/YYYY. */
export const brasiliaDay = (iso) => brasilia.format(new Date(iso))

/** The date shown for a nota: its competence when it has one, otherwise the day it was created in Brasília. */
export const listDate = (nota) => (nota.request.competence ? formatCompetence(nota.request.competence) : brasiliaDay(nota.createdAt))

/** NN.NNN.NNN/NNNN-NN for 14 digits, NNN.NNN.NNN-NN for 11, otherwise the value as given. */
export const formatTaxId = (digits) =>
  digits
    .replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    .replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')

const regions = new Intl.DisplayNames(['pt-BR'], { type: 'region' })

/** The pt-BR country name of an ISO alpha-2 code, or the code itself when the name is unknown. */
export const countryName = (code) => {
  try {
    return regions.of(code) ?? code
  } catch {
    return code
  }
}

/** The Cliente cell: the name and, below it, the CPF/CNPJ or the country of a taker abroad. */
export const takerCell = (taker) => {
  if (!taker) return { name: '— (não informado)', detail: '' }
  if (taker.taxId) return { name: taker.name, detail: formatTaxId(taker.taxId) }
  if (taker.abroad) return { name: taker.name, detail: taker.abroad.address ? countryName(taker.abroad.address.country) : 'Exterior' }
  return { name: taker.name, detail: '' }
}

/** The Número cell: the NFS-e number when the nota has one, otherwise the DPS number marked muted. */
export const numberCell = (nota) => (nota.nfseNumber ? { text: `NFS-e ${nota.nfseNumber}`, muted: false } : { text: `DPS ${nota.dpsNumber}`, muted: true })

/** The URL of one page of the list: limit always first, status when set, and the cursor after the last row shown. */
export const listQuery = ({ status, last } = {}) => {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
  if (status) params.set('status', status)
  if (last) {
    params.set('before', last.createdAt)
    params.set('beforeId', last.id)
  }
  return `/v1/notas?${params}`
}

/** Whether a page of this many notas may be followed by another: only a full page can (D-02). */
export const hasMore = (count) => count >= PAGE_SIZE

/** The status the URL's query string asks for when it is one of STATUS_ORDER, otherwise '' (Todas); a malformed value never throws. */
export const parseStatus = (search) => {
  const status = new URLSearchParams(search).get('status')
  return STATUS_ORDER.includes(status) ? status : ''
}

/** The query string that selects a status: '' for Todas, otherwise '?status=<status>'. */
export const statusSearch = (status) => (status ? `?${new URLSearchParams({ status })}` : '')

/**
 * The download link of a nota's PDF, or undefined when the nota has no access key (D-18, D-20). It is relative and same-origin
 * on purpose: the `download` attribute only works same-origin, and the signed public links in the API response are built from
 * PUBLIC_URL and may point at another origin, so they are never read here.
 */
export const pdfHref = (nota) => (nota.accessKey ? `/v1/notas/${encodeURIComponent(nota.id)}/pdf?download=1` : undefined)

/** The name the PDF is saved as, the same one the server's download answer carries: nfse-<NFS-e number, else DPS number>.pdf. */
export const pdfFilename = (nota) => `nfse-${nota.nfseNumber ?? nota.dpsNumber}.pdf`

/** The id a URL hash names (#nota=<id>), or '' when there is none; a malformed hash never throws. */
export const parseNotaHash = (hash) => new URLSearchParams(hash.replace(/^#/, '')).get('nota') ?? ''

/**
 * The URL hash that opens a nota: '#nota=<id>', the id encoded by URLSearchParams so any character round-trips, then the literal
 * suffixes '&cancelar' and '&ja-emitida' for the flags that are true (an encoded id can never contain a bare '&').
 */
export const notaHash = (id, { cancelar = false, jaEmitida = false } = {}) =>
  `#${new URLSearchParams({ nota: id })}${cancelar ? '&cancelar' : ''}${jaEmitida ? '&ja-emitida' : ''}`

/** The flags a URL hash carries next to the nota id; a malformed hash never throws. */
export const parseNotaFlags = (hash) => {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return { cancelar: params.has('cancelar'), jaEmitida: params.has('ja-emitida') }
}

/** What the dialog says first when the form was sent with an id whose nota was already issued (D-09). */
export const ALREADY_ISSUED_NOTICE = 'Esta nota já foi emitida com este id.'

const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

/** An instant as DD/MM/YYYY, HH:MM in America/Sao_Paulo; text that is not a date (issuedAt can be the government's own date text) comes back as given. */
export const formatDateTime = (value) => (Number.isNaN(Date.parse(value)) ? value : dateTime.format(new Date(value)))

/** The value only when it is a string starting with https://, otherwise undefined: the one test a foreign URL passes before it becomes a link. */
export const httpsHref = (value) => (typeof value === 'string' && value.startsWith('https://') ? value : undefined)

const foreignValue = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const EXPORT_MODES = { 1: 'Transfronteiriço', 2: 'Consumo no Brasil', 3: 'Presença comercial no exterior', 4: 'Movimento temporário de pessoas' }

const NO_NIF_REASONS = { 1: 'Dispensado do NIF', 2: 'NIF não exigido' }

/** The rows with a value: a row whose value is undefined, null or '' is left out. */
const present = (rows) => rows.filter(([, value]) => value !== undefined && value !== null && value !== '')

const resumoRows = (nota) =>
  present([
    ['Situação', statusLabel(nota.status)],
    ['Número da NFS-e', nota.nfseNumber],
    ['Número da DPS', String(nota.dpsNumber)],
    ['Valor', formatBrl(nota.request.valueCents)],
    ['Criada em', formatDateTime(nota.createdAt)],
    ['Emitida em', nota.issuedAt ? formatDateTime(nota.issuedAt) : undefined],
    ['Cancelada em', nota.canceledAt ? formatDateTime(nota.canceledAt) : undefined],
    ['Identificador', nota.id],
  ])

const takerRows = (taker) => {
  if (!taker) return [['Nome', '— (não informado)']]
  const abroad = taker.abroad
  const address = abroad?.address
  const parts = address ? [address.street, address.number, address.complement, address.district, address.city, address.region, address.postalCode] : []
  return present([
    ['Nome', taker.name],
    ['CPF/CNPJ', taker.taxId ? formatTaxId(taker.taxId) : undefined],
    ['NIF', abroad?.nif],
    ['Motivo sem NIF', abroad?.noNifReason ? (NO_NIF_REASONS[abroad.noNifReason] ?? abroad.noNifReason) : undefined],
    ['País', address ? countryName(address.country) : undefined],
    ['Endereço', parts.filter(Boolean).join(', ')],
    ['E-mail', taker.email],
    ['Telefone', taker.phone],
  ])
}

const documentRows = (nota) => {
  const lookup = httpsHref(nota.links?.lookup)
  const pdf = pdfHref(nota)
  return present([
    ['Chave de acesso', nota.accessKey],
    ['Consulta pública', lookup ? { text: 'Abrir na consulta pública', href: lookup, external: true } : undefined],
    ['PDF', pdf ? { text: 'Baixar PDF', href: pdf, download: pdfFilename(nota) } : undefined],
  ])
}

const exportRows = (data) =>
  present([
    ['País do resultado', countryName(data.resultCountry)],
    ['Moeda (código BACEN)', data.currency],
    ['Valor na moeda', foreignValue.format(data.foreignValueCents / 100)],
    ['Modo', data.mode ? `${data.mode} ${EXPORT_MODES[data.mode] ?? ''}`.trim() : undefined],
    ['Vínculo', data.relationship],
    ['Apoio do emissor', data.issuerSupport],
    ['Apoio do tomador', data.takerSupport],
    ['Compartilhar com o MDIC', data.shareWithMdic ? 'Sim' : 'Não'],
  ])

const replacementRows = (nota) => {
  const replaces = nota.request.replaces
  const replaced = replaces?.id ? { text: replaces.id, href: notaHash(replaces.id) } : replaces?.accessKey
  return present([
    ['Substitui', replaced],
    ['Motivo da substituição', replaces ? `${replaces.reasonCode}${replaces.reason ? ` – ${replaces.reason}` : ''}` : undefined],
    ['Substituída por', nota.replacedBy ? { text: nota.replacedBy, href: notaHash(nota.replacedBy) } : undefined],
  ])
}

/**
 * The sections of the details dialog as plain data, always in the order Resumo, Tomador, Serviço, Documento, Exportação,
 * Substituição and only with rows that have a value; a section without rows is left out. Values are plain strings or
 * { text, href } links built here from #nota= hashes, the relative PDF path and an https URL.
 */
export const detailSections = (nota) => {
  const request = nota.request
  const sections = [
    { title: 'Resumo', rows: resumoRows(nota) },
    { title: 'Tomador', rows: takerRows(request.taker) },
    {
      title: 'Serviço',
      rows: present([
        ['Código do serviço', request.serviceCode],
        ['Código NBS', request.nbsCode],
        ['Descrição', request.description],
        ['Competência', listDate(nota)],
      ]),
    },
    { title: 'Documento', rows: documentRows(nota) },
    { title: 'Exportação', rows: request.export ? exportRows(request.export) : [] },
    { title: 'Substituição', rows: replacementRows(nota) },
  ]
  return sections.filter((section) => section.rows.length > 0)
}

/** The boxes of the government's errors: emission first, cancellation second, none for an absent or empty list; the errors are passed through untouched. */
export const errorBoxes = (nota) =>
  [
    { heading: 'Erros na emissão', errors: nota.errors },
    { heading: 'Erros no cancelamento', errors: nota.cancelErrors },
  ].filter((box) => Array.isArray(box.errors) && box.errors.length > 0)

/** The text-only notice of a status: no answer from the government, or a document that is no longer valid. Never an action. */
export const statusNotice = (nota) => {
  if (nota.status === 'pending' || nota.status === 'unknown') return 'O governo não respondeu. A nota será verificada quando o sistema de origem reenviar este id.'
  if (nota.status === 'canceled') return 'Este documento não é mais válido: a nota foi cancelada.'
  if (nota.status === 'replaced') return 'Este documento não é mais válido: a nota foi substituída.'
  return undefined
}
