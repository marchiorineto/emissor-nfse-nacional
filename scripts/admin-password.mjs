// Sets the admin panel password: asks for it twice, checks it, and writes only its salted scrypt hash to .env as
// ADMIN_PASSWORD. Creates .env from .env.example when there is none. Running it again replaces the hash.
// Usage: pnpm run admin-password. Asks twice on the terminal without showing what is typed; without a terminal it reads
// the two entries as two lines of standard input: printf '%s\n%s\n' "$SENHA" "$SENHA" | pnpm run admin-password
// package.json runs it with the same node flags as the certificate script.
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { hashPassword, validatePassword } from '../src/password.ts'

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
    if (!stdin.isTTY) return reject(new Error('sem terminal para pedir a senha; envie as duas linhas pela entrada padrão'))
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

/** The first `count` lines of standard input, a missing line read as an empty string. */
const readPipedLines = async (count) => {
  const lines = []
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of reader) {
    lines.push(line)
    if (lines.length === count) break
  }
  reader.close()
  while (lines.length < count) lines.push('')
  return lines
}

/** Sets `name=value` in the .env text, replacing the line if there is one. */
const setVar = (text, name, value) => {
  const line = `${name}=${value}`
  const pattern = new RegExp(`^${name}=.*$`, 'm')
  return pattern.test(text) ? text.replace(pattern, () => line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`
}

// The new password comes only from the prompt or from piped input, never from argv or the environment: the package
// script loads .env first, so ADMIN_PASSWORD in the environment is the OLD hash.
const [password, repeated] = process.stdin.isTTY
  ? [await askHidden('Nova senha do painel: ').catch((error) => fail(error.message)), await askHidden('Repita a senha: ').catch((error) => fail(error.message))]
  : await readPipedLines(2)

// Nothing is written to .env before both entries pass these checks, so a bad entry leaves the file untouched.
const problem = validatePassword(password)
if (problem) fail(problem)
if (password !== repeated) fail('as duas senhas são diferentes.')

const hash = await hashPassword(password)
const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : existsSync(ENV_EXAMPLE) ? readFileSync(ENV_EXAMPLE, 'utf8') : ''
writeFileSync(ENV_FILE, setVar(current, 'ADMIN_PASSWORD', hash), { mode: 0o600 })
chmodSync(ENV_FILE, 0o600)
console.log('\nSenha do painel gravada no .env (ADMIN_PASSWORD), só como hash scrypt.')
console.log('Reinicie o servidor para usar esta senha. As sessões abertas deixam de valer.')
