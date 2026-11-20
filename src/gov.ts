// Talks to the NFS-e Nacional servers. They ask for the client certificate through TLS renegotiation, which Node's
// https client does; the server must run with --openssl-legacy-provider so older .pfx files (RC2/3DES) open too.
import { execFileSync } from 'node:child_process'
import https from 'node:https'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { Gov, GovResult } from './notas.ts'
import { signXml } from './sign.ts'

const TIMEOUT_MS = 30_000

export interface CertificateSettings {
  /** The .pfx in base64, as `pnpm run certificate` writes it into .env. */
  CERT_PFX_B64: string
  CERT_PASSWORD: string
}

/** The certificate, ready to sign and to open mTLS connections. */
export interface Certificate {
  pfx: Buffer
  passphrase: string
  keyPem: string
  certB64: string
  notAfter: string
}

const openssl = (args: string[], input: Buffer | string, password: string): string =>
  execFileSync('openssl', args, { input, stdio: 'pipe', env: { ...process.env, CERT_PASSWORD: password } }).toString()

/** Reads the .pfx: the key and certificate for signing, and its expiry. */
const readCertificate = ({ CERT_PFX_B64: pfxB64, CERT_PASSWORD: password }: CertificateSettings): Certificate | { error: string } => {
  const pfx = Buffer.from(pfxB64, 'base64')
  if (!pfx.length) return { error: 'no certificate: add it with `pnpm run certificate <file.pfx>`' }
  if (!password) return { error: 'no CERT_PASSWORD: add the certificate again with `pnpm run certificate <file.pfx>`' }
  // -legacy also opens the older .pfx files (RC2/3DES) that many certificate authorities still issue.
  const readPfx = (args: string[]) => openssl(['pkcs12', '-legacy', '-passin', 'env:CERT_PASSWORD', ...args], pfx, password)
  try {
    const certPem = openssl(['x509'], readPfx(['-nokeys', '-clcerts']), password)
    return {
      pfx,
      passphrase: password,
      keyPem: openssl(['pkey'], readPfx(['-nocerts', '-nodes']), password),
      certB64: certPem.replace(/-----[^-]+-----|\s/g, ''),
      notAfter: openssl(['x509', '-noout', '-enddate'], certPem, password).trim().replace('notAfter=', ''),
    }
  } catch (error) {
    const { stderr, message } = error as { stderr?: Buffer; message: string }
    const detail = String(stderr || message).trim().split('\n')[0]
    return { error: `cannot open the certificate (wrong password?): ${detail}` }
  }
}

/** The certificate, read once on first use. Never throws; an `error` says why there is no certificate. */
export const createCertificateSource = (settings: CertificateSettings): (() => Certificate | { error: string }) => {
  let cached: Certificate | { error: string } | undefined
  return () => (cached ??= readCertificate(settings))
}

interface GovResponse {
  status: number
  type: string
  body: Buffer
}

const request = (certificate: Certificate, host: string, method: string, path: string, body?: unknown): Promise<GovResponse> =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const [hostname, port] = host.split(':')
    const call = https.request(
      {
        host: hostname,
        port: port ? Number(port) : 443,
        path,
        method,
        pfx: certificate.pfx,
        passphrase: certificate.passphrase,
        timeout: TIMEOUT_MS,
        headers: { accept: 'application/json, application/pdf', ...(payload ? { 'content-type': 'application/json' } : {}) },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => resolve({ status: response.statusCode ?? 0, type: response.headers['content-type'] ?? '', body: Buffer.concat(chunks) }))
        response.on('error', reject)
      },
    )
    call.on('timeout', () => call.destroy(new Error('timeout')))
    call.on('error', reject)
    if (payload) call.write(payload)
    call.end()
  })

/** Gov JSON with every `*XmlGZipB64` field also returned decoded as `*Xml`. */
const decodeJson = (buffer: Buffer): Record<string, unknown> => {
  const text = buffer.toString('utf8')
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    for (const [key, value] of Object.entries(json)) {
      if (key.endsWith('XmlGZipB64') && typeof value === 'string') json[key.replace('GZipB64', '')] = gunzipSync(Buffer.from(value, 'base64')).toString('utf8')
    }
    return json
  } catch {
    return { raw: text.slice(0, 4000) }
  }
}

/**
 * The Gov adapter over mTLS. Any failure before an HTTP answer (no certificate, network, timeout) comes back as
 * `reached: false`, so the nota stays retryable.
 */
export const createGov = (certificate: () => Certificate | { error: string }): Gov => {
  const attempt = async (run: (certificate: Certificate) => Promise<{ status: number; json: Record<string, unknown> }>): Promise<GovResult> => {
    const current = certificate()
    if ('error' in current) return { reached: false, error: current.error }
    try {
      const { status, json } = await run(current)
      return { reached: true, status, json }
    } catch (error) {
      return { reached: false, error: String((error as Error).message ?? error) }
    }
  }
  return {
    /** Signs the DPS and asks for the NFS-e. */
    sendDps: (host, xml) =>
      attempt(async (current) => {
        const signed = signXml(xml, current.keyPem, current.certB64)
        const response = await request(current, host, 'POST', '/SefinNacional/nfse', { dpsXmlGZipB64: gzipSync(signed).toString('base64') })
        return { status: response.status, json: { ...decodeJson(response.body), signedXml: signed } }
      }),
    /** Signs and registers an event (cancellation) on an NFS-e. */
    sendEvent: (host, accessKey, xml) =>
      attempt(async (current) => {
        const signed = signXml(xml, current.keyPem, current.certB64)
        const response = await request(current, host, 'POST', `/SefinNacional/nfse/${encodeURIComponent(accessKey)}/eventos`, {
          pedidoRegistroEventoXmlGZipB64: gzipSync(signed).toString('base64'),
        })
        return { status: response.status, json: decodeJson(response.body) }
      }),
    /** Read-only call; PDFs come back base64-encoded. */
    get: (host, path) =>
      attempt(async (current) => {
        const response = await request(current, host, 'GET', path)
        return response.type.includes('pdf')
          ? { status: response.status, json: { pdfB64: response.body.toString('base64') } }
          : { status: response.status, json: decodeJson(response.body) }
      }),
  }
}
