// Types of format.js, the panel's browser module. The folder has no allowJs, so tsc needs this file to accept typed imports.
import type { Taker } from '../dps.ts'
import type { Nota, NotaStatus } from '../notas.ts'

/** A nota as GET /v1/notas returns it: every field except the NFS-e XML, plus the public links of an issued nota. */
export type NotaView = Omit<Nota, 'nfseXml'> & { links?: Record<string, string> }

/** Notas per page. */
export const PAGE_SIZE: 20
/** The statuses in the order the filter offers them. */
export const STATUS_ORDER: readonly NotaStatus[]
/** The pt-BR label of a status; an unknown value comes back as given. */
export function statusLabel(status: string): string
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
export function listQuery(options?: { status?: string; last?: Pick<NotaView, 'createdAt' | 'id'> }): string
/** The status named by a query string when it is a known one, otherwise '' (Todas); never throws. */
export function parseStatus(search: string): NotaStatus | ''
/** The query string for a status filter: '' for Todas, otherwise '?status=<status>'. */
export function statusSearch(status: string): string
