import { beforeAll, describe, expect, it } from 'vitest'
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

describe('/v1 through the session cookie', () => {
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
})
