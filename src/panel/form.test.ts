import { describe, expect, it } from 'vitest'
import {
  brasiliaToday,
  buildIssueBody,
  digitsOnly,
  isAlreadyIssued,
  issueHints,
  issueProblem,
  loadServiceDefaults,
  parseBrl,
  SERVICE_DEFAULTS_KEY,
  saveServiceDefaults,
  suggestId,
  validateForm,
} from './form.js'
import type { IssueFields } from './form.d.ts'

const fields = (overrides: Partial<IssueFields> = {}): IssueFields => ({
  id: 'painel-20261121-abc123',
  taxId: '',
  name: '',
  email: '',
  phone: '',
  serviceCode: '080201',
  nbsCode: '',
  description: 'Aula de violão',
  value: '1.234,56',
  competence: '2026-11-21',
  ...overrides,
})

const TODAY = '2026-11-21'

describe('brasiliaToday', () => {
  it('is still the previous day one second before 03:00 UTC', () => {
    expect(brasiliaToday(new Date('2026-11-21T02:59:59Z'))).toBe('2026-11-20')
  })

  it('turns to the next day at 03:00 UTC', () => {
    expect(brasiliaToday(new Date('2026-11-21T03:00:00Z'))).toBe('2026-11-21')
  })

  it('keeps the last day of the year until 03:00 UTC', () => {
    expect(brasiliaToday(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12-31')
  })
})

describe('suggestId', () => {
  it('skips the biased bytes 252 to 255 and maps the rest to the alphabet', () => {
    const bytes = () => Uint8Array.from([252, 253, 254, 255, 0, 1, 2, 3, 4, 35, 0, 0])
    expect(suggestId(new Date('2026-11-21T15:00:00Z'), bytes)).toBe('painel-20261121-abcde9')
  })

  it('takes the date from Brasília, not from UTC', () => {
    expect(suggestId(new Date('2026-11-21T02:30:00Z')).startsWith('painel-20261120-')).toBe(true)
  })

  it('draws again when a batch has too few usable bytes', () => {
    let calls = 0
    const bytes = () => {
      calls += 1
      return calls === 1 ? Uint8Array.from({ length: 12 }, () => 255) : Uint8Array.from([0, 1, 2, 3, 4, 5, 0, 0, 0, 0, 0, 0])
    }
    expect(suggestId(new Date('2026-11-21T15:00:00Z'), bytes)).toBe('painel-20261121-abcdef')
    expect(calls).toBe(2)
  })

  it('matches the id shape with the default random source', () => {
    for (let n = 0; n < 50; n++) expect(suggestId()).toMatch(/^painel-\d{8}-[a-z0-9]{6}$/)
  })
})

describe('parseBrl', () => {
  it.each([
    ['R$ 1.234,56', 123456],
    ['R$ 1.234,56', 123456],
    ['1.234,56', 123456],
    ['1234,5', 123450],
    ['1.234', 123400],
    ['10', 1000],
    ['0,01', 1],
  ])('reads %j as %d cents', (text, cents) => {
    expect(parseBrl(text)).toBe(cents)
  })

  it.each(['1234.56', '0', '0,00', '-5', '12,345', '1.23,45', '', 'abc', '12345678901234'])('refuses %j', (text) => {
    expect(parseBrl(text)).toBeUndefined()
  })
})

describe('digitsOnly', () => {
  it('removes every character that is not a digit', () => {
    expect(digitsOnly('123.456.789-09')).toBe('12345678909')
  })
})

describe('buildIssueBody', () => {
  it('builds exactly the API body from padded and punctuated input', () => {
    const body = buildIssueBody(
      fields({
        id: ' painel-20261121-abc123 ',
        serviceCode: '08.02.01',
        nbsCode: '1.2301.21.00',
        description: ' Aula de violão ',
        taxId: '11.222.333/0001-81',
        name: ' Acme Ltda ',
        email: ' a@b.test ',
        phone: '(11) 99999-0000',
      }),
    )
    expect(body).toEqual({
      id: 'painel-20261121-abc123',
      competence: '2026-11-21',
      serviceCode: '080201',
      nbsCode: '123012100',
      description: 'Aula de violão',
      valueCents: 123456,
      taker: { taxId: '11222333000181', name: 'Acme Ltda', email: 'a@b.test', phone: '11999990000' },
    })
  })

  it('leaves out empty email, phone and nbsCode', () => {
    const body = buildIssueBody(fields({ taxId: '123.456.789-09', name: 'Maria Souza' }))
    expect(body.taker).toEqual({ taxId: '12345678909', name: 'Maria Souza' })
    expect(Object.keys(body)).not.toContain('nbsCode')
  })

  it('leaves out the whole taker when its four fields are empty', () => {
    expect(Object.keys(buildIssueBody(fields()))).not.toContain('taker')
  })

  it('sends a taker that has only a name, so the API reports what is missing', () => {
    expect(buildIssueBody(fields({ name: 'Maria' })).taker).toEqual({ taxId: '', name: 'Maria' })
  })

  it('never carries replaces or export and never sends an empty string for an optional field', () => {
    const body = buildIssueBody(fields({ taxId: '12345678909', name: 'Maria' }))
    expect(body).not.toHaveProperty('replaces')
    expect(body).not.toHaveProperty('export')
    expect(JSON.stringify(body)).not.toContain('""')
  })
})

describe('validateForm', () => {
  it('accepts a form with every required field and no taker', () => {
    expect(validateForm(fields(), TODAY)).toEqual({})
  })

  it('accepts a CPF and a CNPJ taker with valid check digits', () => {
    expect(validateForm(fields({ taxId: '12345678909', name: 'Maria' }), TODAY)).toEqual({})
    expect(validateForm(fields({ taxId: '11.222.333/0001-81', name: 'Acme' }), TODAY)).toEqual({})
  })

  it('wants an id of 1 to 200 characters after trimming', () => {
    expect(validateForm(fields({ id: '   ' }), TODAY).id).toBe('Informe um identificador de 1 a 200 caracteres.')
    expect(validateForm(fields({ id: 'a'.repeat(201) }), TODAY).id).toBe('Informe um identificador de 1 a 200 caracteres.')
    expect(validateForm(fields({ id: ` ${'a'.repeat(200)} ` }), TODAY).id).toBeUndefined()
  })

  it('wants a 6-digit service code', () => {
    expect(validateForm(fields({ serviceCode: '8021' }), TODAY).serviceCode).toBe('O código do serviço tem 6 dígitos (cTribNac).')
    expect(validateForm(fields({ serviceCode: '' }), TODAY).serviceCode).toBeDefined()
    expect(validateForm(fields({ serviceCode: '08.02.01' }), TODAY).serviceCode).toBeUndefined()
  })

  it('wants the NBS code empty or with 9 digits', () => {
    expect(validateForm(fields({ nbsCode: '12345' }), TODAY).nbsCode).toBe('O código NBS tem 9 dígitos.')
    expect(validateForm(fields({ nbsCode: '123012100' }), TODAY).nbsCode).toBeUndefined()
  })

  it('wants a description', () => {
    expect(validateForm(fields({ description: '  ' }), TODAY).description).toBe('Descreva o serviço.')
  })

  it('wants a value greater than zero', () => {
    for (const value of ['', '0,00', 'abc', '1234.56']) {
      expect(validateForm(fields({ value }), TODAY).value).toBe('Informe o valor como 1.234,56, maior que zero.')
    }
  })

  it('wants a competence in YYYY-MM-DD that is not after today', () => {
    expect(validateForm(fields({ competence: '' }), TODAY).competence).toBe('Informe a competência.')
    expect(validateForm(fields({ competence: '21/11/2026' }), TODAY).competence).toBe('Informe a competência.')
    expect(validateForm(fields({ competence: '2026-11-22' }), TODAY).competence).toBe('A competência não pode ser depois de hoje.')
    expect(validateForm(fields({ competence: '2026-11-21' }), TODAY).competence).toBeUndefined()
    expect(validateForm(fields({ competence: '2026-01-02' }), TODAY).competence).toBeUndefined()
  })

  it('wants a CPF or CNPJ with valid check digits as soon as any taker field is filled', () => {
    const message = 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.'
    expect(validateForm(fields({ name: 'Maria' }), TODAY).taxId).toBe(message)
    for (const taxId of ['123', '12345678900', '11111111111', '11222333000180']) {
      expect(validateForm(fields({ taxId, name: 'Maria' }), TODAY).taxId).toBe(message)
    }
  })

  it('wants a name when the taker is started by another field', () => {
    expect(validateForm(fields({ taxId: '12345678909' }), TODAY).name).toBe('Informe o nome do tomador.')
    expect(validateForm(fields({ email: 'a@b.test' }), TODAY).name).toBe('Informe o nome do tomador.')
  })

  it('wants a phone of 6 to 20 digits when filled', () => {
    const taker = { taxId: '12345678909', name: 'Maria' }
    expect(validateForm(fields({ ...taker, phone: '12345' }), TODAY).phone).toBe('O telefone deve ter de 6 a 20 dígitos.')
    expect(validateForm(fields({ ...taker, phone: '1'.repeat(21) }), TODAY).phone).toBeDefined()
    expect(validateForm(fields({ ...taker, phone: '(11) 99999-0000' }), TODAY).phone).toBeUndefined()
  })

  it('wants an e-mail shaped something@something when filled', () => {
    const taker = { taxId: '12345678909', name: 'Maria' }
    for (const email of ['maria', 'maria@', '@b.test', 'a b@c.d']) {
      expect(validateForm(fields({ ...taker, email }), TODAY).email).toBe('Informe um e-mail válido.')
    }
    expect(validateForm(fields({ ...taker, email: 'a@b.test' }), TODAY).email).toBeUndefined()
  })

  it('reports every failing field at once', () => {
    const problems = validateForm(fields({ id: '', value: '', description: '' }), TODAY)
    expect(Object.keys(problems).sort()).toEqual(['description', 'id', 'value'])
  })
})

describe('issueProblem', () => {
  it.each([
    ['id: a string up to 200 characters', 'id'],
    ['competence: YYYY-MM-DD', 'competence'],
    ['serviceCode: the 6-digit national code (cTribNac)', 'serviceCode'],
    ['nbsCode: the 9-digit NBS code', 'nbsCode'],
    ['description: required', 'description'],
    ['valueCents: a positive integer', 'value'],
    ['taker.name: required', 'name'],
    ['taker.taxId: a CPF or CNPJ (or taker.abroad for a taker outside Brazil)', 'taxId'],
    ['taker.phone: 6 to 20 digits', 'phone'],
    ['taker.email: a string', 'email'],
  ])('maps %j to the %s field with a pt-BR message', (message, field) => {
    const problem = issueProblem(message)
    expect(problem.field).toBe(field)
    expect(problem.message).toMatch(/[.]$/)
    expect(problem.message).not.toContain(message)
  })

  it('keeps the API text after a pt-BR lead-in for an unknown message', () => {
    expect(issueProblem('body must be a JSON object')).toEqual({ field: '', message: 'A API recusou o pedido: body must be a JSON object' })
  })
})

describe('isAlreadyIssued', () => {
  const date = 'Sat, 21 Nov 2026 15:00:10 GMT'
  const answer = { date, elapsedMs: 200 }

  it('is true for an issued nota last updated before the request started', () => {
    expect(isAlreadyIssued({ status: 'issued', updatedAt: '2026-11-21T15:00:00.000Z' }, answer)).toBe(true)
  })

  it('is true for a canceled and a replaced nota likewise', () => {
    for (const status of ['canceled', 'replaced'] as const) {
      expect(isAlreadyIssued({ status, updatedAt: '2026-11-21T15:00:00.000Z' }, answer)).toBe(true)
    }
  })

  it('is false for a nota updated after the request started, whatever its creation time', () => {
    expect(isAlreadyIssued({ status: 'issued', updatedAt: '2026-11-21T15:00:09.900Z' }, answer)).toBe(false)
    expect(isAlreadyIssued({ status: 'issued', updatedAt: '2026-11-21T15:00:10.000Z' }, answer)).toBe(false)
  })

  it('is false for a rejected, pending or unknown nota whatever the times', () => {
    for (const status of ['rejected', 'pending', 'unknown'] as const) {
      expect(isAlreadyIssued({ status, updatedAt: '2026-11-21T10:00:00.000Z' }, answer)).toBe(false)
    }
  })

  it('is false when the Date header is missing or unparseable', () => {
    const nota = { status: 'issued', updatedAt: '2026-11-21T10:00:00.000Z' } as const
    expect(isAlreadyIssued(nota, { date: null, elapsedMs: 200 })).toBe(false)
    expect(isAlreadyIssued(nota, { date: 'not a date', elapsedMs: 200 })).toBe(false)
  })
})

describe('issueHints', () => {
  const issued = 'O governo pode ter emitido esta nota mesmo com este erro. Confira na consulta pública antes de enviar de novo.'
  const competence = 'A competência não pode ser depois da data de emissão. Se ela é hoje e passou há pouco da meia-noite, espere um minuto e envie de novo com o mesmo identificador.'

  it('warns that the government may have issued the nota when an error code is an HTTP 2xx', () => {
    expect(issueHints({ errors: [{ code: 'HTTP 200' }] })).toEqual([issued])
    expect(issueHints({ errors: [{ code: 'HTTP 201' }] })).toEqual([issued])
  })

  it('explains E0015', () => {
    expect(issueHints({ errors: [{ code: 'E0015' }] })).toEqual([competence])
  })

  it('gives both, the 2xx warning first, each once', () => {
    expect(issueHints({ errors: [{ code: 'E0015' }, { code: 'HTTP 200' }, { code: 'HTTP 202' }, { code: 'E0015' }] })).toEqual([issued, competence])
  })

  it('gives nothing for other codes or no errors', () => {
    expect(issueHints({ errors: [{ code: 'E0310' }, { code: 'HTTP 403' }] })).toEqual([])
    expect(issueHints({ errors: [] })).toEqual([])
    expect(issueHints({})).toEqual([])
  })
})

describe('remembered service fields', () => {
  const storageWith = (value: string | null) => ({ getItem: (key: string) => (key === SERVICE_DEFAULTS_KEY ? value : null) })

  it('loads only serviceCode, nbsCode and description, and drops values that are not strings', () => {
    const stored = JSON.stringify({ serviceCode: '080201', nbsCode: '123012100', description: 'Aula', value: '9,99', taxId: '12345678909' })
    expect(loadServiceDefaults(storageWith(stored))).toEqual({ serviceCode: '080201', nbsCode: '123012100', description: 'Aula' })
    expect(loadServiceDefaults(storageWith(JSON.stringify({ serviceCode: 80201, description: 'Aula' })))).toEqual({ description: 'Aula' })
  })

  it('gives {} for a missing key, malformed JSON, a throwing storage and no storage', () => {
    expect(loadServiceDefaults(storageWith(null))).toEqual({})
    expect(loadServiceDefaults(storageWith('{not json'))).toEqual({})
    expect(loadServiceDefaults(storageWith('"text"'))).toEqual({})
    expect(
      loadServiceDefaults({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toEqual({})
    expect(loadServiceDefaults(undefined)).toEqual({})
  })

  it('saves JSON with exactly the three keys under SERVICE_DEFAULTS_KEY, never the taker or the value', () => {
    const written: Array<[string, string]> = []
    saveServiceDefaults({ setItem: (key, value) => written.push([key, value]) }, fields({ taxId: '12345678909', name: 'Maria', nbsCode: '123012100' }))
    expect(written).toHaveLength(1)
    const [[key, value]] = written as [[string, string]]
    expect(key).toBe(SERVICE_DEFAULTS_KEY)
    expect(JSON.parse(value)).toEqual({ serviceCode: '080201', nbsCode: '123012100', description: 'Aula de violão' })
  })

  it('swallows a setItem that throws and a missing storage', () => {
    expect(() =>
      saveServiceDefaults(
        {
          setItem: () => {
            throw new Error('quota')
          },
        },
        fields(),
      ),
    ).not.toThrow()
    expect(() => saveServiceDefaults(undefined, fields())).not.toThrow()
  })

  it('uses the documented storage key', () => {
    expect(SERVICE_DEFAULTS_KEY).toBe('nfse-painel:servico')
  })
})
