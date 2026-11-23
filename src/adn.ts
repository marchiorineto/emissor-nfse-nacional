// The government's own list of this CNPJ's NFS-e, mirrored into SQLite from the ADN distribution
// (GET /contribuintes/DFe/{NSU}): notas issued here or elsewhere, received as taker or as intermediary, and their events.
// The ADN only answers "the documents after NSU n, up to 50 at a time", so the mirror remembers the last NSU it read.
import type { DatabaseSync } from 'node:sqlite'
import { gunzipSync } from 'node:zlib'
import { publicLookupUrl } from './danfse.ts'
import { unescapeXml, xmlValue } from './dps.ts'
import type { Gov, Nota, NotaStatus } from './notas.ts'

/** How this CNPJ appears on a nota. */
export type AdnRole = 'issuer' | 'taker' | 'intermediary' | 'other'
export const ADN_ROLES: readonly AdnRole[] = ['issuer', 'taker', 'intermediary', 'other']

export interface AdnParty {
  taxId?: string
  name?: string
}

/** One NFS-e as the mirror knows it. */
export interface AdnNota {
  accessKey: string
  role: AdnRole
  status: Extract<NotaStatus, 'issued' | 'canceled' | 'replaced'>
  nfseNumber?: string
  issuedAt: string
  competence?: string
  issuer: AdnParty
  taker?: AdnParty
  valueCents?: number
  serviceCode?: string
  description?: string
  replacesKey?: string
  /** Access key of the nota that replaced this one, when it is in the mirror. */
  replacedBy?: string
  nsu: number
  events: Array<{ type: string; at: string; nsu: number }>
}

/** A document of a batch, ready to store. */
export type AdnDocument =
  | { kind: 'nfse'; nsu: number; nota: Omit<AdnNota, 'status' | 'replacedBy' | 'events'> }
  | { kind: 'event'; nsu: number; accessKey: string; type: string; at: string }
  | { kind: 'ignored'; nsu: number }

export interface AdnSyncState {
  /** The last NSU stored; the next call asks for the documents after it. */
  lastNsu: number
  lastRunAt?: string
  /** When the ADN last said there was nothing after lastNsu. */
  caughtUpAt?: string
  /** Why the last run stopped early, if it did. */
  error?: string
  /** NFS-e in the mirror. */
  count: number
}

/** Event types that end a nota. */
const CANCELING_EVENTS = ['CANCELAMENTO', 'CANCELAMENTO_DEFERIDO_ANALISE_FISCAL', 'CANCELAMENTO_POR_OFICIO']
const REPLACING_EVENT = 'CANCELAMENTO_POR_SUBSTITUICAO'
/** The event codes of the XML, for an answer that leaves TipoEvento out. */
const EVENT_CODES: Record<string, string> = { e101101: 'CANCELAMENTO', e105102: REPLACING_EVENT }
/** "No documents after this NSU": the normal end of a run, not a failure. */
const CAUGHT_UP = 'E2220'

// --- XML -------------------------------------------------------------------------------------------------------------

/** The content of the first `<tag ...>...</tag>`, or undefined. */
const block = (xml: string | undefined, tag: string): string | undefined =>
  xml?.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1]

const text = (xml: string | undefined, tag: string): string | undefined => {
  const value = xml === undefined ? undefined : xmlValue(xml, tag)
  return value === undefined || value === '' ? undefined : unescapeXml(value).trim()
}

const partyOf = (xml: string | undefined): AdnParty | undefined => {
  if (!xml) return undefined
  const taxId = text(xml, 'CNPJ') ?? text(xml, 'CPF') ?? text(xml, 'NIF')
  const name = text(xml, 'xNome')
  return taxId || name ? { taxId, name } : undefined
}

/** A date of the layout (with its offset) as UTC ISO, so it sorts with the local notas; text that is not a date as given. */
const utc = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isNaN(time) ? value : new Date(time).toISOString()
}

const digitsOnly = (value: string | undefined): string => (value ?? '').replace(/\D/g, '')

