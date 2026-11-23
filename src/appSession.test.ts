import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { adminPanelNotice, createApp } from './app.ts'
import { envFrom } from './env.ts'
import type { Gov, GovResult, Nota, Repo } from './notas.ts'
import { hashPassword } from './password.ts'
import { createMemoryRepo, createSqliteRepo, openDatabase } from './repo.ts'
import { issueSession, sessionKey } from './session.ts'

const TOKEN = 'secret-token'
const PASSWORD = 'correct horse battery'
const env = envFrom({
  NFSE_ENVIRONMENT: 'restricted',
  ISSUER_CNPJ: '11222333000181',
  ISSUER_CITY_CODE: '3550308',
  ISSUER_SIMPLES_OPTION: '3',
  ISSUER_SIMPLES_APURATION: '1',
  ISSUER_SIMPLES_TOTAL_TAX_PERCENT: '6.00',
  API_TOKEN: TOKEN,
})

const ok = (status: number, json: Record<string, unknown>): GovResult => ({ reached: true, status, json })

const gov: Gov = {
  sendDps: async (_host, xml) => ok(201, { chaveAcesso: '4'.repeat(50), nfseXml: `<NFSe><infNFSe><nNFSe>7</nNFSe>${xml}</infNFSe></NFSe>` }),
  sendEvent: async () => ok(201, {}),
  get: async (_host, path) => (path.includes('/convenio') ? ok(200, { aderente: 1 }) : ok(404, {})),
}

let HASH = ''
beforeAll(async () => {
  HASH = await hashPassword(PASSWORD)
}, 30_000)

const clock = { ms: Date.UTC(2026, 10, 20, 12) }

const setup = (overrides: Partial<typeof env> = {}, repo: Repo = createMemoryRepo(), govStub: Gov = gov) =>
  createApp({
    env: { ...env, ADMIN_PASSWORD: HASH, ...overrides },
    repo,
    gov: govStub,
    certificate: () => ({ error: 'no certificate' }),
    now: () => clock.ms,
  })

type App = ReturnType<typeof setup>

/** Logs in through the form and returns the `nfse_admin=...` cookie pair. The headers keep it valid with or without the throttle and the cross-site check. */
const loginCookie = async (app: App, ip: string): Promise<string> => {
  const res = await app.request('http://api.test/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin', 'x-forwarded-for': ip },
    body: new URLSearchParams({ password: PASSWORD }),
  })
  expect(res.status).toBe(303)
  return res.headers.get('set-cookie')?.split(';')[0] ?? ''
}

/** The token the /admin page hands to its script: the content of the csrf-token meta. */
const csrfOf = async (app: App, cookie: string): Promise<string> => {
  const page = await (await app.request('http://api.test/admin', { headers: { cookie } })).text()
  return /<meta name="csrf-token" content="([^"]+)"/.exec(page)?.[1] ?? ''
}

const START = clock.ms
const bearer = { authorization: `Bearer ${TOKEN}` }
const issueBody = JSON.stringify({ id: 'pedido-1', serviceCode: '080201', description: 'Aula', valueCents: 100 })

/** POST /v1/notas with the given headers (the issue body of app.test.ts). */
const issue = (app: App, headers: Record<string, string>) =>
  app.request('http://api.test/v1/notas', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: issueBody })

const UNAUTHORIZED = { error: 'unauthorized' }
const BAD_CSRF = { error: 'invalid csrf token' }

