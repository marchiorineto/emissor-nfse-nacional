import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PAGE_CSP, PICO_CSS_INTEGRITY, PICO_CSS_URL } from './admin.ts'
import { createApp } from './app.ts'
import { envFrom } from './env.ts'
import type { Gov, GovResult } from './notas.ts'
import { hashPassword } from './password.ts'
import { createMemoryRepo } from './repo.ts'
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

describe('login throttle', () => {
  afterEach(() => {
    clock.ms = Date.UTC(2026, 10, 20, 12)
  })

  it('answers 429 with Retry-After before checking the password, per address, and lets the address back in after the delay', async () => {
    const app = setup()
    const wrong = await login(app, 'wrong password 12', { 'x-forwarded-for': '198.51.100.1' })
    expect(wrong.status).toBe(401)
    const blocked = await login(app, PASSWORD, { 'x-forwarded-for': '198.51.100.1' })
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBe('1')
    expect(await blocked.text()).toContain('Muitas tentativas')
    expect(blocked.headers.get('set-cookie')).toBeNull()
    expect((await login(app, PASSWORD, { 'x-forwarded-for': '198.51.100.2' })).status).toBe(303)
    clock.ms += 1000
    expect((await login(app, PASSWORD, { 'x-forwarded-for': '198.51.100.1' })).status).toBe(303)
  })
})

describe('login throttle, parallel attempts', () => {
  it('checks only one of three simultaneous wrong-password posts from one address', async () => {
    const app = setup()
    const statuses = (await Promise.all([1, 2, 3].map(() => login(app, 'wrong password 12', { 'x-forwarded-for': '198.51.100.9' })))).map((res) => res.status)
    expect(statuses.sort()).toEqual([401, 429, 429])
  })
})

/** Posts the login form with exactly the given headers (no implicit Sec-Fetch-Site), from the fixed address 203.0.113.50. */
const rawLogin = (app: ReturnType<typeof setup>, password: string, headers: Record<string, string> = {}, body?: string) =>
  app.request('http://api.test/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.50', ...headers },
    body: body ?? new URLSearchParams({ password }),
  })