/** The fields of an NFS-e XML that the list and the details need; `ownTaxId` decides the role. */
export const parseNfseXml = (xml: string, ownTaxId: string, fallback: { accessKey?: string; at?: string } = {}): Omit<AdnNota, 'status' | 'replacedBy' | 'events' | 'nsu'> | undefined => {
  const inf = block(xml, 'infNFSe') ?? xml
  const accessKey = xml.match(/Id="NFS(\d{50})"/)?.[1] ?? fallback.accessKey
  if (!accessKey) return undefined
  const dps = block(inf, 'infDPS') ?? inf
  const emit = partyOf(block(inf, 'emit'))
  const prest = partyOf(block(dps, 'prest'))
  const toma = partyOf(block(dps, 'toma'))
  const interm = partyOf(block(dps, 'interm'))
  const issuer: AdnParty = { taxId: emit?.taxId ?? prest?.taxId, name: emit?.name ?? prest?.name }
  const own = digitsOnly(ownTaxId)
  const is = (party: AdnParty | undefined) => Boolean(own) && digitsOnly(party?.taxId) === own
  const role: AdnRole = is(issuer) || is(prest) ? 'issuer' : is(toma) ? 'taker' : is(interm) ? 'intermediary' : 'other'
  const value = text(dps, 'vServ')
  return {
    accessKey,
    role,
    nfseNumber: text(inf, 'nNFSe'),
    issuedAt: utc(text(inf, 'dhProc') ?? text(dps, 'dhEmi') ?? fallback.at) ?? new Date(0).toISOString(),
    competence: text(dps, 'dCompet'),
    issuer,
    taker: toma,
    valueCents: value === undefined || Number.isNaN(Number(value)) ? undefined : Math.round(Number(value) * 100),
    serviceCode: text(dps, 'cTribNac'),
    description: text(dps, 'xDescServ'),
    replacesKey: text(dps, 'chSubstda'),
  }
}

/** A field of the ADN answer, which may come in PascalCase or camelCase. */
const field = (json: Record<string, unknown>, name: string): unknown => json[name] ?? json[name.charAt(0).toLowerCase() + name.slice(1)] ?? json[name.toLowerCase()]

/** The XML of a distributed document: gzip then base64, or plain base64 for an answer that skips the gzip. */
export const decodeDocumentXml = (value: string): string => {
  const bytes = Buffer.from(value, 'base64')
  try {
    return gunzipSync(bytes).toString('utf8')
  } catch {
    return bytes.toString('utf8')
  }
}

/** One item of LoteDFe as a document to store. */
export const parseDocument = (item: Record<string, unknown>, ownTaxId: string): AdnDocument | undefined => {
  const nsu = Number(field(item, 'NSU'))
  if (!Number.isSafeInteger(nsu)) return undefined
  const type = String(field(item, 'TipoDocumento') ?? '').toUpperCase()
  const file = field(item, 'ArquivoXml')
  const xml = typeof file === 'string' && file ? decodeDocumentXml(file) : ''
  const key = String(field(item, 'ChaveAcesso') ?? '') || undefined
  const at = String(field(item, 'DataHoraGeracao') ?? '') || undefined
  if (type === 'NFSE') {
    const nota = xml ? parseNfseXml(xml, ownTaxId, { accessKey: key, at }) : undefined
    return nota ? { kind: 'nfse', nsu, nota: { ...nota, nsu } } : { kind: 'ignored', nsu }
  }
  if (type === 'EVENTO') {
    const code = Object.keys(EVENT_CODES).find((tag) => xml.includes(`<${tag}>`) || xml.includes(`<${tag} `))
    const eventType = String(field(item, 'TipoEvento') ?? '') || (code ? EVENT_CODES[code] : undefined) || 'OUTRO'
    const accessKey = key ?? text(xml, 'chNFSe')
    if (!accessKey) return { kind: 'ignored', nsu }
    return { kind: 'event', nsu, accessKey, type: eventType, at: utc(text(xml, 'dhProc') ?? at) ?? new Date(0).toISOString() }
  }
  // DPS, PEDIDO_REGISTRO_EVENTO, CNC: nothing the list shows.
  return { kind: 'ignored', nsu }
}

// --- Store -----------------------------------------------------------------------------------------------------------

/** The status of the nota with access key `key` (a SQL expression), worked out from its events and its substitute. */
const statusSql = (key: string): string => `CASE
  WHEN EXISTS (SELECT 1 FROM adn_events e WHERE e.access_key = ${key} AND e.event_type = '${REPLACING_EVENT}')
    OR EXISTS (SELECT 1 FROM adn_nfse r WHERE r.replaces_key = ${key}) THEN 'replaced'
  WHEN EXISTS (SELECT 1 FROM adn_events e WHERE e.access_key = ${key} AND e.event_type IN (${CANCELING_EVENTS.map((type) => `'${type}'`).join(', ')})) THEN 'canceled'
  ELSE 'issued' END`

