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
