import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { createAdnStore, createAdnSync, parseDocument, parseNfseXml, type AdnStore } from './adn.ts'
import { createApp } from './app.ts'
import { envFrom } from './env.ts'
import type { Gov, GovResult, Nota } from './notas.ts'
import { createSqliteRepo, openDatabase } from './repo.ts'

const OWN = '11222333000181'
const OTHER = '99888777000166'
const key = (n: number) => String(n).padStart(50, '0')

const ok = (status: number, json: Record<string, unknown>): GovResult => ({ reached: true, status, json })

const nfseXml = ({ accessKey, number, prest, toma, value = '100.00', dhProc = '2026-11-10T10:00:00-03:00', replaces }: {
  accessKey: string
  number: string
  prest: string
  toma: string
  value?: string
  dhProc?: string
  replaces?: string
}) =>
  `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${accessKey}"><nNFSe>${number}</nNFSe>` +
  `<dhProc>${dhProc}</dhProc><emit><CNPJ>${prest}</CNPJ><xNome>Prestador ${prest}</xNome></emit>` +
  `<DPS versao="1.01"><infDPS Id="DPS1"><dhEmi>2026-11-10T09:59:00-03:00</dhEmi><dCompet>2026-11-09</dCompet>` +
  `<prest><CNPJ>${prest}</CNPJ></prest><toma><CNPJ>${toma}</CNPJ><xNome>Tomador &amp; Cia</xNome></toma>` +
  (replaces ? `<subst><chSubstda>${replaces}</chSubstda><cMotivo>99</cMotivo></subst>` : '') +
  `<serv><cServ><cTribNac>080201</cTribNac><xDescServ>Aula</xDescServ></cServ></serv>` +
  `<valores><vServPrest><vServ>${value}</vServ></vServPrest></valores></infDPS></DPS></infNFSe></NFSe>`

const packed = (xml: string) => gzipSync(xml).toString('base64')

/** An item of LoteDFe. */
type Item = Record<string, unknown>
const nfseItem = (nsu: number, xml: string, accessKey: string): Item => ({ NSU: nsu, ChaveAcesso: accessKey, TipoDocumento: 'NFSE', ArquivoXml: packed(xml), DataHoraGeracao: '2026-11-10T10:00:01-03:00' })
const eventItem = (nsu: number, accessKey: string, type: string): Item => ({
  NSU: nsu,
  ChaveAcesso: accessKey,
  TipoDocumento: 'EVENTO',
  TipoEvento: type,
  ArquivoXml: packed(`<evento><infEvento><dhProc>2026-11-11T10:00:00-03:00</dhProc><pedRegEvento><infPedReg><chNFSe>${accessKey}</chNFSe></infPedReg></pedRegEvento></infEvento></evento>`),
})

