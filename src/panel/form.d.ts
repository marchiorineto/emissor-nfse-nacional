// Types of form.js, the issue form's pure helpers. The folder has no allowJs, so tsc needs this file to accept typed imports.
// The storage types are structural because tsconfig has no DOM lib.
import type { NotaView } from './format.d.ts'

/** The ten fields of the form, as typed (strings, nothing parsed yet). */
export type IssueFields = {
  id: string
  taxId: string
  name: string
  email: string
  phone: string
  serviceCode: string
  nbsCode: string
  description: string
  value: string
  competence: string
}
/** The name of one field; the form's elements are `#field-<name>`. */
export type FieldName = keyof IssueFields
/** The POST /v1/notas body the form builds: optional keys are absent, never ''. */
export type IssueBody = {
  id: string
  competence: string
  serviceCode: string
  description: string
  valueCents: number
  nbsCode?: string
  taker?: { taxId: string; name: string; email?: string; phone?: string }
}

/** The calendar day in America/Sao_Paulo as YYYY-MM-DD. */
export function brasiliaToday(now?: Date): string
/** A suggested sale id: painel-AAAAMMDD-xxxxxx, six random characters of [a-z0-9] with rejection sampling. */
export function suggestId(now?: Date, bytes?: (count: number) => Uint8Array): string
/** Brazilian currency text as integer cents, never through floating point; undefined unless greater than zero. */
export function parseBrl(text: string): number | undefined
/** The digits of a text. */
export function digitsOnly(text: string): string
/** The POST /v1/notas body of the form; empty optional fields and an empty taker are left out. */
export function buildIssueBody(fields: IssueFields): IssueBody
/** One pt-BR message per field that fails the rules checked before sending; {} when the form may be sent. */
export function validateForm(fields: IssueFields, today: string): Partial<Record<FieldName, string>>
/** The form field and pt-BR message for a 400 message of parseIssueRequest; an unknown message keeps the API text. */
export function issueProblem(message: string): { field: FieldName | ''; message: string }
/** Whether the nota answered by a POST existed before the request started (issued, canceled or replaced, updated earlier). */
export function isAlreadyIssued(nota: Pick<NotaView, 'status' | 'updatedAt'>, answer: { date: string | null; elapsedMs: number }): boolean
/** The pt-BR hints for a rejected issue: a 2xx the government sent with an error, and the competence rule E0015. */
export function issueHints(nota: { errors?: Array<{ code: string }> }): string[]
/** The localStorage key of the remembered service fields. */
export const SERVICE_DEFAULTS_KEY: string
/** The remembered serviceCode, nbsCode and description; {} when storage is missing, malformed or throws. */
export function loadServiceDefaults(storage?: { getItem(key: string): string | null }): Partial<Pick<IssueFields, 'serviceCode' | 'nbsCode' | 'description'>>
/** Remembers serviceCode, nbsCode and description only; never throws. */
export function saveServiceDefaults(storage: { setItem(key: string, value: string): void } | undefined, fields: IssueFields): void
