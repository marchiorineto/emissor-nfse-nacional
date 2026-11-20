import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import https from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildDps, type Issuer } from './dps.ts'
import { createCertificateSource, createGov } from './gov.ts'

const issuer: Issuer = { cnpj: '11222333000181', cityCode: '3550308', simplesNacionalOption: '3', simplesNacionalTotalTaxPercent: '6.00' }
const dir = mkdtempSync(join(tmpdir(), 'nfse-gov-'))
const pfxPath = join(dir, 'client.pfx')
const PASSWORD = 'senha-teste'
const pfxB64 = () => readFileSync(pfxPath).toString('base64')

const openssl = (...args: string[]) => execFileSync('openssl', args, { stdio: 'pipe' })

/** A self-signed key and certificate, written as `<name>.key` and `<name>.crt`. */
const selfSigned = (name: string) => {
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, `${name}.key`), '-out', join(dir, `${name}.crt`), '-days', '1', '-subj', `/CN=${name}`)
  return { key: readFileSync(join(dir, `${name}.key`)), cert: readFileSync(join(dir, `${name}.crt`)) }
}

/** Stands in for the government: asks for the client certificate and records what it gets. */
let server: https.Server
let host = ''
const received: Array<{ method: string; path: string; clientCn: string; body: string }> = []
const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED

beforeAll(async () => {
  selfSigned('client')
  openssl('pkcs12', '-export', '-inkey', join(dir, 'client.key'), '-in', join(dir, 'client.crt'), '-out', pfxPath, '-passout', `pass:${PASSWORD}`)
  const { key, cert } = selfSigned('gov')
  server = https.createServer({ key, cert, requestCert: true, rejectUnauthorized: false }, (request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const peer = (request.socket as import('node:tls').TLSSocket).getPeerCertificate()
      received.push({ method: request.method ?? '', path: request.url ?? '', clientCn: String(peer.subject?.CN ?? ''), body: Buffer.concat(chunks).toString() })
      if (request.url?.startsWith('/danfse/')) return response.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.4')
      response.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ chaveAcesso: 'KEY' }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`
  // The stand-in's certificate is self-signed; the real servers' are checked as usual.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
})

afterAll(() => {
  server.close()
  if (previousTlsSetting === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
  else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting
})

describe('gov over mTLS', () => {
  it('signs the DPS and sends it gzipped, presenting the client certificate', async () => {
    const gov = createGov(createCertificateSource({ CERT_PFX_B64: pfxB64(), CERT_PASSWORD: PASSWORD }))
    const { xml } = buildDps({
      environment: 'restricted',
      issuer,
      series: '1',
      number: 1,
      competence: '2026-11-10',
      issuedAt: new Date('2026-11-10T12:00:00Z'),
      serviceCode: '080201',
      description: 'Aula',
      valueCents: 100,
    })
    const result = await gov.sendDps(host, xml)
    expect(result).toMatchObject({ reached: true, status: 201, json: { chaveAcesso: 'KEY' } })
    const sent = received.at(-1)!
    expect(sent).toMatchObject({ method: 'POST', path: '/SefinNacional/nfse', clientCn: 'client' })
    const dps = gunzipSync(Buffer.from(JSON.parse(sent.body).dpsXmlGZipB64, 'base64')).toString()
    expect(dps).toContain('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')
  })

  it('returns PDFs base64-encoded', async () => {
    const gov = createGov(createCertificateSource({ CERT_PFX_B64: pfxB64(), CERT_PASSWORD: PASSWORD }))
    expect(await gov.get(host, '/danfse/KEY')).toEqual({ reached: true, status: 200, json: { pdfB64: Buffer.from('%PDF-1.4').toString('base64') } })
  })

  it('does not reach the government without a usable certificate', async () => {
    const wrongPassword = createCertificateSource({ CERT_PFX_B64: pfxB64(), CERT_PASSWORD: 'errada' })
    expect(wrongPassword()).toEqual({ error: expect.stringContaining('cannot open the certificate') })
    expect(await createGov(wrongPassword).get(host, '/x')).toMatchObject({ reached: false })
    expect(createCertificateSource({ CERT_PFX_B64: '', CERT_PASSWORD: PASSWORD })()).toEqual({ error: expect.stringContaining('no certificate') })
  })
})
