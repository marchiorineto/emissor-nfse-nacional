// Types of format.js, the panel's browser module. The folder has no allowJs, so tsc needs this file to accept typed imports.
import type { Taker } from '../dps.ts'
import type { GovError, Nota, NotaStatus } from '../notas.ts'

/**
 * A nota as GET /v1/notas returns it: every field except the NFS-e XML, plus the public links of an issued nota. With
 * include=adn it also says where it comes from and this CNPJ's role; an ADN nota has no DPS number but its issuer and events.
 */
export type NotaView = Omit<Nota, 'nfseXml' | 'dpsNumber'> & {
  dpsNumber?: number
  links?: Record<string, string>
  source?: 'local' | 'adn'
  role?: string
  issuer?: { taxId?: string; name?: string }
  events?: Array<{ type: string; at: string }>
}

/** Notas per page. */
export const PAGE_SIZE: 20
/** The statuses in the order the filter offers them. */
export const STATUS_ORDER: readonly NotaStatus[]
/** The pt-BR label of a status; an unknown value comes back as given. */
export function statusLabel(status: string): string
/** The roles in the order the filter offers them. */
export const ROLE_ORDER: readonly string[]
/** The Serviço column: Prestado, Tomado or Intermediado; no role means issued here. */
export function roleLabel(role?: string): string
/** The label of a role in the filter. */
export function roleFilterLabel(role: string): string
/** The Cliente / Prestador cell: the provider of a service this CNPJ took, otherwise the taker. */
export function partyCell(nota: Pick<NotaView, 'role' | 'issuer' | 'request'>): { name: string; detail: string }
/** The role named by a query string when it is a known one, otherwise ''; never throws. */
export function parseRole(search: string): string
/** The query string of both filters, each only when set; '' when neither is. */
export function filterSearch(filters: { status?: string; role?: string }): string
/** Whether the status gets emphasis: rejected or unknown. */
export function isAlertStatus(status: string): boolean
/** Integer cents as R$ 1.234,56. */
export function formatBrl(cents: number): string
/** YYYY-MM-DD as DD/MM/YYYY; anything else as given. */
export function formatCompetence(value: string): string
/** The day of an ISO instant in America/Sao_Paulo, as DD/MM/YYYY. */
export function brasiliaDay(iso: string): string
/** The date column: the competence when set, otherwise the creation day in Brasília. */
export function listDate(nota: Pick<NotaView, 'request' | 'createdAt'>): string
/** CNPJ or CPF with punctuation; any other value as given. */
export function formatTaxId(digits: string): string
/** The pt-BR country name of an ISO alpha-2 code, or the code when unknown. */
export function countryName(code: string): string
/** The Cliente cell: the name and the CPF/CNPJ or country below it. */
export function takerCell(taker?: Taker): { name: string; detail: string }
/** The Número cell: NFS-e number, or the DPS number marked muted. */
export function numberCell(nota: Pick<NotaView, 'nfseNumber' | 'dpsNumber'>): { text: string; muted: boolean }
/** The URL of one list page: limit first, then status and the cursor after the last row shown. */
export function listQuery(options?: { status?: string; role?: string; last?: Pick<NotaView, 'createdAt' | 'id'> }): string
/** The status named by a query string when it is a known one, otherwise '' (Todas); never throws. */
export function parseStatus(search: string): NotaStatus | ''
/** The query string for a status filter: '' for Todas, otherwise '?status=<status>'. */
export function statusSearch(status: string): string
/** Whether a page of this many notas may be followed by another: true only for a full page. */
export function hasMore(count: number): boolean
/** The same-origin download link of a nota's PDF, or undefined when the nota has no access key. */
export function pdfHref(nota: Pick<NotaView, 'id' | 'accessKey'>): string | undefined
/** The file name the download is saved as: nfse-<NFS-e number, else DPS number>.pdf. */
export function pdfFilename(nota: Pick<NotaView, 'nfseNumber' | 'dpsNumber'>): string
/** The id a URL hash (#nota=<id>) names, or '' when there is none; never throws. */
export function parseNotaHash(hash: string): string
/** The URL hash that opens a nota: '#nota=<id>' with the id encoded. */
export function notaHash(id: string): string

/** A value of a detail row: plain text, or a link (a #nota= hash, the same-origin PDF path or an https URL) with its text. */
export type DetailValue = string | { text: string; href: string; download?: string; external?: boolean }
/** One titled block of the details dialog: label and value rows, in display order. */
export type DetailSection = { title: string; rows: Array<[label: string, value: DetailValue]> }
/** The government's errors of one operation under their heading; the errors are untouched. */
export type ErrorBox = { heading: string; errors: GovError[] }
/** A moment as DD/MM/YYYY, HH:MM in America/Sao_Paulo; text that is not a date comes back as given. */
export function formatDateTime(value: string): string
/** The value only when it is a string starting with https://, otherwise undefined. */
export function httpsHref(value: unknown): string | undefined
/** The sections of the details dialog, in the fixed order Resumo, Tomador, Serviço, Documento, Exportação, Substituição. */
export function detailSections(nota: NotaView): DetailSection[]
/** The error boxes of the dialog: emission first, then cancellation; none for an absent or empty list. */
export function errorBoxes(nota: NotaView): ErrorBox[]
/** The text-only notice of a status (no answer, canceled, replaced), or undefined. */
export function statusNotice(nota: NotaView): string | undefined