describe('cross-site login refusal', () => {
  it('refuses Sec-Fetch-Site cross-site and same-site, and accepts same-origin and none', async () => {
    const app = setup()
    for (const site of ['cross-site', 'same-site']) {
      const res = await rawLogin(app, 'wrong password 12', { 'sec-fetch-site': site })
      expect(res.status).toBe(403)
      expect(await res.text()).toBe('Pedido recusado.')
    }
    clock.ms += 10_000
    for (const site of ['same-origin', 'none']) {
      expect((await rawLogin(app, 'wrong password 12', { 'sec-fetch-site': site })).status).toBe(401)
      clock.ms += 10_000
    }
  })

  it('falls back to Origin without Sec-Fetch-Site: null and foreign origins refused, own origins accepted', async () => {
    for (const origin of ['https://evil.example', 'null']) {
      expect((await rawLogin(setup(), PASSWORD, { origin })).status).toBe(403)
    }
    expect((await rawLogin(setup(), PASSWORD, { origin: 'http://api.test' })).status).toBe(303)
    expect((await rawLogin(setup({ PUBLIC_URL: 'https://nfse.example.com' }), PASSWORD, { origin: 'https://nfse.example.com' })).status).toBe(303)
    const proxied = { origin: 'https://nfse.example.com', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'nfse.example.com' }
    expect((await rawLogin(setup(), PASSWORD, proxied)).status).toBe(303)
  })

  it('lets a post with neither header through', async () => {
    expect((await rawLogin(setup(), PASSWORD)).status).toBe(303)
  })

  it('does not count refused posts as failures', async () => {
    const app = setup()
    for (let n = 0; n < 3; n++) expect((await rawLogin(app, PASSWORD, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await rawLogin(app, PASSWORD, { 'sec-fetch-site': 'same-origin' })).status).toBe(303)
  })
})

describe('login body limit', () => {
  it('answers 413 for a 5 000-byte body before any password check and counts nothing', async () => {
    const app = setup()
    const big = await rawLogin(app, '', { 'sec-fetch-site': 'same-origin' }, `password=${'a'.repeat(4991)}`)
    expect(big.status).toBe(413)
    expect(await big.text()).toBe('Pedido grande demais.')
    expect((await rawLogin(app, PASSWORD, { 'sec-fetch-site': 'same-origin' })).status).toBe(303)
  })
})

describe('panel security headers', () => {
  const expectHeaders = (res: Response) => {
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-security-policy')).toBe(PAGE_CSP)
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  }

  it('sends them on /login, a refused login, /admin, its redirect and /logout', async () => {
    const app = setup()
    expectHeaders(await app.request('http://api.test/login'))
    expectHeaders(await login(app, 'wrong password 12'))
    clock.ms += 10_000
    const { cookie, csrf } = await session(app)
    expectHeaders(await app.request('http://api.test/admin', { headers: { cookie } }))
    expectHeaders(await app.request('http://api.test/admin'))
    expectHeaders(await logout(app, { cookie }, csrf))
  })

  it('allows only Pico from jsDelivr: no script tag and one absolute URL in src or href', async () => {
    expect(PAGE_CSP).toContain("frame-ancestors 'none'")
    const app = setup()
    const { cookie } = await session(app)
    const bodies = [await (await app.request('http://api.test/login')).text(), await (await app.request('http://api.test/admin', { headers: { cookie } })).text()]
    for (const body of bodies) {
      expect(body).not.toContain('<script')
      const urls = [...body.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((match) => match[1])
      expect(urls).toEqual([PICO_CSS_URL])
    }
  })
})

const START = Date.UTC(2026, 10, 20, 12)

describe('session cookie flags, expiry and edge cases', () => {
  afterEach(() => {
    clock.ms = START
    vi.restoreAllMocks()
  })

  it('sets HttpOnly, SameSite=Strict, Path=/ and Max-Age=43200, and Secure only over HTTPS', async () => {
    const plain = (await login(setup(), PASSWORD)).headers.get('set-cookie') ?? ''
    for (const flag of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=43200']) expect(plain).toContain(flag)
    expect(plain).not.toContain('Secure')
    const byUrl = await login(setup(), PASSWORD, {}, 'https://api.test/login')
    const byPublicUrl = await login(setup({ PUBLIC_URL: 'https://nfse.example.com' }), PASSWORD)
    const byProxy = await login(setup(), PASSWORD, { 'x-forwarded-proto': 'https' })
    for (const res of [byUrl, byPublicUrl, byProxy]) expect(res.headers.get('set-cookie')).toContain('Secure')
  })

  it('keeps the session until exactly 12 hours after login, by the server clock', async () => {
    clock.ms = START
    const app = setup()
    const cookie = cookieOf(await login(app, PASSWORD)) ?? ''
    clock.ms = START + 43_199_000
    expect((await app.request('http://api.test/admin', { headers: { cookie } })).status).toBe(200)
    clock.ms = START + 43_200_000
    const expired = await app.request('http://api.test/admin', { headers: { cookie } })
    expect(expired.status).toBe(303)
    expect(expired.headers.get('location')).toBe('/login')
  })

  it('refuses a cookie issued under another password hash (PASS-04)', async () => {
    const cookie = cookieOf(await login(setup(), PASSWORD)) ?? ''
    const other = setup({ ADMIN_PASSWORD: await hashPassword('another long password') })
    const res = await other.request('http://api.test/admin', { headers: { cookie } })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/login')
  }, 30_000)

  it('lets only the first nfse_admin value in the Cookie header decide', async () => {
    const app = setup()
    const valid = cookieOf(await login(app, PASSWORD)) ?? ''
    expect((await app.request('http://api.test/admin', { headers: { cookie: `nfse_admin=forged; ${valid}` } })).status).toBe(303)
    expect((await app.request('http://api.test/admin', { headers: { cookie: `${valid}; nfse_admin=forged` } })).status).toBe(200)
  })

  it('never exposes API_TOKEN and refuses a session signed with it', async () => {
    const app = setup()
    const res = await login(app, PASSWORD)
    const cookie = cookieOf(res) ?? ''
    const bodies = [
      await (await app.request('http://api.test/login')).text(),
      await (await app.request('http://api.test/admin', { headers: { cookie } })).text(),
    ]
    for (const body of bodies) expect(body).not.toContain(TOKEN)
    expect(res.headers.get('set-cookie')).not.toContain(TOKEN)
    const forged = `nfse_admin=${issueSession(sessionKey(TOKEN), clock.ms).value}`
    expect((await app.request('http://api.test/admin', { headers: { cookie: forged } })).status).toBe(303)
  })

  it('does not log the submitted password', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')]
    const app = setup()
    await login(app, 'wrong password 12')
    await login(app, PASSWORD)
    for (const call of spies.flatMap((spy) => spy.mock.calls)) {
      const text = JSON.stringify(call)
      expect(text).not.toContain('wrong password 12')
      expect(text).not.toContain(PASSWORD)
    }
  })
})
