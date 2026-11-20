import { describe, expect, it } from 'vitest'
import type { Taker } from '../dps.ts'
import {
  brasiliaDay,
  countryName,
  detailSections,
  errorBoxes,
  formatBrl,
  formatCompetence,
  formatDateTime,
  formatTaxId,
  hasMore,
  httpsHref,
  isAlertStatus,
  listDate,
  listQuery,
  notaHash,
  numberCell,
  PAGE_SIZE,
  parseNotaHash,
  parseStatus,
  pdfFilename,
  pdfHref,
  STATUS_ORDER,
  statusLabel,
  statusNotice,
  statusSearch,
  takerCell,
} from './format.js'
import type { DetailSection, DetailValue, NotaView } from './format.d.ts'

const NBSP = ' '

const nota = (overrides: Partial<NotaView> & { competence?: string } = {}): NotaView => {
  const { competence, ...rest } = overrides
  return {
    id: 'a',
    status: 'issued',
    request: { id: 'a', serviceCode: '080201', description: 'Aula', valueCents: 100, ...(competence ? { competence } : {}) },
    dpsNumber: 12,
    dpsId: 'DPS12',
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    ...rest,
  }
}

describe('formatBrl', () => {
  it('formats integer cents as pt-BR currency with a no-break space after R$', () => {
    expect(formatBrl(0)).toBe(`R$${NBSP}0,00`)
    expect(formatBrl(1)).toBe(`R$${NBSP}0,01`)
    expect(formatBrl(1005)).toBe(`R$${NBSP}10,05`)
    expect(formatBrl(123456)).toBe(`R$${NBSP}1.234,56`)
  })
})

describe('formatCompetence', () => {
  it('turns YYYY-MM-DD into DD/MM/YYYY without shifting the day', () => {
    expect(formatCompetence('2026-11-20')).toBe('20/11/2026')
    expect(formatCompetence('2026-01-01')).toBe('01/01/2026')
  })

  it('returns anything else unchanged', () => {
    expect(formatCompetence('20/11/2026')).toBe('20/11/2026')
  })
})

describe('brasiliaDay', () => {
  it('is the day in America/Sao_Paulo, which changes at 03:00Z', () => {
    expect(brasiliaDay('2026-11-20T02:59:59.999Z')).toBe('19/11/2026')
    expect(brasiliaDay('2026-11-20T03:00:00.000Z')).toBe('20/11/2026')
  })
})

describe('listDate', () => {
  it('prefers the competence over the creation day', () => {
    expect(listDate(nota({ competence: '2026-11-20', createdAt: '2026-11-21T12:00:00Z' }))).toBe('20/11/2026')
  })

  it('falls back to the creation day in Brasília when there is no competence', () => {
    expect(listDate(nota({ createdAt: '2026-11-20T02:30:00Z' }))).toBe('19/11/2026')
  })
})

