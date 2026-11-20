import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
