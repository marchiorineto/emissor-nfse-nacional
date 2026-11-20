import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { envFrom } from './env.ts'
import type { Gov, GovResult } from './notas.ts'
import { createMemoryRepo } from './repo.ts'

const TOKEN = 'secret-token'
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

/** Issues every DPS with a fixed access key. */
const gov: Gov = {
  sendDps: async (_host, xml) => ok(201, { chaveAcesso: '4'.repeat(50), nfseXml: `<NFSe><infNFSe><nNFSe>7</nNFSe>${xml}</infNFSe></NFSe>` }),
  sendEvent: async () => ok(201, {}),
  get: async (_host, path) => (path.includes('/convenio') ? ok(200, { aderente: 1 }) : ok(404, {})),
}

const setup = (overrides: Partial<typeof env> = {}) =>
  createApp({ env: { ...env, ...overrides }, repo: createMemoryRepo(), gov, certificate: () => ({ error: 'no certificate: add it with `pnpm run certificate <file.pfx>`' }) })

const auth = { authorization: `Bearer ${TOKEN}` }
const issue = (app: ReturnType<typeof setup>, id = 'pedido-1') =>
  app.request('http://api.test/v1/notas', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ id, serviceCode: '080201', description: 'Aula', valueCents: 100 }),
  })

/** The signature the Cloudflare Worker gave the links (Web Crypto), so links already emailed keep working. */
const workerSignature = async (id: string): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`links:${TOKEN}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id)))
  return Buffer.from(bytes).toString('hex').slice(0, 32)
}

describe('app', () => {
  it('refuses calls without the token', async () => {
    const app = setup()
    expect((await app.request('http://api.test/v1/notas')).status).toBe(401)
    expect((await app.request('http://api.test/v1/notas', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401)
    expect((await app.request('http://api.test/health')).status).toBe(401)
  })

  it('issues a nota and returns it again for the same id', async () => {
    const app = setup()
    const first = await issue(app)
    expect(first.status).toBe(200)
    const body = (await first.json()) as { status: string; links: { pdf: string } }
    expect(body.status).toBe('issued')
    expect(body.links.pdf).toMatch(/^http:\/\/api\.test\/notas\/pedido-1\/nfse\.pdf\?sig=[0-9a-f]{32}$/)
    expect(((await (await issue(app)).json()) as { dpsNumber: number }).dpsNumber).toBe(1)
    const list = (await (await app.request('http://api.test/v1/notas', { headers: auth })).json()) as { notas: unknown[] }
    expect(list.notas).toHaveLength(1)
  })

  it('signs the public links as the Worker did, and serves the XML with them', async () => {
    const app = setup({ PUBLIC_URL: 'https://nfse.example.com' })
    const body = (await (await issue(app)).json()) as { links: { xml: string } }
    const sig = await workerSignature('pedido-1')
    expect(body.links.xml).toBe(`https://nfse.example.com/notas/pedido-1/nfse.xml?sig=${sig}`)
    const xml = await app.request(`http://api.test/notas/pedido-1/nfse.xml?sig=${sig}`)
    expect(xml.status).toBe(200)
    expect(await xml.text()).toContain('<nNFSe>7</nNFSe>')
    expect((await app.request('http://api.test/notas/pedido-1/nfse.xml?sig=0')).status).toBe(403)
  })

  it('reports in /health why it is not ready', async () => {
    const response = await setup({ ISSUER_CNPJ: '' }).request('http://api.test/health', { headers: auth })
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      ok: false,
      config: ['ISSUER_CNPJ: the 14 digits of the CNPJ'],
      certificate: { error: expect.stringContaining('no certificate') },
    })
  })
})
