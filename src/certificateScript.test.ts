import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const NO_TERMINAL = 'sem terminal para pedir a senha'

/** A temp copy of the script with the given files at its root; the script only ever writes this folder's .env. */
const workspace = (files: Record<string, string | Buffer>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'nfse-certificate-'))
  mkdirSync(join(dir, 'scripts'))
  copyFileSync(join(ROOT, 'scripts', 'certificate.mjs'), join(dir, 'scripts', 'certificate.mjs'))
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
  return dir
}

/** Runs the script the way the package script does: .env loaded, standard input not a terminal. */
const run = (dir: string, env: Record<string, string> = {}) => {
  const base: NodeJS.ProcessEnv = { ...process.env }
  delete base.CERT_PASSWORD
  delete base.ISSUER_CNPJ
  return spawnSync(process.execPath, ['--openssl-legacy-provider', '--disable-warning=ExperimentalWarning', '--env-file-if-exists=.env', 'scripts/certificate.mjs', 'cert.pfx'], {
    cwd: dir,
    input: '',
    encoding: 'utf8',
    env: { ...base, ...env },
  })
}

/** A self-signed .pfx protected by `password`, made with the system openssl. */
let pfx: Buffer
const PFX_PASSWORD = 'nova-senha'
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'nfse-certificate-pfx-'))
  const key = join(dir, 'key.pem')
  const crt = join(dir, 'crt.pem')
  const out = join(dir, 'cert.pfx')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '30', '-subj', '/CN=EMPRESA TESTE:12345678000195'], { stdio: 'ignore' })
  execFileSync('openssl', ['pkcs12', '-export', '-inkey', key, '-in', crt, '-out', out, '-passout', `pass:${PFX_PASSWORD}`], { stdio: 'ignore' })
  pfx = readFileSync(out)
})

describe('pnpm run certificate over an existing .env', () => {
  it('asks for the password when .env has the empty CERT_PASSWORD copied from .env.example', () => {
    const result = run(workspace({ '.env': 'CERT_PFX_B64=\nCERT_PASSWORD=\n', 'cert.pfx': pfx }))
    expect(result.status).toBe(1)
    // Without a terminal the prompt cannot open: proof the script asked instead of trying ''.
    expect(result.stderr).toContain(NO_TERMINAL)
    expect(result.stderr).not.toContain('senha incorreta')
  })

  it('asks for the password instead of reusing the previous certificate password stored in .env', () => {
    const result = run(workspace({ '.env': "CERT_PFX_B64=b2xk\nCERT_PASSWORD='senha-antiga'\n", 'cert.pfx': pfx }))
    expect(result.stderr).toContain(NO_TERMINAL)
    expect(result.stderr).not.toContain('senha incorreta')
  })

  it('asks for the password when there is no .env at all', () => {
    expect(run(workspace({ 'cert.pfx': pfx })).stderr).toContain(NO_TERMINAL)
  })

  it('replaces the certificate in an existing .env with a CERT_PASSWORD from the command line, keeping the other lines', () => {
    const dir = workspace({
      '.env': "API_TOKEN=abc123\nISSUER_CITY_CODE=3550308\nCERT_PFX_B64=b2xk\nCERT_PASSWORD='senha-antiga'\n",
      'cert.pfx': pfx,
    })
    const result = run(dir, { CERT_PASSWORD: PFX_PASSWORD })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    const env = parseEnv(readFileSync(join(dir, '.env'), 'utf8'))
    expect(env.CERT_PFX_B64).toBe(pfx.toString('base64'))
    expect(env.CERT_PASSWORD).toBe(PFX_PASSWORD)
    expect(env.API_TOKEN).toBe('abc123')
    expect(env.ISSUER_CITY_CODE).toBe('3550308')
  })

  it('still reports a wrong password typed on the command line', () => {
    const result = run(workspace({ 'cert.pfx': pfx }), { CERT_PASSWORD: 'errada' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('senha incorreta')
  })
})
