import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import { verifyPassword } from './password.ts'

const ROOT = join(import.meta.dirname, '..')

/** A temp copy of the script and its hash module, with the given files at its root. The script finds its root from its own location, so it only ever writes this folder's .env. */
const workspace = (files: Record<string, string | Buffer>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'nfse-admin-password-'))
  mkdirSync(join(dir, 'scripts'))
  mkdirSync(join(dir, 'src'))
  copyFileSync(join(ROOT, 'scripts', 'admin-password.mjs'), join(dir, 'scripts', 'admin-password.mjs'))
  copyFileSync(join(ROOT, 'src', 'password.ts'), join(dir, 'src', 'password.ts'))
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
  return dir
}

/** Runs the script the way the package script does, with `input` on standard input. */
const run = (dir: string, input: string, env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ['--openssl-legacy-provider', '--disable-warning=ExperimentalWarning', '--env-file-if-exists=.env', 'scripts/admin-password.mjs'], {
    cwd: dir,
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })

const exampleFile = readFileSync(join(ROOT, '.env.example'), 'utf8')

describe('pnpm run admin-password', () => {
  it('writes a scrypt hash that verifies the password to .env and tells the operator to restart', { timeout: 30_000 }, async () => {
    const dir = workspace({ '.env.example': exampleFile })
    const result = run(dir, 'correct horse battery\ncorrect horse battery\n')
    expect(result.status).toBe(0)
    const hash = parseEnv(readFileSync(join(dir, '.env'), 'utf8')).ADMIN_PASSWORD
    expect(hash).toMatch(/^scrypt:65536:8:2:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/)
    expect(await verifyPassword('correct horse battery', hash as string)).toBe(true)
    expect(result.stdout).toContain('Reinicie o servidor')
  })
})

const HASH_FORMAT = /^scrypt:65536:8:2:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/
const envPath = (dir: string): string => join(dir, '.env')
const hashIn = (dir: string): string | undefined => parseEnv(readFileSync(envPath(dir), 'utf8')).ADMIN_PASSWORD

/** The plaintext must be in none of the file, the output or the error output. */
const expectNoPlaintext = (dir: string, result: ReturnType<typeof run>, ...passwords: string[]) => {
  const written = existsSync(envPath(dir)) ? readFileSync(envPath(dir), 'utf8') : ''
  for (const password of passwords) {
    expect(written).not.toContain(password)
    expect(result.stdout).not.toContain(password)
    expect(result.stderr).not.toContain(password)
  }
}