describe('/v1 through the session cookie', () => {
  afterEach(() => {
    clock.ms = START
  })

  it('lets the cookie alone read /v1/notas, and still refuses a call with no credential', async () => {
    const app = setup()
    const cookie = await loginCookie(app, '198.51.100.1')
    const res = await app.request('http://api.test/v1/notas', { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ notas: [] })
    const anonymous = await app.request('http://api.test/v1/notas')
    expect(anonymous.status).toBe(401)
    expect(await anonymous.json()).toEqual({ error: 'unauthorized' })
  })

  it('refuses a cookie write without the CSRF token, or with a wrong one, and accepts the page token', async () => {
    const app = setup()
    const cookie = await loginCookie(app, '198.51.100.2')
    const missing = await issue(app, { cookie })
    expect(missing.status).toBe(403)
    expect(await missing.json()).toEqual(BAD_CSRF)
    const wrong = await issue(app, { cookie, 'x-csrf-token': 'wrong' })
    expect(wrong.status).toBe(403)
    expect(await wrong.json()).toEqual(BAD_CSRF)
    const csrf = await csrfOf(app, cookie)
    expect(csrf).not.toBe('')
    const issued = await issue(app, { cookie, 'x-csrf-token': csrf })
    expect(issued.status).toBe(200)
    expect(await issued.json()).toMatchObject({ status: 'issued' })
  })

  it('needs the CSRF token to cancel a nota with the cookie', async () => {
    const app = setup()
    const cookie = await loginCookie(app, '198.51.100.3')
    const csrf = await csrfOf(app, cookie)
    expect((await issue(app, { cookie, 'x-csrf-token': csrf })).status).toBe(200)
    const cancel = (headers: Record<string, string>) =>
      app.request('http://api.test/v1/notas/pedido-1/cancel', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' })
    const refused = await cancel({ cookie })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual(BAD_CSRF)
    expect((await cancel({ cookie, 'x-csrf-token': csrf })).status).toBe(200)
  })

  it('reads one nota and /health with the cookie alone', async () => {
    const app = setup()
    const cookie = await loginCookie(app, '198.51.100.4')
    expect((await issue(app, { cookie, 'x-csrf-token': await csrfOf(app, cookie) })).status).toBe(200)
    expect((await app.request('http://api.test/v1/notas/pedido-1', { headers: { cookie } })).status).toBe(200)
    const health = await app.request('http://api.test/health', { headers: { cookie } })
    expect(health.status).not.toBe(401)
    expect(await health.json()).toHaveProperty('ok')
  })
})

const savedNota = (id: string, createdAt: string, status: Nota['status'] = 'issued'): Nota => ({
  id,
  status,
  request: { id, serviceCode: '080201', description: 'Aula', valueCents: 100 },
  dpsNumber: 1,
  dpsId: `DPS${id}`,
  createdAt,
  updatedAt: createdAt,
})

describe('notas list pages through the session cookie', () => {
  const T1 = '2026-11-20T12:00:01.000Z'
  const T0 = '2026-11-20T12:00:00.000Z'

  const page = async (app: App, cookie: string, query: Record<string, string>): Promise<string[]> => {
    const res = await app.request(`http://api.test/v1/notas?${new URLSearchParams(query)}`, { headers: { cookie } })
    expect(res.status).toBe(200)
    return ((await res.json()) as { notas: Array<{ id: string }> }).notas.map((n) => n.id)
  }

  const seeded = async () => {
    const repo = createSqliteRepo(openDatabase(':memory:'))
    await repo.save(savedNota('a', T1))
    await repo.save(savedNota('b', T0))
    await repo.save(savedNota('c', T0))
    const app = setup({}, repo)
    return { repo, app, cookie: await loginCookie(app, '198.51.100.20') }
  }

  it('returns every nota exactly once across pages, even when two share a createdAt at the page edge', async () => {
    const { app, cookie } = await seeded()
    expect(await page(app, cookie, { limit: '2' })).toEqual(['a', 'c'])
    expect(await page(app, cookie, { limit: '2', before: T0, beforeId: 'c' })).toEqual(['b'])
  })

  it('keeps the old meaning of before alone', async () => {
    const { app, cookie } = await seeded()
    expect(await page(app, cookie, { before: T0 })).toEqual([])
    expect(await page(app, cookie, { before: T1 })).toEqual(['c', 'b'])
  })

  it('ignores beforeId without before', async () => {
    const { app, cookie } = await seeded()
    expect(await page(app, cookie, { beforeId: 'c' })).toEqual(['a', 'c', 'b'])
  })

  it('keeps the status filter on every page', async () => {
    const { repo, app, cookie } = await seeded()
    await repo.save(savedNota('r', T0, 'rejected'))
    expect(await page(app, cookie, { status: 'issued', limit: '2' })).toEqual(['a', 'c'])
    expect(await page(app, cookie, { status: 'issued', limit: '2', before: T0, beforeId: 'c' })).toEqual(['b'])
  })

  it('treats a hostile beforeId as data', async () => {
    const { app, cookie } = await seeded()
    expect(await page(app, cookie, { before: T0, beforeId: "x'; DROP TABLE notas; --" })).toEqual(['c', 'b'])
    expect(await page(app, cookie, {})).toEqual(['a', 'c', 'b'])
  })
})

describe('PDF download for the panel', () => {
  const pdfGov = gov
  const isPdf = (bytes: Buffer) => bytes.subarray(0, 5).toString() === '%PDF-'
  const pdfUrl = (id: string, query = '') => `http://api.test/v1/notas/${encodeURIComponent(id)}/pdf${query}`
  const INLINE = 'inline; filename="nfse-pedido-1.pdf"'
  const ATTACHMENT = 'attachment; filename="nfse-7.pdf"'

  const issued = async () => {
    const repo = createMemoryRepo()
    const app = setup({}, repo, pdfGov)
    expect((await issue(app, bearer)).status).toBe(200)
    return { repo, app, cookie: await loginCookie(app, '198.51.100.30') }
  }

  it('keeps the inline answer for Bearer clients', async () => {
    const { app } = await issued()
    const res = await app.request(pdfUrl('pedido-1'), { headers: bearer })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe(INLINE)
    expect(isPdf(Buffer.from(await res.arrayBuffer()))).toBe(true)
  })

  it('answers a PDF as an attachment named by the NFS-e number with download=1', async () => {
    const { app, cookie } = await issued()
    for (const headers of [bearer, { cookie }]) {
      const res = await app.request(pdfUrl('pedido-1', '?download=1'), { headers })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/pdf')
      expect(res.headers.get('content-disposition')).toBe(ATTACHMENT)
      expect(isPdf(Buffer.from(await res.arrayBuffer()))).toBe(true)
    }
  })

  it('answers 401 with no credential', async () => {
    const { app } = await issued()
    const res = await app.request(pdfUrl('pedido-1', '?download=1'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual(UNAUTHORIZED)
  })

  it('stays inline for any download value other than 1', async () => {
    const { app, cookie } = await issued()
    for (const value of ['0', 'true', '']) {
      const res = await app.request(pdfUrl('pedido-1', `?download=${value}`), { headers: { cookie } })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-disposition'), value).toBe(INLINE)
    }
  })

  it('answers 404 for a nota without an access key, with and without download=1', async () => {
    const { repo, app, cookie } = await issued()
    await repo.save(savedNota('pendente', '2026-11-20T12:00:00.000Z', 'pending'))
    for (const query of ['', '?download=1']) {
      const res = await app.request(pdfUrl('pendente', query), { headers: { cookie } })
      expect(res.status, query).toBe(404)
      expect(await res.json()).toEqual({ error: 'nota not issued' })
    }
  })

  it('downloads an issued nota whose id is outside Latin-1', async () => {
    const app = setup({}, createMemoryRepo(), pdfGov)
    const id = 'pedido-ç😀'
    const created = await app.request('http://api.test/v1/notas', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer },
      body: JSON.stringify({ id, serviceCode: '080201', description: 'Aula', valueCents: 100 }),
    })
    expect(created.status).toBe(200)
    const res = await app.request(pdfUrl(id, '?download=1'), { headers: bearer })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe(ATTACHMENT)
  })

  it('is read-only: two parallel downloads answer the same and leave the nota untouched', async () => {
    const { repo, app, cookie } = await issued()
    const before = await repo.get('pedido-1')
    const [one, two] = await Promise.all([1, 2].map(() => app.request(pdfUrl('pedido-1', '?download=1'), { headers: { cookie } })))
    expect([one?.status, two?.status]).toEqual([200, 200])
    expect(one?.headers.get('content-disposition')).toBe(two?.headers.get('content-disposition'))
    const after = await repo.get('pedido-1')
    expect(after?.status).toBe(before?.status)
    expect(after?.updatedAt).toBe(before?.updatedAt)
  })

  it('has no XML route under /v1/notas/:id', async () => {
    const { app, cookie } = await issued()
    expect((await app.request('http://api.test/v1/notas/pedido-1/xml', { headers: { cookie } })).status).toBe(404)
  })
})

describe('Bearer priority', () => {
  it('accepts a valid Bearer without CSRF, even next to a garbage cookie', async () => {
    const app = setup()
    expect((await issue(app, bearer)).status).toBe(200)
    const garbage = await app.request('http://api.test/v1/notas', { headers: { ...bearer, cookie: 'nfse_admin=garbage' } })
    expect(garbage.status).toBe(200)
    expect((await issue(app, { ...bearer, cookie: 'nfse_admin=garbage' })).status).toBe(200)
  })

  it('answers 401 to a wrong or empty Authorization next to a valid cookie', async () => {
    const app = setup()
    const cookie = await loginCookie(app, '198.51.100.5')
    for (const authorization of ['Bearer wrong', '']) {
      const res = await app.request('http://api.test/v1/notas', { headers: { authorization, cookie } })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual(UNAUTHORIZED)
    }
  })
})

describe('a cookie that is not a valid session looks like no credential', () => {
  afterEach(() => {
    clock.ms = START
  })

  const expectUnauthorized = async (app: App, cookie: string) => {
    const res = await app.request('http://api.test/v1/notas', { headers: { cookie } })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual(UNAUTHORIZED)
  }

  it('answers the same 401 for a tampered, empty and expired cookie', async () => {
    const app = setup()
    const cookie = await loginCookie(app, '198.51.100.6')
    const tampered = `${cookie.slice(0, -1)}${cookie.endsWith('A') ? 'B' : 'A'}`
    await expectUnauthorized(app, tampered)
    await expectUnauthorized(app, 'nfse_admin=')
    clock.ms += 43_200_000
    await expectUnauthorized(app, cookie)
  })

  it('answers the same 401 for a cookie signed under another password hash (PASS-04)', async () => {
    const cookie = await loginCookie(setup(), '198.51.100.7')
    const other = setup({ ADMIN_PASSWORD: await hashPassword('another long password') })
    await expectUnauthorized(other, cookie)
  }, 30_000)
})

describe('panel off', () => {
  it('ignores any cookie on /v1 and /health, and keeps accepting the Bearer token', async () => {
    const cookie = `nfse_admin=${issueSession(sessionKey(HASH), clock.ms).value}`
    const app = setup({ ADMIN_PASSWORD: '' })
    for (const path of ['/v1/notas', '/health']) {
      const res = await app.request(`http://api.test${path}`, { headers: { cookie } })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual(UNAUTHORIZED)
    }
    expect((await app.request('http://api.test/v1/notas', { headers: bearer })).status).toBe(200)
  })
})

describe('CSRF invariant (D-18)', () => {
  it('refuses a cookie request without the token on every non-GET/HEAD /v1 route', async () => {
    const app = setup()
    const cookie = await loginCookie(app, '198.51.100.8')
    const writes = app.routes.filter((route) => route.path.startsWith('/v1') && !['GET', 'HEAD', 'ALL'].includes(route.method))
    expect(writes.length).toBeGreaterThan(0)
    for (const { method, path } of writes) {
      const res = await app.request(`http://api.test${path.replace(/:[A-Za-z]+/g, 'pedido-x')}`, { method, headers: { cookie } })
      expect(res.status, `${method} ${path}`).toBe(403)
    }
  })
})

describe('adminPanelNotice', () => {
  it('says off, misconfigured (as a warning) or on, and never prints the hash', () => {
    const off = adminPanelNotice(envFrom({}))
    expect(off.warn).toBe(false)
    expect(off.message).toContain('admin panel off')
    const bad = adminPanelNotice(envFrom({ ADMIN_PASSWORD: 'not-a-hash' }))
    expect(bad.warn).toBe(true)
    expect(bad.message).toContain('not a valid hash')
    expect(bad.message).not.toContain('not-a-hash')
    const on = adminPanelNotice(envFrom({ ADMIN_PASSWORD: HASH }))
    expect(on.warn).toBe(false)
    expect(on.message).toContain('admin panel on /admin')
    expect(on.message).not.toContain(HASH)
  })
})