/** A row of the merged list: a nota issued through this API, or one only the ADN knows. */
export type ListedNota = { source: 'local'; nota: Nota } | { source: 'adn'; nota: AdnNota }

export interface ListOptions {
  status?: NotaStatus
  role?: AdnRole
  limit: number
  before?: string
  beforeId?: string
}

export interface AdnStore {
  state(): AdnSyncState
  /** Records how a run went; `undefined` clears a field. */
  setState(changes: Partial<Record<'lastRunAt' | 'caughtUpAt' | 'error', string | undefined>>): void
  /** Stores one batch and moves lastNsu forward, all or nothing. */
  saveBatch(documents: AdnDocument[], lastNsu: number, at: string): void
  get(accessKey: string): AdnNota | null
  /**
   * The local notas and the ADN's, one list, newest first (createdAt for a local nota, the processing time for an ADN
   * one, then id). An ADN nota whose access key a local nota holds is shown once, as the local nota. Local notas count
   * as issued by this CNPJ for the role filter.
   */
  list(options: ListOptions): ListedNota[]
}

export const createAdnStore = (db: DatabaseSync): AdnStore => {
  const readState = db.prepare('SELECT name, value FROM adn_sync')
  const writeState = db.prepare('INSERT INTO adn_sync (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value')
  const clearState = db.prepare('DELETE FROM adn_sync WHERE name = ?')
  const countNotas = db.prepare('SELECT COUNT(*) AS count FROM adn_nfse')
  const upsertNota = db.prepare(`INSERT INTO adn_nfse (access_key, role, nfse_number, issued_at, competence, issuer_tax_id, issuer_name, taker_tax_id,
      taker_name, value_cents, service_code, description, replaces_key, nsu, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (access_key) DO UPDATE SET role = excluded.role, nfse_number = excluded.nfse_number, issued_at = excluded.issued_at,
      competence = excluded.competence, issuer_tax_id = excluded.issuer_tax_id, issuer_name = excluded.issuer_name,
      taker_tax_id = excluded.taker_tax_id, taker_name = excluded.taker_name, value_cents = excluded.value_cents,
      service_code = excluded.service_code, description = excluded.description, replaces_key = excluded.replaces_key,
      nsu = excluded.nsu, updated_at = excluded.updated_at`)
  const insertEvent = db.prepare('INSERT OR IGNORE INTO adn_events (nsu, access_key, event_type, at) VALUES (?, ?, ?, ?)')
  const getNota = db.prepare(`SELECT *, ${statusSql('adn_nfse.access_key')} AS status FROM adn_nfse WHERE access_key = ?`)
  const getEvents = db.prepare('SELECT nsu, event_type, at FROM adn_events WHERE access_key = ? ORDER BY nsu')
  const getReplacement = db.prepare('SELECT access_key FROM adn_nfse WHERE replaces_key = ? ORDER BY nsu DESC LIMIT 1')

  const state = (): AdnSyncState => {
    const values = new Map(readState.all().map((row) => [String(row.name), String(row.value)]))
    return {
      lastNsu: Number(values.get('lastNsu') ?? 0),
      lastRunAt: values.get('lastRunAt'),
      caughtUpAt: values.get('caughtUpAt'),
      error: values.get('error'),
      count: Number(countNotas.get()?.count ?? 0),
    }
  }

  const setState: AdnStore['setState'] = (changes) => {
    for (const [name, value] of Object.entries(changes)) {
      if (value === undefined) clearState.run(name)
      else writeState.run(name, value)
    }
  }

  const saveBatch: AdnStore['saveBatch'] = (documents, lastNsu, at) => {
    db.exec('BEGIN')
    try {
      for (const document of documents) {
        if (document.kind === 'nfse') {
          const { nota } = document
          upsertNota.run(
            nota.accessKey,
            nota.role,
            nota.nfseNumber ?? null,
            nota.issuedAt,
            nota.competence ?? null,
            nota.issuer.taxId ?? null,
            nota.issuer.name ?? null,
            nota.taker?.taxId ?? null,
            nota.taker?.name ?? null,
            nota.valueCents ?? null,
            nota.serviceCode ?? null,
            nota.description ?? null,
            nota.replacesKey ?? null,
            document.nsu,
            at,
          )
        } else if (document.kind === 'event') {
          insertEvent.run(document.nsu, document.accessKey, document.type, document.at)
        }
      }
      writeState.run('lastNsu', String(lastNsu))
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  const optional = (value: unknown): string | undefined => (value === null || value === undefined ? undefined : String(value))

  const get: AdnStore['get'] = (accessKey) => {
    const row = getNota.get(accessKey)
    if (!row) return null
    const taker = row.taker_tax_id !== null || row.taker_name !== null ? { taxId: optional(row.taker_tax_id), name: optional(row.taker_name) } : undefined
    return {
      accessKey,
      role: String(row.role) as AdnRole,
      status: String(row.status) as AdnNota['status'],
      nfseNumber: optional(row.nfse_number),
      issuedAt: String(row.issued_at),
      competence: optional(row.competence),
      issuer: { taxId: optional(row.issuer_tax_id), name: optional(row.issuer_name) },
      taker,
      valueCents: row.value_cents === null ? undefined : Number(row.value_cents),
      serviceCode: optional(row.service_code),
      description: optional(row.description),
      replacesKey: optional(row.replaces_key),
      replacedBy: optional(getReplacement.get(accessKey)?.access_key),
      nsu: Number(row.nsu),
      events: getEvents.all(accessKey).map((event) => ({ type: String(event.event_type), at: String(event.at), nsu: Number(event.nsu) })),
    }
  }

  const list: AdnStore['list'] = ({ status, role, limit, before, beforeId }) => {
    const filters: string[] = []
    const params: Array<string | number> = []
    if (status) {
      filters.push('status = ?')
      params.push(status)
    }
    if (role) {
      filters.push('role = ?')
      params.push(role)
    }
    if (before && beforeId) {
      filters.push('(at, id) < (?, ?)')
      params.push(before, beforeId)
    } else if (before) {
      filters.push('at < ?')
      params.push(before)
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const rows = db
      .prepare(
        `SELECT source, id, data FROM (
           SELECT 'local' AS source, id, created_at AS at, status, 'issuer' AS role, data FROM notas
           UNION ALL
           SELECT 'adn', a.access_key, a.issued_at, ${statusSql('a.access_key')}, a.role, NULL FROM adn_nfse a
           WHERE NOT EXISTS (SELECT 1 FROM notas n WHERE json_extract(n.data, '$.accessKey') = a.access_key)
         ) ${where} ORDER BY at DESC, id DESC LIMIT ?`,
      )
      .all(...params, limit)
    return rows.flatMap((row): ListedNota[] => {
      if (row.source === 'local') return [{ source: 'local', nota: JSON.parse(String(row.data)) as Nota }]
      const nota = get(String(row.id))
      return nota ? [{ source: 'adn', nota }] : []
    })
  }

  return { state, setState, saveBatch, get, list }
}

// --- Sync ------------------------------------------------------------------------------------------------------------

export interface AdnSyncStatus extends AdnSyncState {
  running: boolean
  /** Documents read by this run. */
  fetched: number
  /** Whether this run reached the end of the distribution. */
  caughtUp: boolean
  /** Why this run did not call the ADN. */
  skipped?: 'cooldown'
  /** When an automatic run will call the ADN again. */
  nextRunAt?: string
}

export interface AdnSync {
  /**
   * Reads batches after lastNsu until the ADN says there is nothing more, a call fails, or `budgetMs` runs out. After
   * the end it waits `cooldownMs` before calling again (`force` waits only `forceCooldownMs`). Only one run at a time:
   * a call during a run gets that run's result.
   */
  run(options?: { force?: boolean; budgetMs?: number }): Promise<AdnSyncStatus>
  status(): AdnSyncStatus
}

export interface AdnSyncDeps {
  store: AdnStore
  gov: Gov
  /** The ADN host of the environment. */
  host: string
  /** The CNPJ whose documents these are (the certificate's), to tell issued from received. */
  ownTaxId: string
  cooldownMs: number
  forceCooldownMs?: number
  now?: () => number
}

const DEFAULT_BUDGET_MS = 20_000

export const createAdnSync = ({ store, gov, host, ownTaxId, cooldownMs, forceCooldownMs = 60_000, now = Date.now }: AdnSyncDeps): AdnSync => {
  let running: Promise<AdnSyncStatus> | undefined

  const nextRunAt = (state: AdnSyncState): string | undefined =>
    state.caughtUpAt && !state.error ? new Date(Date.parse(state.caughtUpAt) + cooldownMs).toISOString() : undefined

  const status = (extra: Partial<AdnSyncStatus> = {}): AdnSyncStatus => {
    const state = store.state()
    return { ...state, running: Boolean(running), fetched: 0, caughtUp: false, nextRunAt: nextRunAt(state), ...extra }
  }

  const errorOf = (code: number, json: Record<string, unknown>): string => {
    const errors = field(json, 'Erros')
    const list = Array.isArray(errors) ? (errors as Array<Record<string, unknown>>) : []
    const described = list.map((error) => [field(error, 'Codigo'), field(error, 'Descricao'), field(error, 'Complemento')].filter(Boolean).join(' ')).join('; ')
    return described || `HTTP ${code} ${typeof json.raw === 'string' ? json.raw.slice(0, 200) : ''}`.trim()
  }

  const execute = async (force: boolean, budgetMs: number): Promise<AdnSyncStatus> => {
    const started = now()
    const before = store.state()
    const wait = force ? forceCooldownMs : cooldownMs
    if (before.caughtUpAt && !before.error && started - Date.parse(before.caughtUpAt) < wait) return status({ skipped: 'cooldown' })

    let fetched = 0
    let caughtUp = false
    let error: string | undefined
    let lastNsu = before.lastNsu
    while (now() - started < budgetMs) {
      const result = await gov.get(host, `/contribuintes/DFe/${lastNsu}?lote=true`)
      if (!result.reached) {
        error = result.error
        break
      }
      const { status: code, json } = result
      const processing = String(field(json, 'StatusProcessamento') ?? '')
      const errors = field(json, 'Erros')
      const hasCaughtUpCode = Array.isArray(errors) && errors.some((item) => String(field(item as Record<string, unknown>, 'Codigo')) === CAUGHT_UP)
      if (processing === 'NENHUM_DOCUMENTO_LOCALIZADO' || hasCaughtUpCode) {
        caughtUp = true
        break
      }
      // A rejection can come with HTTP 400 and DOCUMENTOS_LOCALIZADOS, so the HTTP status decides.
      if (code !== 200) {
        error = errorOf(code, json)
        break
      }
      const items = field(json, 'LoteDFe')
      const documents = (Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [])
        .map((item) => parseDocument(item, ownTaxId))
        .filter((document): document is AdnDocument => document !== undefined)
      const highest = Math.max(lastNsu, ...documents.map((document) => document.nsu))
      if (highest <= lastNsu) {
        caughtUp = true
        break
      }
      store.saveBatch(documents, highest, new Date(now()).toISOString())
      fetched += documents.length
      lastNsu = highest
    }
    const at = new Date(now()).toISOString()
    store.setState({ lastRunAt: at, error, ...(caughtUp ? { caughtUpAt: at } : fetched ? { caughtUpAt: undefined } : {}) })
    return { ...status(), running: false, fetched, caughtUp }
  }

  return {
    run: ({ force = false, budgetMs = DEFAULT_BUDGET_MS } = {}) => {
      running ??= execute(force, budgetMs).finally(() => {
        running = undefined
      })
      return running
    },
    status: () => status(),
  }
}

// --- API view --------------------------------------------------------------------------------------------------------

/**
 * An ADN nota in the shape of the API's notas (id, status, request...), so the panel lists and shows both the same way.
 * Its id is the access key; it has no DPS number and no signed links, only the public lookup.
 */
export const adnView = (nota: AdnNota): Record<string, unknown> => ({
  id: nota.accessKey,
  source: 'adn',
  role: nota.role,
  status: nota.status,
  accessKey: nota.accessKey,
  nfseNumber: nota.nfseNumber,
  issuedAt: nota.issuedAt,
  createdAt: nota.issuedAt,
  updatedAt: nota.issuedAt,
  ...(nota.status === 'canceled' ? { canceledAt: nota.events.find((event) => CANCELING_EVENTS.includes(event.type))?.at } : {}),
  ...(nota.replacedBy ? { replacedBy: nota.replacedBy } : {}),
  request: {
    id: nota.accessKey,
    competence: nota.competence,
    taker: nota.taker ? { name: nota.taker.name ?? '', ...(nota.taker.taxId && /^\d{11}$|^\d{14}$/.test(nota.taker.taxId) ? { taxId: nota.taker.taxId } : {}) } : undefined,
    serviceCode: nota.serviceCode,
    description: nota.description,
    valueCents: nota.valueCents ?? 0,
    ...(nota.replacesKey ? { replaces: { accessKey: nota.replacesKey } } : {}),
  },
  issuer: nota.issuer,
  events: nota.events,
  links: { lookup: publicLookupUrl(nota.accessKey) },
})
