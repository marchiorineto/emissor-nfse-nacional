import { describe, expect, it } from 'vitest'
import type { Taker } from '../dps.ts'
import {
  brasiliaDay,
  countryName,
  formatBrl,
  formatCompetence,
  formatTaxId,
  hasMore,
  isAlertStatus,
  listDate,
  listQuery,
  numberCell,
  PAGE_SIZE,
  parseStatus,
  STATUS_ORDER,
  statusLabel,
  statusSearch,
  takerCell,
} from './format.js'
import type { NotaView } from './format.d.ts'

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
