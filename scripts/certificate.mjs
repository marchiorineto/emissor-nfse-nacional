// Adds the A1 certificate to .env: checks that the .pfx opens with the password, is not expired and belongs to the
// ISSUER_CNPJ, then writes it in base64 as CERT_PFX_B64, with CERT_PASSWORD. Creates .env from .env.example when
// there is none, and generates the API_TOKEN when it is empty.
// Usage: pnpm run certificate <file.pfx>. Asks for the password, or reads it from CERT_PASSWORD given on the command
// line (CERT_PASSWORD=... pnpm run certificate <file.pfx>); the CERT_PASSWORD already in .env is never reused.
// Runs again over an existing .env, replacing CERT_PFX_B64 and CERT_PASSWORD and keeping every other line.
// package.json runs it with --openssl-legacy-provider, so older .pfx files (RC2/3DES) open here as in the server.
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSecureContext, TLSSocket } from 'node:tls'
import { parseEnv } from 'node:util'

const ROOT = join(import.meta.dirname, '..')
const ENV_FILE = join(ROOT, '.env')
const ENV_EXAMPLE = join(ROOT, '.env.example')

const fail = (message) => {
  console.error(`\nErro: ${message}`)
  process.exit(1)
}

/** Reads a line from the terminal without showing it. */
const askHidden = (question) =>
  new Promise((resolve, reject) => {
    const { stdin, stdout } = process
    if (!stdin.isTTY) return reject(new Error('sem terminal para pedir a senha; defina CERT_PASSWORD'))
    const chars = []
    const finish = (settle) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
      settle()
    }
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish(() => resolve(chars.join('')))
        if (char === '\u0003') return finish(() => reject(new Error('cancelado')))
        if (char === '\u007f' || char === '\b') chars.pop()
        else chars.push(char)
      }
    }
    // Echo goes off before the question shows, so nothing typed right away appears on screen.
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.on('data', onData)
    stdin.resume()
    stdout.write(question)
  })

/** The certificate in the .pfx, opened the way the server's TLS client opens it. */
const openCertificate = (pfx, passphrase) => {
  try {
    const socket = new TLSSocket(null, { isServer: true, secureContext: createSecureContext({ pfx, passphrase }) })
    const certificate = socket.getCertificate()
    socket.destroy()
    return certificate?.subject ? certificate : fail('o arquivo não tem um certificado.')
  } catch (error) {
    return fail(/mac verify failure/i.test(error.message) ? 'senha incorreta.' : `não foi possível abrir o certificado (${error.message}).`)
  }
}

const [file] = process.argv.slice(2)
if (!file) fail('informe o arquivo: pnpm run certificate <arquivo.pfx>')

const pfx = (() => {
  try {
    return readFileSync(file)
  } catch {
    return fail(`arquivo não encontrado: ${file}`)
  }
})()
// package.json loads .env, so CERT_PASSWORD may be the one this script wrote last time (or the empty line from
// .env.example). That value belongs to the old certificate: only a CERT_PASSWORD given on the command line counts.
const fromEnvFile = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')).CERT_PASSWORD : undefined
const given = process.env.CERT_PASSWORD
const password = given && given !== fromEnvFile ? given : await askHidden('Senha do certificado: ').catch((error) => fail(error.message))
const certificate = openCertificate(pfx, password)
const expiresAt = new Date(certificate.valid_to)

console.log(`Certificado: ${certificate.subject.CN}`)
console.log(`Válido até: ${expiresAt.toLocaleDateString('pt-BR')}`)
if (expiresAt < new Date()) fail('este certificado está vencido.')

const certificateCnpj = String(certificate.subject.CN ?? '').match(/\d{14}/)?.[0]
const issuerCnpj = (process.env.ISSUER_CNPJ ?? '').replace(/\D/g, '')
if (certificateCnpj && issuerCnpj && certificateCnpj !== issuerCnpj) {
  console.warn(`Atenção: o certificado é do CNPJ ${certificateCnpj}, mas o ISSUER_CNPJ do .env é ${issuerCnpj}.`)
}

/** Sets `name=value` in the .env text, replacing the line if there is one. */
const setVar = (text, name, value) => {
  const line = `${name}=${value}`
  const pattern = new RegExp(`^${name}=.*$`, 'm')
  return pattern.test(text) ? text.replace(pattern, () => line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`
}

if (/[\r\n]/.test(password)) fail('a senha não pode ter quebra de linha.')
// The .env parser has no escapes: quote with a character the password does not have.
const quote = ["'", '`', '"'].find((char) => !password.includes(char)) ?? fail("a senha tem ', ` e \"; defina CERT_PASSWORD no ambiente.")
const quoted = `${quote}${password}${quote}`
const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : existsSync(ENV_EXAMPLE) ? readFileSync(ENV_EXAMPLE, 'utf8') : ''
const hasToken = /^API_TOKEN=\S/m.test(current)
const vars = [['CERT_PFX_B64', pfx.toString('base64')], ['CERT_PASSWORD', quoted], ...(hasToken ? [] : [['API_TOKEN', randomBytes(32).toString('hex')]])]
writeFileSync(ENV_FILE, vars.reduce((text, [name, value]) => setVar(text, name, value), current), { mode: 0o600 })
chmodSync(ENV_FILE, 0o600)
console.log('\nCertificado gravado no .env (CERT_PFX_B64 e CERT_PASSWORD).')
if (!hasToken) console.log('Token da API gerado no .env (API_TOKEN): use-o no cabeçalho Authorization dos seus sistemas.')
console.log('Reinicie o servidor para usar este certificado.')
console.log('Confira a validade em GET /health (certificate.notAfter).')