/** The ADN distribution over `items`: the documents after the NSU asked, 50 at a time, then E2220. */
const fakeAdn = (items: Item[]) => {
  const calls: string[] = []
  const gov: Gov = {
    sendDps: async () => ok(500, {}),
    sendEvent: async () => ok(500, {}),
    get: async (_host, path) => {
      calls.push(path)
      const nsu = Number(path.match(/\/contribuintes\/DFe\/(\d+)/)?.[1])
      const batch = items.filter((item) => Number(item.NSU) > nsu).slice(0, 50)
      if (!batch.length) return ok(404, { StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO', Erros: [{ Codigo: 'E2220', Descricao: 'Nenhum documento localizado' }] })
      return ok(200, { StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS', LoteDFe: batch })
    },
  }
  return { gov, calls }
}

const clock = (start = Date.parse('2026-11-20T12:00:00Z')) => {
  let time = start
  return { now: () => time, advance: (ms: number) => (time += ms) }
}

const setup = (items: Item[], options: { cooldownMs?: number } = {}) => {
  const db = openDatabase(':memory:')
  const store = createAdnStore(db)
  const adn = fakeAdn(items)
  const time = clock()
  const sync = createAdnSync({ store, gov: adn.gov, host: 'adn.test', ownTaxId: OWN, cooldownMs: options.cooldownMs ?? 3_600_000, now: time.now })
  return { db, store, sync, adn, time }
}

describe('parseNfseXml', () => {
  it('reads the fields of the list and tells issued from received', () => {
    const issued = parseNfseXml(nfseXml({ accessKey: key(1), number: '12', prest: OWN, toma: OTHER, value: '1234.50' }), OWN)
    expect(issued).toMatchObject({
      accessKey: key(1),
      role: 'issuer',
      nfseNumber: '12',
      issuedAt: '2026-11-10T13:00:00.000Z',
      competence: '2026-11-09',
      issuer: { taxId: OWN, name: `Prestador ${OWN}` },
      taker: { taxId: OTHER, name: 'Tomador & Cia' },
      valueCents: 123450,
      serviceCode: '080201',
      description: 'Aula',
    })
    expect(parseNfseXml(nfseXml({ accessKey: key(2), number: '3', prest: OTHER, toma: OWN }), OWN)?.role).toBe('taker')
    expect(parseNfseXml(nfseXml({ accessKey: key(3), number: '4', prest: OTHER, toma: '12345678909' }), OWN)?.role).toBe('other')
  })

  it('keeps the key of the nota a substitute replaces', () => {
    expect(parseNfseXml(nfseXml({ accessKey: key(2), number: '2', prest: OWN, toma: OTHER, replaces: key(1) }), OWN)?.replacesKey).toBe(key(1))
  })

  it('reads an event and ignores the documents the list does not show', () => {
    expect(parseDocument(eventItem(5, key(1), 'CANCELAMENTO'), OWN)).toEqual({ kind: 'event', nsu: 5, accessKey: key(1), type: 'CANCELAMENTO', at: '2026-11-11T13:00:00.000Z' })
    expect(parseDocument({ NSU: 6, TipoDocumento: 'DPS', ArquivoXml: packed('<DPS/>') }, OWN)).toEqual({ kind: 'ignored', nsu: 6 })
    expect(parseDocument({ nsu: 7, tipoDocumento: 'EVENTO', chaveAcesso: key(2), arquivoXml: packed('<evento><e101101><xDesc>x</xDesc></e101101></evento>') }, OWN)).toMatchObject({
      kind: 'event',
      type: 'CANCELAMENTO',
    })
  })
})

describe('sync', () => {
  const many = (count: number) => Array.from({ length: count }, (_, i) => nfseItem(i + 1, nfseXml({ accessKey: key(i + 1), number: String(i + 1), prest: OWN, toma: OTHER }), key(i + 1)))

  it('reads every batch after the last NSU until the ADN has nothing more', async () => {
    const { sync, adn, store } = setup(many(120))
    const result = await sync.run()
    expect(adn.calls).toEqual(['/contribuintes/DFe/0?lote=true', '/contribuintes/DFe/50?lote=true', '/contribuintes/DFe/100?lote=true', '/contribuintes/DFe/120?lote=true'])
    expect(result).toMatchObject({ fetched: 120, caughtUp: true, lastNsu: 120, count: 120, error: undefined })
    expect(store.state().caughtUpAt).toBe('2026-11-20T12:00:00.000Z')
  })

  it('waits the cooldown after reaching the end; force waits only a minute', async () => {
    const { sync, adn, time } = setup(many(3), { cooldownMs: 3_600_000 })
    await sync.run()
    const calls = adn.calls.length
    time.advance(30_000)
    expect(await sync.run()).toMatchObject({ skipped: 'cooldown', nextRunAt: '2026-11-20T13:00:00.000Z' })
    expect(await sync.run({ force: true })).toMatchObject({ skipped: 'cooldown' })
    time.advance(31_000)
    expect((await sync.run({ force: true })).skipped).toBeUndefined()
    expect(adn.calls.length).toBe(calls + 1)
    time.advance(3_600_000)
    expect((await sync.run()).skipped).toBeUndefined()
  })

  it('stops at the time budget and resumes where it stopped', async () => {
    const db = openDatabase(':memory:')
    const store = createAdnStore(db)
    const adn = fakeAdn(many(120))
    const time = clock()
    const gov: Gov = { ...adn.gov, get: async (host, path) => (time.advance(15_000), adn.gov.get(host, path)) }
    const sync = createAdnSync({ store, gov, host: 'adn.test', ownTaxId: OWN, cooldownMs: 60_000, now: time.now })
    expect(await sync.run({ budgetMs: 20_000 })).toMatchObject({ fetched: 100, caughtUp: false, lastNsu: 100 })
    expect(await sync.run({ budgetMs: 20_000 })).toMatchObject({ fetched: 20, lastNsu: 120 })
  })

  it('records a failure and tries again on the next run', async () => {
    const { store, adn } = setup(many(3))
    let reachable = false
    const gov: Gov = { ...adn.gov, get: async (host, path) => (reachable ? adn.gov.get(host, path) : { reached: false, error: 'no certificate' }) }
    const sync = createAdnSync({ store, gov, host: 'adn.test', ownTaxId: OWN, cooldownMs: 60_000 })
    expect(await sync.run()).toMatchObject({ error: 'no certificate', fetched: 0, caughtUp: false })
    reachable = true
    expect(await sync.run()).toMatchObject({ error: undefined, fetched: 3, caughtUp: true })
  })

  it('reports the ADN errors of a refused call', async () => {
    const { store } = setup([])
    const gov: Gov = { ...fakeAdn([]).gov, get: async () => ok(400, { StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS', Erros: [{ Codigo: 'E2245', Descricao: 'Sem procuração' }] }) }
    const sync = createAdnSync({ store, gov, host: 'adn.test', ownTaxId: OWN, cooldownMs: 60_000 })
    expect((await sync.run()).error).toBe('E2245 Sem procuração')
    expect(store.state().lastNsu).toBe(0)
  })

  it('runs once at a time', async () => {
    const { sync, adn } = setup(many(3))
    const [one, two] = await Promise.all([sync.run(), sync.run()])
    expect(one).toEqual(two)
    expect(adn.calls).toHaveLength(2)
  })
})

describe('status from events', () => {
  it('marks canceled and replaced notas, whatever order the documents come in', async () => {
    const items = [
      eventItem(1, key(3), 'CANCELAMENTO'),
      nfseItem(2, nfseXml({ accessKey: key(1), number: '1', prest: OWN, toma: OTHER }), key(1)),
      nfseItem(3, nfseXml({ accessKey: key(2), number: '2', prest: OWN, toma: OTHER, replaces: key(1) }), key(2)),
      nfseItem(4, nfseXml({ accessKey: key(3), number: '3', prest: OTHER, toma: OWN }), key(3)),
      eventItem(5, key(2), 'CONFIRMACAO_TOMADOR'),
    ]
    const { sync, store } = setup(items)
    await sync.run()
    expect(store.get(key(1))).toMatchObject({ status: 'replaced', replacedBy: key(2) })
    expect(store.get(key(2))).toMatchObject({ status: 'issued', replacesKey: key(1), events: [{ type: 'CONFIRMACAO_TOMADOR', nsu: 5 }] })
    expect(store.get(key(3))).toMatchObject({ status: 'canceled', role: 'taker' })
  })
})

const localNota = (id: string, createdAt: string, accessKey?: string): Nota => ({
  id,
  status: accessKey ? 'issued' : 'rejected',
  request: { id, serviceCode: '080201', description: 'Aula', valueCents: 100 },
  dpsNumber: 1,
  dpsId: `DPS${id}`,
  ...(accessKey ? { accessKey, nfseNumber: '1' } : {}),
  createdAt,
  updatedAt: createdAt,
})

describe('merged list', () => {
  const seed = async () => {
    const items = [
      nfseItem(1, nfseXml({ accessKey: key(1), number: '1', prest: OWN, toma: OTHER, dhProc: '2026-11-10T10:00:00-03:00' }), key(1)),
      nfseItem(2, nfseXml({ accessKey: key(2), number: '9', prest: OTHER, toma: OWN, dhProc: '2026-11-12T10:00:00-03:00' }), key(2)),
      nfseItem(3, nfseXml({ accessKey: key(3), number: '2', prest: OWN, toma: OTHER, dhProc: '2026-11-14T10:00:00-03:00' }), key(3)),
      eventItem(4, key(3), 'CANCELAMENTO'),
    ]
    const ctx = setup(items)
    const repo = createSqliteRepo(ctx.db)
    await repo.save(localNota('pedido-1', '2026-11-10T13:00:05.000Z', key(1)))
    await repo.save(localNota('pedido-2', '2026-11-13T00:00:00.000Z'))
    await ctx.sync.run()
    return ctx
  }
  const ids = (store: AdnStore, options: Parameters<AdnStore['list']>[0]) => store.list(options).map((item) => `${item.source}:${item.source === 'local' ? item.nota.id : item.nota.accessKey}`)

  it('shows the local notas and the ADN ones newest first, once each', async () => {
    const { store } = await seed()
    expect(ids(store, { limit: 10 })).toEqual([`adn:${key(3)}`, 'local:pedido-2', `adn:${key(2)}`, 'local:pedido-1'])
  })

  it('filters by role and status and pages with the cursor', async () => {
    const { store } = await seed()
    expect(ids(store, { limit: 10, role: 'taker' })).toEqual([`adn:${key(2)}`])
    expect(ids(store, { limit: 10, role: 'issuer' })).toEqual([`adn:${key(3)}`, 'local:pedido-2', 'local:pedido-1'])
    expect(ids(store, { limit: 10, status: 'canceled' })).toEqual([`adn:${key(3)}`])
    expect(ids(store, { limit: 2, before: '2026-11-13T00:00:00.000Z', beforeId: 'pedido-2' })).toEqual([`adn:${key(2)}`, 'local:pedido-1'])
  })
})

describe('routes', () => {
  const TOKEN = 'secret-token'
  const env = envFrom({
    NFSE_ENVIRONMENT: 'restricted',
    ISSUER_CNPJ: OWN,
    ISSUER_CITY_CODE: '3550308',
    ISSUER_SIMPLES_OPTION: '3',
    ISSUER_SIMPLES_APURATION: '1',
    ISSUER_SIMPLES_TOTAL_TAX_PERCENT: '6.00',
    API_TOKEN: TOKEN,
  })
  const auth = { authorization: `Bearer ${TOKEN}` }
  const received = nfseXml({ accessKey: key(2), number: '9', prest: OTHER, toma: OWN })

  const app = (withAdn = true) => {
    const { db, store, sync, adn } = setup([nfseItem(1, received, key(2))])
    const gov: Gov = {
      ...adn.gov,
      get: async (host, path) => (path === `/SefinNacional/nfse/${key(2)}` ? ok(200, { nfseXml: received }) : adn.gov.get(host, path)),
    }
    return createApp({ env, repo: createSqliteRepo(db), gov, certificate: () => ({ error: 'none' }), adn: withAdn ? { store, sync } : undefined })
  }

  it('syncs, lists and shows an ADN nota', async () => {
    const api = app()
    const synced = await api.request('http://api.test/v1/adn/sync', { method: 'POST', headers: auth })
    expect(await synced.json()).toMatchObject({ fetched: 1, caughtUp: true, count: 1 })
    expect(await (await api.request('http://api.test/v1/notas', { headers: auth })).json()).toEqual({ notas: [] })
    const merged = (await (await api.request('http://api.test/v1/notas?include=adn&role=taker', { headers: auth })).json()) as { notas: Array<Record<string, unknown>> }
    expect(merged.notas).toHaveLength(1)
    expect(merged.notas[0]).toMatchObject({ id: key(2), source: 'adn', role: 'taker', status: 'issued', nfseNumber: '9', issuer: { taxId: OTHER } })
    expect((await api.request('http://api.test/v1/notas?include=adn&role=boss', { headers: auth })).status).toBe(400)
    const detail = await api.request(`http://api.test/v1/notas/${key(2)}`, { headers: auth })
    expect(await detail.json()).toMatchObject({ id: key(2), request: { valueCents: 10000, taker: { taxId: OWN } } })
  })

  it('renders the PDF of an ADN nota from the XML SEFIN returns', async () => {
    const api = app()
    await api.request('http://api.test/v1/adn/sync', { method: 'POST', headers: auth })
    const res = await api.request(`http://api.test/v1/notas/${key(2)}/pdf?download=1`, { headers: auth })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="nfse-9.pdf"')
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
    expect((await api.request(`http://api.test/v1/notas/${key(7)}/pdf`, { headers: auth })).status).toBe(404)
  })

  it('answers 404 on the sync routes without the mirror', async () => {
    const api = app(false)
    expect((await api.request('http://api.test/v1/adn/sync', { headers: auth })).status).toBe(404)
    expect((await api.request('http://api.test/v1/adn/sync', { method: 'POST', headers: auth })).status).toBe(404)
  })
})