describe('formatTaxId', () => {
  it('formats a CNPJ, a CPF and leaves other values alone', () => {
    expect(formatTaxId('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatTaxId('12345678909')).toBe('123.456.789-09')
    expect(formatTaxId('123')).toBe('123')
  })
})

describe('countryName', () => {
  it('names a country in pt-BR and falls back to the code', () => {
    expect(countryName('US')).toBe('Estados Unidos')
    expect(countryName('not a region')).toBe('not a region')
  })
})

describe('takerCell', () => {
  it('shows a placeholder when there is no taker', () => {
    expect(takerCell(undefined)).toEqual({ name: '— (não informado)', detail: '' })
  })

  it('shows the CNPJ or CPF below the name', () => {
    expect(takerCell({ name: 'Acme', taxId: '11222333000181' })).toEqual({ name: 'Acme', detail: '11.222.333/0001-81' })
    expect(takerCell({ name: 'Maria', taxId: '12345678909' })).toEqual({ name: 'Maria', detail: '123.456.789-09' })
  })

  it('shows the country of a taker abroad, or Exterior without an address', () => {
    const address = { country: 'US', postalCode: '10001', city: 'New York', region: 'NY', street: '5th Ave', number: '1' }
    const abroad: Taker = { name: 'Acme Inc', abroad: { nif: 'X1', address } }
    expect(takerCell(abroad)).toEqual({ name: 'Acme Inc', detail: 'Estados Unidos' })
    expect(takerCell({ name: 'Globex', abroad: { noNifReason: '1' } })).toEqual({ name: 'Globex', detail: 'Exterior' })
  })

  it('returns a name with markup as the same plain string', () => {
    expect(takerCell({ name: '<script>alert(1)</script>', taxId: '12345678909' }).name).toBe('<script>alert(1)</script>')
  })
})

describe('numberCell', () => {
  it('shows the NFS-e number when there is one', () => {
    expect(numberCell({ nfseNumber: '7', dpsNumber: 12 })).toEqual({ text: 'NFS-e 7', muted: false })
  })

  it('shows the DPS number, muted, when there is no NFS-e number', () => {
    expect(numberCell({ dpsNumber: 12 })).toEqual({ text: 'DPS 12', muted: true })
  })
})

describe('statuses', () => {
  it('labels the six statuses in pt-BR and returns an unknown value as given', () => {
    const labels = ['issued', 'rejected', 'canceled', 'replaced', 'pending', 'unknown'].map(statusLabel)
    expect(labels).toEqual(['Emitida', 'Rejeitada', 'Cancelada', 'Substituída', 'Pendente', 'Sem resposta'])
    expect(statusLabel('other')).toBe('other')
  })

  it('lists them in the filter order', () => {
    expect(STATUS_ORDER).toEqual(['issued', 'rejected', 'canceled', 'replaced', 'pending', 'unknown'])
  })

  it('emphasizes only rejected and unknown', () => {
    const alerts = [...STATUS_ORDER, 'other'].filter(isAlertStatus)
    expect(alerts).toEqual(['rejected', 'unknown'])
  })
})

describe('listQuery', () => {
  it('always sends the page size first', () => {
    expect(PAGE_SIZE).toBe(20)
    expect(listQuery()).toBe('/v1/notas?limit=20')
  })

  it('adds the status only when it is set', () => {
    expect(listQuery({ status: 'rejected' })).toBe('/v1/notas?limit=20&status=rejected')
    expect(listQuery({ status: '' })).toBe('/v1/notas?limit=20')
  })

  it('adds the cursor of the last row, encoded', () => {
    expect(listQuery({ status: '', last: { createdAt: '2026-11-20T12:00:00.000Z', id: 'a b&c' } })).toBe(
      '/v1/notas?limit=20&before=2026-11-20T12%3A00%3A00.000Z&beforeId=a+b%26c',
    )
  })
})

describe('listQuery with a status and a cursor', () => {
  it('puts limit, status and the cursor together in that order', () => {
    expect(listQuery({ status: 'issued', last: { createdAt: '2026-11-20T12:00:00.000Z', id: 'n-21' } })).toBe(
      '/v1/notas?limit=20&status=issued&before=2026-11-20T12%3A00%3A00.000Z&beforeId=n-21',
    )
  })
})

describe('parseStatus', () => {
  it('reads a known status from the query string', () => {
    expect(parseStatus('?status=rejected')).toBe('rejected')
    expect(parseStatus('?status=issued&status=rejected')).toBe('issued')
  })

  it('treats no status, an unknown one and a malformed one as Todas without throwing', () => {
    expect(parseStatus('')).toBe('')
    expect(parseStatus('?status=bogus')).toBe('')
    expect(parseStatus('?status=')).toBe('')
    expect(parseStatus('?status=%E0%A4%A')).toBe('')
    expect(parseStatus('?other=issued')).toBe('')
  })
})

describe('statusSearch', () => {
  it('is empty for Todas and a status query otherwise', () => {
    expect(statusSearch('')).toBe('')
    expect(statusSearch('canceled')).toBe('?status=canceled')
  })
})

describe('hasMore', () => {
  it('is true only for a full page', () => {
    expect(hasMore(20)).toBe(true)
    expect(hasMore(19)).toBe(false)
    expect(hasMore(0)).toBe(false)
  })
})

describe('pdfHref', () => {
  it('is the relative download route of a nota with an access key', () => {
    expect(pdfHref({ id: 'pedido-1', accessKey: 'K' })).toBe('/v1/notas/pedido-1/pdf?download=1')
  })

  it('encodes a hostile id as one path segment', () => {
    expect(pdfHref({ id: 'loja/123 #?', accessKey: 'K' })).toBe('/v1/notas/loja%2F123%20%23%3F/pdf?download=1')
  })

  it('is undefined without an access key, whatever the status', () => {
    expect(pdfHref({ id: 'pedido-1' })).toBeUndefined()
    expect(pdfHref({ id: 'pedido-1', status: 'issued' } as Parameters<typeof pdfHref>[0])).toBeUndefined()
  })

  it('ignores the public links of the API response and stays on the same origin', () => {
    const view = { id: 'pedido-1', accessKey: 'K', links: { pdf: 'https://evil.example/pdf' } }
    const href = pdfHref(view)
    expect(href?.startsWith('/v1/notas/')).toBe(true)
    expect(href).not.toContain('evil.example')
  })
})

describe('pdfFilename', () => {
  it('names the file from the NFS-e number, else the DPS number', () => {
    expect(pdfFilename({ nfseNumber: '7', dpsNumber: 12 })).toBe('nfse-7.pdf')
    expect(pdfFilename({ dpsNumber: 12 })).toBe('nfse-12.pdf')
  })
})

describe('formatDateTime', () => {
  it('shows an instant in Brasília as dd/mm/aaaa, hh:mm', () => {
    expect(formatDateTime('2026-11-20T15:30:00Z')).toBe('20/11/2026, 12:30')
  })

  it('returns text that is not a date as given, without throwing', () => {
    expect(formatDateTime('not a date')).toBe('not a date')
  })
})

describe('httpsHref', () => {
  it('passes an https URL through', () => {
    expect(httpsHref('https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=1')).toBe('https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=1')
  })

  it('refuses javascript:, http: and non-strings', () => {
    expect(httpsHref('javascript:alert(1)')).toBeUndefined()
    expect(httpsHref('http://x')).toBeUndefined()
    expect(httpsHref(undefined)).toBeUndefined()
    expect(httpsHref(42)).toBeUndefined()
  })
})

describe('parseNotaHash and notaHash', () => {
  it('reads the id out of the hash', () => {
    expect(parseNotaHash('#nota=abc')).toBe('abc')
    expect(parseNotaHash('')).toBe('')
    expect(parseNotaHash('#other=1')).toBe('')
  })

  it('never throws on a malformed escape', () => {
    expect(typeof parseNotaHash('#nota=%E0%A4%A')).toBe('string')
  })

  it('round-trips an id with spaces, #, ?, %, / and an emoji', () => {
    const id = 'loja/1 #?%😀'
    expect(parseNotaHash(notaHash(id))).toBe(id)
  })
})

const issued = (overrides: Partial<NotaView> = {}) =>
  nota({
    nfseNumber: '77',
    accessKey: 'K'.repeat(50),
    issuedAt: '2026-11-20T15:30:00Z',
    createdAt: '2026-11-20T14:00:00Z',
    links: { lookup: 'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=KKK' },
    ...overrides,
    request: {
      id: 'a',
      serviceCode: '080201',
      nbsCode: '123456789',
      description: 'Aula de violão',
      valueCents: 123456,
      competence: '2026-11-19',
      taker: { name: 'Acme Ltda', taxId: '11222333000181', email: 'a@acme.test', phone: '11999990000' },
      ...overrides.request,
    },
  })

/** A request whose parts are replaced by `extra`, for the cases that vary one thing. */
const plain = (extra: Partial<NotaView['request']> = {}): NotaView['request'] => ({ id: 'a', serviceCode: '1', description: 'd', valueCents: 1, ...extra })

const titles = (sections: DetailSection[]) => sections.map((section) => section.title)
const rowsOf = (sections: DetailSection[], title: string): Record<string, DetailValue> =>
  Object.fromEntries(sections.find((section) => section.title === title)?.rows ?? [])

describe('detailSections', () => {
  it('orders an issued nota with a CNPJ taker as Resumo, Tomador, Serviço, Documento', () => {
    expect(titles(detailSections(issued()))).toEqual(['Resumo', 'Tomador', 'Serviço', 'Documento'])
  })

  it('appends Exportação, then Substituição last, only with their data', () => {
    const exportData = { resultCountry: 'US', currency: '220', foreignValueCents: 5000 }
    const withExport = issued({ request: plain({ export: exportData }) })
    expect(titles(detailSections(withExport))).toEqual(['Resumo', 'Tomador', 'Serviço', 'Documento', 'Exportação'])
    expect(titles(detailSections(issued({ replacedBy: 'b' })))).toEqual(['Resumo', 'Tomador', 'Serviço', 'Documento', 'Substituição'])
    const both = issued({ replacedBy: 'b', request: plain({ export: exportData, replaces: { id: 'z', reasonCode: '01' } }) })
    expect(titles(detailSections(both))).toEqual(['Resumo', 'Tomador', 'Serviço', 'Documento', 'Exportação', 'Substituição'])
    expect(titles(detailSections(issued({ request: plain({ replaces: { id: 'z', reasonCode: '01' } }) })))).toContain('Substituição')
  })

  it('fills Resumo of an issued nota and omits Cancelada em', () => {
    const resumo = rowsOf(detailSections(issued()), 'Resumo')
    expect(resumo['Situação']).toBe('Emitida')
    expect(resumo['Número da NFS-e']).toBe('77')
    expect(resumo['Número da DPS']).toBe('12')
    expect(resumo['Valor']).toBe(formatBrl(123456))
    expect(resumo['Criada em']).toBe('20/11/2026, 11:00')
    expect(resumo['Emitida em']).toBe('20/11/2026, 12:30')
    expect(resumo['Identificador']).toBe('a')
    expect('Cancelada em' in resumo).toBe(false)
  })

  it('shows Cancelada em only when canceledAt is set, and omits absent optional rows', () => {
    const canceled = rowsOf(detailSections(issued({ status: 'canceled', canceledAt: '2026-11-21T15:30:00Z' })), 'Resumo')
    expect(canceled['Cancelada em']).toBe('21/11/2026, 12:30')
    const bare = rowsOf(detailSections(nota({ status: 'pending' })), 'Resumo')
    expect(Object.keys(bare)).toEqual(['Situação', 'Número da DPS', 'Valor', 'Criada em', 'Identificador'])
  })

  it('shows a missing taker as one row, Nome — (não informado)', () => {
    const sections = detailSections(nota())
    expect(sections.find((section) => section.title === 'Tomador')?.rows).toEqual([['Nome', '— (não informado)']])
  })

  it('formats a CPF/CNPJ taker with e-mail and phone', () => {
    const tomador = rowsOf(detailSections(issued()), 'Tomador')
    expect(tomador['Nome']).toBe('Acme Ltda')
    expect(tomador['CPF/CNPJ']).toBe('11.222.333/0001-81')
    expect(tomador['E-mail']).toBe('a@acme.test')
    expect(tomador['Telefone']).toBe('11999990000')
  })

  it('shows a taker abroad with NIF, country and the address parts present', () => {
    const address = { country: 'US', postalCode: '10001', city: 'New York', region: 'NY', street: '5th Ave', number: '1' }
    const abroad = issued({ request: plain({ taker: { name: 'Globex', abroad: { nif: 'US-1', address } } }) })
    const tomador = rowsOf(detailSections(abroad), 'Tomador')
    expect(tomador['NIF']).toBe('US-1')
    expect(tomador['País']).toBe(countryName('US'))
    expect(tomador['Endereço']).toBe('5th Ave, 1, New York, NY, 10001')
    expect('CPF/CNPJ' in tomador).toBe(false)
    const noNif = issued({ request: plain({ taker: { name: 'G', abroad: { noNifReason: '1' } } }) })
    expect(rowsOf(detailSections(noNif), 'Tomador')['Motivo sem NIF']).toBe('Dispensado do NIF')
    const notRequired = issued({ request: plain({ taker: { name: 'G', abroad: { noNifReason: '2' } } }) })
    expect(rowsOf(detailSections(notRequired), 'Tomador')['Motivo sem NIF']).toBe('NIF não exigido')
  })

  it('fills Serviço with the code, NBS, description and competence', () => {
    const servico = rowsOf(detailSections(issued()), 'Serviço')
    expect(servico['Código do serviço']).toBe('080201')
    expect(servico['Código NBS']).toBe('123456789')
    expect(servico['Descrição']).toBe('Aula de violão')
    expect(servico['Competência']).toBe('19/11/2026')
  })

  it('links Documento: access key, https lookup and the PDF download', () => {
    const documento = rowsOf(detailSections(issued()), 'Documento')
    expect(documento['Chave de acesso']).toBe('K'.repeat(50))
    expect(documento['Consulta pública']).toEqual({ text: 'Abrir na consulta pública', href: 'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=KKK', external: true })
    expect(documento['PDF']).toEqual({ text: 'Baixar PDF', href: pdfHref(issued()), download: 'nfse-77.pdf' })
  })

  it('has no PDF row without an access key, no lookup row for a non-https link, and no Documento section without rows', () => {
    const noKey = detailSections(nota({ status: 'rejected' }))
    expect(titles(noKey)).not.toContain('Documento')
    const unsafe = rowsOf(detailSections(issued({ links: { lookup: 'javascript:alert(1)' } })), 'Documento')
    expect('Consulta pública' in unsafe).toBe(false)
  })

  it('shows the export group', () => {
    const exported = issued({
      request: plain({
        export: { resultCountry: 'US', currency: '220', foreignValueCents: 123456, mode: '2', relationship: '3', issuerSupport: '01', takerSupport: '02', shareWithMdic: true },
      }),
    })
    const exportacao = rowsOf(detailSections(exported), 'Exportação')
    expect(exportacao['País do resultado']).toBe(countryName('US'))
    expect(exportacao['Moeda (código BACEN)']).toBe('220')
    expect(exportacao['Valor na moeda']).toBe('1.234,56')
    expect(exportacao['Modo']).toBe('2 Consumo no Brasil')
    expect(exportacao['Vínculo']).toBe('3')
    expect(exportacao['Apoio do emissor']).toBe('01')
    expect(exportacao['Apoio do tomador']).toBe('02')
    expect(exportacao['Compartilhar com o MDIC']).toBe('Sim')
  })

  it('links Substituição rows to #nota= hashes, or shows the bare access key', () => {
    const both = issued({ replacedBy: 'novo/2', request: plain({ replaces: { id: 'velho 1', reasonCode: '99', reason: 'Valor errado na nota' } }) })
    const substituicao = rowsOf(detailSections(both), 'Substituição')
    expect(substituicao['Substitui']).toEqual({ text: 'velho 1', href: notaHash('velho 1') })
    expect(substituicao['Motivo da substituição']).toBe('99 – Valor errado na nota')
    expect(substituicao['Substituída por']).toEqual({ text: 'novo/2', href: notaHash('novo/2') })
    const byKey = issued({ request: plain({ replaces: { accessKey: 'X'.repeat(50), reasonCode: '01' } }) })
    expect(rowsOf(detailSections(byKey), 'Substituição')['Substitui']).toBe('X'.repeat(50))
    expect(rowsOf(detailSections(byKey), 'Substituição')['Motivo da substituição']).toBe('01')
  })

  it('returns hostile text as the same plain strings', () => {
    const hostile = '<img src=x onerror=alert(1)>'
    const view = issued({ request: plain({ description: hostile, taker: { name: hostile, taxId: '11222333000181' } }) })
    const sections = detailSections(view)
    expect(rowsOf(sections, 'Tomador')['Nome']).toBe(hostile)
    expect(rowsOf(sections, 'Serviço')['Descrição']).toBe(hostile)
  })
})

describe('errorBoxes', () => {
  const errors = [
    { code: 'E0014', message: 'DPS duplicada', detail: 'já existe' },
    { code: 'HTTP 403', message: '<img src=x onerror=alert(1)>' },
  ]

  it('gives one box for the emission errors, untouched and in order', () => {
    expect(errorBoxes(nota({ status: 'rejected', errors }))).toEqual([{ heading: 'Erros na emissão', errors }])
  })

  it('gives emission first and cancellation second when both are present', () => {
    const boxes = errorBoxes(nota({ errors, cancelErrors: [{ code: 'E9', message: 'm' }] }))
    expect(boxes.map((box) => box.heading)).toEqual(['Erros na emissão', 'Erros no cancelamento'])
    expect(boxes[1]?.errors).toEqual([{ code: 'E9', message: 'm' }])
  })

  it('gives no box for absent or empty lists', () => {
    expect(errorBoxes(nota())).toEqual([])
    expect(errorBoxes(nota({ errors: [], cancelErrors: [] }))).toEqual([])
  })
})

describe('statusNotice', () => {
  it('says the government did not answer for pending and unknown, without a retry', () => {
    const text = 'O governo não respondeu. A nota será verificada quando o sistema de origem reenviar este id.'
    expect(statusNotice(nota({ status: 'pending' }))).toBe(text)
    expect(statusNotice(nota({ status: 'unknown' }))).toBe(text)
  })

  it('says a canceled or replaced document is no longer valid', () => {
    expect(statusNotice(nota({ status: 'canceled' }))).toBe('Este documento não é mais válido: a nota foi cancelada.')
    expect(statusNotice(nota({ status: 'replaced' }))).toBe('Este documento não é mais válido: a nota foi substituída.')
  })

  it('has no notice for issued and rejected', () => {
    expect(statusNotice(nota({ status: 'issued' }))).toBeUndefined()
    expect(statusNotice(nota({ status: 'rejected' }))).toBeUndefined()
  })
})
