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
