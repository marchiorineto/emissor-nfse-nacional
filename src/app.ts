import { createHmac } from 'node:crypto'
import { Hono, type MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { registerAdmin } from './admin.ts'
import { ADN_ROLES, adnView, type AdnRole, type AdnStore, type AdnSync } from './adn.ts'
import { configFrom, configProblems } from './config.ts'
import { hosts, type Environment } from './dps.ts'
import { publicLookupUrl, renderDanfse } from './danfse.ts'
import type { Env } from './env.ts'
import type { Certificate } from './gov.ts'
import { createNotas, isNotaError, type Gov, type Nota, type NotaStatus, type Repo } from './notas.ts'
import { parseHash } from './password.ts'
import { parseIssueRequest } from './request.ts'
import { SESSION_COOKIE, csrfToken, readSession, sessionKey, timingSafeEqual } from './session.ts'

export interface AppDeps {
  env: Env
  repo: Repo
  gov: Gov
  certificate: () => Certificate | { error: string }
  /** Clock in milliseconds; tests inject it. Defaults to Date.now. */
  now?: () => number
  /** The mirror of the ADN distribution; without it the list holds only the notas issued here. */
  adn?: { store: AdnStore; sync: AdnSync }
}

const ACCESS_KEY = /^\d{50}$/

const NOTA_STATUSES: readonly NotaStatus[] = ['pending', 'unknown', 'issued', 'rejected', 'canceled', 'replaced']
const MAX_LIST = 100
const DEFAULT_LIST = 50
const STATUS_CODE: Record<NotaStatus, 200 | 202 | 422> = { issued: 200, canceled: 200, replaced: 200, rejected: 422, pending: 202, unknown: 202 }

/**
 * The startup log line about the admin panel: off (ADMIN_PASSWORD empty), misconfigured (a value that is not a valid
 * hash, so every login fails closed; a warning) or on. It never includes the value itself.
 */
export const adminPanelNotice = (env: Env): { warn: boolean; message: string } => {
  if (!env.ADMIN_PASSWORD) return { warn: false, message: 'nfse: admin panel off (ADMIN_PASSWORD is empty); run pnpm run admin-password to turn it on' }
  if (!parseHash(env.ADMIN_PASSWORD)) return { warn: true, message: 'nfse: ADMIN_PASSWORD is not a valid hash; every login will fail. Run pnpm run admin-password and restart' }
  return { warn: false, message: 'nfse: admin panel on /admin' }
}

/**
 * `listLimit(value)` is the page size of GET /v1/notas: the integer part of `value`, at most MAX_LIST; DEFAULT_LIST when it is absent, empty,
 * zero, negative or not a number. Closes the CONCERNS.md issue where a negative limit disabled the cap (SQLite treats a
 * negative LIMIT as none); valid values keep their meaning (D-04).
 */
const listLimit = (value: string | undefined): number => {
  const limit = Math.trunc(Number(value))
  return limit >= 1 ? Math.min(limit, MAX_LIST) : DEFAULT_LIST
}

export const createApp = ({ env, repo, gov, certificate, now = Date.now, adn }: AppDeps): Hono => {
  const notas = () => createNotas({ repo, gov, config: configFrom(env) })

  /** Signature of the public links of a nota: whoever has the link (the buyer's email) can download it, nobody can guess one. */
  const linkSignature = (id: string): string => createHmac('sha256', `links:${env.API_TOKEN}`).update(id).digest('hex').slice(0, 32)

  /** Public links of an issued nota: the PDF, the XML and the government's lookup. */
  const linksOf = (origin: string, nota: Nota): Record<string, string> | undefined => {
    if (!nota.accessKey) return undefined
    const base = `${origin}/notas/${encodeURIComponent(nota.id)}`
    const sig = linkSignature(nota.id)
    return { pdf: `${base}/nfse.pdf?sig=${sig}`, xml: `${base}/nfse.xml?sig=${sig}`, lookup: publicLookupUrl(nota.accessKey) }
  }

  /** The nota as the API shows it, with its public links; the NFS-e XML only on request. */
  const view = (origin: string, nota: Nota, withXml = false): Record<string, unknown> => {
    const { nfseXml, ...rest } = nota
    const links = linksOf(origin, nota)
    return { ...rest, ...(links ? { links } : {}), ...(withXml ? { nfseXml } : {}) }
  }

  /** Where the public links point: PUBLIC_URL behind a proxy, otherwise the address the request came to. */
  const originOf = (url: string): string => env.PUBLIC_URL || new URL(url).origin

  const app = new Hono()

  /**
   * The panel is off, and its routes are never registered, when ADMIN_PASSWORD is empty (AUTH-01). The key is derived
   * once at startup, so a new hash ends every session after a restart (D-01, D-02).
   */
  const admin = env.ADMIN_PASSWORD ? { key: sessionKey(env.ADMIN_PASSWORD) } : undefined

  /**
   * Bearer token first, exactly as before, for external systems (D-19); otherwise the admin session cookie, which also
   * needs X-CSRF-Token on every method but GET and HEAD (D-16, D-18).
   */
  const requireAuth: MiddlewareHandler = async (c, next) => {
    const header = c.req.header('authorization')
    if (header !== undefined || !admin) {
      const token = header?.replace(/^Bearer /, '') ?? ''
      if (!env.API_TOKEN || !timingSafeEqual(token, env.API_TOKEN)) return c.json({ error: 'unauthorized' }, 401)
      return next()
    }
    // One answer whatever is wrong with the cookie: missing, empty, expired, tampered or signed under another hash (D-05).
    const session = readSession(admin.key, getCookie(c, SESSION_COOKIE), now())
    if (!session) return c.json({ error: 'unauthorized' }, 401)
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !timingSafeEqual(c.req.header('x-csrf-token') ?? '', csrfToken(admin.key, session.id))) {
      return c.json({ error: 'invalid csrf token' }, 403)
    }
    await next()
  }

  app.use('/v1/*', requireAuth)
  // /health too: with ?deep=1 it calls the government with the certificate.
  app.use('/health', requireAuth)
  if (admin) registerAdmin(app, { env, key: admin.key, now })

  /** Checks the settings and the certificate's expiry; `?deep=1` also asks the government. */
  app.get('/health', async (c) => {
    const environment = env.NFSE_ENVIRONMENT
    const config = configProblems(env)
    const current = certificate()
    const cert = 'error' in current ? { error: current.error } : { notAfter: current.notAfter }
    const isHealthy = !('error' in current) && !config.length
    if (!isHealthy || c.req.query('deep') !== '1') {
      return c.json({ ok: isHealthy, environment, ...(config.length ? { config } : {}), certificate: cert }, isHealthy ? 200 : 503)
    }
    // A read-only call to the government over mTLS: proves the certificate is accepted and the city is on the system.
    const { adn } = hosts[environment as Environment]
    const agreement = await gov.get(adn, `/parametrizacao/${env.ISSUER_CITY_CODE}/convenio`)
    const isActive = agreement.reached && agreement.status === 200
    return c.json({ ok: isActive, environment, certificate: cert, cityAgreement: agreement }, isActive ? 200 : 503)
  })

  app.onError((error, c) => {
    if (isNotaError(error)) return c.json({ error: error.message }, error.status as 404)
    console.error('nfse: unexpected error', error)
    return c.json({ error: 'internal error' }, 500)
  })

  /** Issues the nota, or returns the one already issued for `id`. */
  app.post('/v1/notas', async (c) => {
    const request = parseIssueRequest(await c.req.json().catch(() => null))
    if (typeof request === 'string') return c.json({ error: request }, 400)
    const nota = await notas().issue(request)
    console.log('nfse: issue', { id: nota.id, status: nota.status, dps: nota.dpsNumber, errors: nota.errors })
    return c.json(view(originOf(c.req.url), nota), STATUS_CODE[nota.status])
  })

  /**
   * The notas issued here, newest first. With `include=adn`, one list with the notas the government's ADN distributed to
   * this CNPJ (issued elsewhere, received as taker or intermediary); each then carries `source` and `role`, and `role`
   * filters by it.
   */
  app.get('/v1/notas', async (c) => {
    const status = c.req.query('status') as NotaStatus | undefined
    if (status && !NOTA_STATUSES.includes(status)) return c.json({ error: `status: one of ${NOTA_STATUSES.join(', ')}` }, 400)
    const limit = listLimit(c.req.query('limit'))
    const before = c.req.query('before')
    const beforeId = c.req.query('beforeId')
    const origin = originOf(c.req.url)
    if (adn && c.req.query('include') === 'adn') {
      const role = c.req.query('role') as AdnRole | undefined
      if (role && !ADN_ROLES.includes(role)) return c.json({ error: `role: one of ${ADN_ROLES.join(', ')}` }, 400)
      const list = adn.store.list({ status, role, limit, before, beforeId })
      return c.json({
        notas: list.map((item) => (item.source === 'local' ? { ...view(origin, item.nota), source: 'local', role: 'issuer' } : adnView(item.nota))),
      })
    }
    const list = await notas().list({ status, limit, before, beforeId })
    return c.json({ notas: list.map((nota) => view(origin, nota)) })
  })

  /** A nota issued here by its id; otherwise, when the id is an access key the ADN distributed, that nota. */
  app.get('/v1/notas/:id', async (c) => {
    const id = c.req.param('id')
    const nota = await notas().get(id)
    if (nota) return c.json(view(originOf(c.req.url), nota, c.req.query('xml') === '1'))
    const fromAdn = adn && ACCESS_KEY.test(id) ? adn.store.get(id) : null
    return fromAdn ? c.json(adnView(fromAdn)) : c.json({ error: 'nota not found' }, 404)
  })

  /** Where the ADN mirror stands; POST runs a sync step (`?force=1` skips most of the wait after the last one). */
  app.get('/v1/adn/sync', (c) => (adn ? c.json(adn.sync.status()) : c.json({ error: 'ADN sync is off' }, 404)))
  app.post('/v1/adn/sync', async (c) => {
    if (!adn) return c.json({ error: 'ADN sync is off' }, 404)
    const result = await adn.sync.run({ force: c.req.query('force') === '1' })
    if (result.fetched || result.error) console.log('nfse: adn sync', { fetched: result.fetched, lastNsu: result.lastNsu, caughtUp: result.caughtUp, error: result.error })
    return c.json(result)
  })

  /** The PDF of a nota only the ADN knows: its authorized XML from SEFIN, rendered here. */
  const adnPdf = async (accessKey: string): Promise<{ pdf: Uint8Array; number: string } | null> => {
    const nota = adn?.store.get(accessKey)
    if (!nota) return null
    const { sefin } = hosts[env.NFSE_ENVIRONMENT as Environment]
    const result = await gov.get(sefin, `/SefinNacional/nfse/${accessKey}`)
    const xml = result.reached && result.status === 200 ? result.json.nfseXml : undefined
    if (typeof xml !== 'string') throw Object.assign(new Error('the government did not return the XML of this nota; try again'), { status: 502 })
    const pdf = await renderDanfse(xml, { isCanceled: nota.status !== 'issued' })
    return { pdf, number: nota.nfseNumber ?? accessKey }
  }

  /**
   * The nota's PDF. `?download=1` is the panel's opt-in (D-18): it answers `attachment`, with the file named by the
   * NFS-e (or DPS) number because the id is free text that may not fit in a header (RESEARCH Pitfall 7). Without it the
   * answer stays inline for Bearer clients; that inline filename still uses the id, a known pre-existing issue for ids
   * outside Latin-1, left as is.
   */
  app.get('/v1/notas/:id/pdf', async (c) => {
    const id = c.req.param('id')
    const service = notas()
    if (adn && ACCESS_KEY.test(id) && !(await service.get(id))) {
      const found = await adnPdf(id)
      if (!found) return c.json({ error: 'nota not found' }, 404)
      const number = found.number.replace(/[^0-9A-Za-z-]/g, '') || 'nota'
      const disposition = c.req.query('download') === '1' ? 'attachment' : 'inline'
      return new Response(found.pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `${disposition}; filename="nfse-${number}.pdf"` } })
    }
    const pdf = await service.pdf(id)
    if (!pdf) return c.json({ error: 'nota not issued' }, 404)
    if (c.req.query('download') === '1') {
      const nota = await service.get(id)
      const number = String(nota?.nfseNumber ?? nota?.dpsNumber ?? '').replace(/[^0-9A-Za-z-]/g, '') || 'nota'
      return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="nfse-${number}.pdf"` } })
    }
    return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="nfse-${c.req.param('id')}.pdf"` } })
  })

  /** Cancels the nota (event 101101). Body: { reasonCode?: "1" | "2" | "9", reason?: string }. */
  app.post('/v1/notas/:id/cancel', async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { reasonCode?: '1' | '2' | '9'; reason?: string }
    if (body.reasonCode && !['1', '2', '9'].includes(body.reasonCode)) return c.json({ error: 'reasonCode: 1, 2 or 9' }, 400)
    const nota = await notas().cancel(c.req.param('id'), { code: body.reasonCode, text: body.reason })
    console.log('nfse: cancel', { id: nota.id, status: nota.status, errors: nota.cancelErrors })
    return c.json(view(originOf(c.req.url), nota), nota.status === 'canceled' ? 200 : 422)
  })

  /** Public, signed links (sent in the buyer's email): the PDF and the authorized XML. */
  app.get('/notas/:id/:file{nfse\\.(pdf|xml)}', async (c) => {
    const id = c.req.param('id')
    if (!timingSafeEqual(c.req.query('sig') ?? '', linkSignature(id))) return c.text('Link inválido.', 403)
    const service = notas()
    const nota = await service.get(id)
    if (!nota?.nfseXml) return c.text('Nota não encontrada.', 404)
    const number = nota.nfseNumber ?? nota.dpsNumber
    if (c.req.param('file') === 'nfse.xml') {
      return new Response(nota.nfseXml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'content-disposition': `attachment; filename="nfse-${number}.xml"` } })
    }
    const pdf = await service.pdf(id)
    if (!pdf) return c.text('Nota não encontrada.', 404)
    return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="nfse-${number}.pdf"` } })
  })

  return app
}