describe('bad entries leave .env alone', () => {
  const OLD = 'A=1\nADMIN_PASSWORD=scrypt:old\nB=2\n'

  it('refuses entries that differ', () => {
    const dir = workspace({ '.env': OLD })
    const before = readFileSync(envPath(dir))
    const result = run(dir, 'first password long\nsecond password long\n')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Erro: as duas senhas são diferentes.')
    expect(readFileSync(envPath(dir)).equals(before)).toBe(true)
    expectNoPlaintext(dir, result, 'first password long', 'second password long')
  })

  it.each([['blank lines', '\n\n'], ['no input at all', '']])('refuses an empty password: %s', (_name, input) => {
    const dir = workspace({ '.env': OLD })
    const before = readFileSync(envPath(dir))
    const result = run(dir, input)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Erro: a senha não pode ser vazia.')
    expect(readFileSync(envPath(dir)).equals(before)).toBe(true)
  })

  it('refuses a password of 11 characters', () => {
    const dir = workspace({ '.env': OLD })
    const before = readFileSync(envPath(dir))
    const result = run(dir, 'short pass1\nshort pass1\n')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('12')
    expect(readFileSync(envPath(dir)).equals(before)).toBe(true)
    expectNoPlaintext(dir, result, 'short pass1')
  })

  it('creates no .env when the entry is bad and there was none', () => {
    const dir = workspace({})
    expect(run(dir, 'short pass1\nshort pass1\n').status).toBe(1)
    expect(existsSync(envPath(dir))).toBe(false)
  })

  it('never reads the password from the environment, where ADMIN_PASSWORD is the old hash', () => {
    const dir = workspace({ '.env': OLD })
    const before = readFileSync(envPath(dir))
    const result = run(dir, '', { ADMIN_PASSWORD: 'correct horse battery' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Erro: a senha não pode ser vazia.')
    expect(readFileSync(envPath(dir)).equals(before)).toBe(true)
  })
})

describe('good entries edit only the ADMIN_PASSWORD lines', () => {
  const PASSWORD = 'correct horse battery'
  const input = `${PASSWORD}\n${PASSWORD}\n`

  it('creates .env from .env.example, changing only the ADMIN_PASSWORD line', { timeout: 30_000 }, () => {
    const dir = workspace({ '.env.example': exampleFile })
    const result = run(dir, input)
    expect(result.status).toBe(0)
    const before = exampleFile.split('\n')
    const after = readFileSync(envPath(dir), 'utf8').split('\n')
    expect(after).toHaveLength(before.length)
    const changed = after.flatMap((line, index) => (line === before[index] ? [] : [line]))
    expect(changed).toHaveLength(1)
    expect(changed[0]).toMatch(/^ADMIN_PASSWORD=scrypt:/)
    expectNoPlaintext(dir, result, PASSWORD)
  })

  it('creates .env holding only the ADMIN_PASSWORD line when there is no template either', { timeout: 30_000 }, () => {
    const dir = workspace({})
    expect(run(dir, input).status).toBe(0)
    const text = readFileSync(envPath(dir), 'utf8')
    expect(text).toBe(`ADMIN_PASSWORD=${hashIn(dir)}\n`)
    expect(hashIn(dir)).toMatch(HASH_FORMAT)
  })

  it('keeps CRLF endings and leaves lookalike lines alone', { timeout: 30_000 }, () => {
    const lines = ['A=1', 'ADMIN_PASSWORD=old', 'ADMIN_PASSWORD_OLD=x', '# ADMIN_PASSWORD=y', 'B=2']
    const dir = workspace({ '.env': lines.join('\r\n') })
    expect(run(dir, input).status).toBe(0)
    const after = readFileSync(envPath(dir), 'utf8').split('\r\n')
    expect(after).toHaveLength(5)
    expect(after[1]).toMatch(/^ADMIN_PASSWORD=scrypt:/)
    expect([after[0], after[2], after[3], after[4]]).toEqual([lines[0], lines[2], lines[3], lines[4]])
  })

  it('appends after a newline when .env has no ADMIN_PASSWORD line and no final newline', { timeout: 30_000 }, () => {
    const dir = workspace({ '.env': 'A=1' })
    expect(run(dir, input).status).toBe(0)
    expect(readFileSync(envPath(dir), 'utf8')).toBe(`A=1\nADMIN_PASSWORD=${hashIn(dir)}\n`)
  })

  it('rewrites every ADMIN_PASSWORD line, so the parser cannot land on a stale one', { timeout: 30_000 }, () => {
    const dir = workspace({ '.env': 'ADMIN_PASSWORD=old1\nX=1\nADMIN_PASSWORD=old2\n' })
    expect(run(dir, input).status).toBe(0)
    const hash = hashIn(dir)
    expect(hash).toMatch(HASH_FORMAT)
    expect(readFileSync(envPath(dir), 'utf8')).toBe(`ADMIN_PASSWORD=${hash}\nX=1\nADMIN_PASSWORD=${hash}\n`)
  })

  it('replaces the hash on a second run with one that verifies only the new password', { timeout: 60_000 }, async () => {
    const dir = workspace({ '.env.example': exampleFile })
    expect(run(dir, 'first password long\nfirst password long\n').status).toBe(0)
    const first = hashIn(dir) as string
    expect(run(dir, 'second password long\nsecond password long\n').status).toBe(0)
    const second = hashIn(dir) as string
    expect(second).not.toBe(first)
    expect(await verifyPassword('second password long', second)).toBe(true)
    expect(await verifyPassword('first password long', second)).toBe(false)
    expect(readFileSync(envPath(dir), 'utf8').match(/^ADMIN_PASSWORD=/gm)).toHaveLength(1)
  })

  it('leaves .env at mode 0600, whether it created the file or found it', { timeout: 60_000 }, () => {
    const created = workspace({})
    expect(run(created, input).status).toBe(0)
    expect(statSync(envPath(created)).mode & 0o777).toBe(0o600)
    const existing = workspace({ '.env': 'A=1\n' })
    chmodSync(envPath(existing), 0o644)
    expect(run(existing, input).status).toBe(0)
    expect(statSync(envPath(existing)).mode & 0o777).toBe(0o600)
  })

  it('never lets the plaintext reach .env, stdout or stderr', { timeout: 30_000 }, () => {
    const dir = workspace({ '.env.example': exampleFile })
    expectNoPlaintext(dir, run(dir, input), PASSWORD)
  })
})
