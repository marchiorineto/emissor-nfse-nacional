import { beforeAll, describe, expect, it } from 'vitest'
import { PICO_CSS_INTEGRITY } from './admin.ts'
import { createApp } from './app.ts'
import { envFrom } from './env.ts'
import type { Gov, GovResult } from './notas.ts'
import { hashPassword } from './password.ts'
import { createMemoryRepo } from './repo.ts'

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

const setup = (overrides: Partial<typeof env> = {}) =>
  createApp({
    env: { ...env, ADMIN_PASSWORD: HASH, ...overrides },
    repo: createMemoryRepo(),
    gov,
    certificate: () => ({ error: 'no certificate' }),
    now: () => clock.ms,
  })

/** Posts the login form; the extra headers keep the tests valid once the throttle and the cross-site check exist. */
const login = (app: ReturnType<typeof setup>, password: string, headers: Record<string, string> = {}, url = 'http://api.test/login') =>
  app.request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.10', 'sec-fetch-site': 'same-origin', ...headers },
    body: new URLSearchParams({ password }),
  })

const cookieOf = (res: Response) => res.headers.get('set-cookie')?.split(';')[0]

describe('admin login', () => {
  it('opens a session with the right password and renders the panel skeleton', async () => {
    const app = setup()
    const res = await login(app, PASSWORD)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/admin')
    expect(res.headers.get('set-cookie')).toMatch(/^nfse_admin=/)
    const page = await app.request('http://api.test/admin', { headers: { cookie: cookieOf(res) ?? '' } })
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toContain('text/html')
    const body = await page.text()
    for (const text of ['lang="pt-BR"', '11.222.333/0001-81', 'Homologação (produção restrita)', 'Sair', '<meta name="csrf-token" content="', 'name="csrf"', PICO_CSS_INTEGRITY]) {
      expect(body).toContain(text)
    }
  })

  it('answers 401 "Senha incorreta." for a wrong password, without echoing it or setting a cookie', async () => {
    const res = await login(setup(), 'wrong password 12')
    expect(res.status).toBe(401)
    const body = await res.text()
    expect(body).toContain('Senha incorreta.')
    expect(body).not.toContain('wrong password 12')
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})

/** Logs in and returns the cookie pair plus the CSRF field of the panel page. */
const session = async (app: ReturnType<typeof setup>) => {
  const cookie = cookieOf(await login(app, PASSWORD)) ?? ''
  const page = await (await app.request('http://api.test/admin', { headers: { cookie } })).text()
  return { cookie, csrf: /name="csrf" value="([^"]+)"/.exec(page)?.[1] ?? '' }
}

const logout = (app: ReturnType<typeof setup>, headers: Record<string, string>, csrf?: string) =>
  app.request('http://api.test/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(csrf === undefined ? {} : { csrf }),
  })

describe('admin guard and logout', () => {
  it('answers the plain 404 of an unknown path on every admin route when the panel is off', async () => {
    const app = setup({ ADMIN_PASSWORD: '' })
    const unknown = await app.request('http://api.test/no-such-page')
    const unknownBody = await unknown.text()
    const responses = [
      await app.request('http://api.test/login'),
      await login(app, PASSWORD),
      await app.request('http://api.test/admin'),
      await logout(app, {}, 'x'),
    ]
    for (const res of responses) {
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toBe(unknown.headers.get('content-type'))
      expect(await res.text()).toBe(unknownBody)
    }
  })

  it('treats a whitespace-only ADMIN_PASSWORD as empty', async () => {
    const app = createApp({ env: envFrom({ ADMIN_PASSWORD: '   ', API_TOKEN: TOKEN }), repo: createMemoryRepo(), gov, certificate: () => ({ error: 'none' }) })
    expect((await app.request('http://api.test/login')).status).toBe(404)
  })

  it('redirects /admin to /login without a valid session', async () => {
    const app = setup()
    const { cookie } = await session(app)
    const tampered = `${cookie.slice(0, -1)}${cookie.endsWith('A') ? 'B' : 'A'}`
    for (const header of [undefined, 'nfse_admin=', 'nfse_admin=x', tampered]) {
      const res = await app.request('http://api.test/admin', { headers: header === undefined ? {} : { cookie: header } })
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toBe('/login')
    }
  })

  it('shows the form without a session and redirects GET /login to /admin with one', async () => {
    const app = setup()
    expect((await app.request('http://api.test/login')).status).toBe(200)
    const { cookie } = await session(app)
    const res = await app.request('http://api.test/login', { headers: { cookie } })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/admin')
  })

  it('logs out with the page CSRF token: clears the cookie and redirects to /login', async () => {
    const app = setup()
    const { cookie, csrf } = await session(app)
    const res = await logout(app, { cookie }, csrf)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/login')
    expect(res.headers.get('set-cookie')).toBe('nfse_admin=; Max-Age=0; Path=/')
  })

  it('refuses a logout with a wrong CSRF token (403, cookie untouched)', async () => {
    const app = setup()
    const { cookie } = await session(app)
    const res = await logout(app, { cookie }, 'wrong')
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('redirects a logout without a session to /login', async () => {
    const res = await logout(setup(), {}, 'x')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/login')
  })

  it('does not log out on GET', async () => {
    const app = setup()
    const { cookie } = await session(app)
    expect((await app.request('http://api.test/logout', { headers: { cookie } })).status).toBe(404)
  })
})
