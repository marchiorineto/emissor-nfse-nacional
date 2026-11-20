import { beforeAll, describe, expect, it } from 'vitest'
import { hashPassword, parseHash, validatePassword, verifyPassword } from './password.ts'

const PASSWORD = 'correct horse battery'
const HASH_FORMAT = /^scrypt:65536:8:2:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/

/** The shared valid hash with one field replaced, so each malformed case differs from a valid hash in exactly one field. */
const withField = (hash: string, index: number, value: string): string => {
  const fields = hash.split(':')
  fields[index] = value
  return fields.join(':')
}

// A hash costs about 0.4 s at the production parameters, so the suite shares one and allows for slow machines.
describe('password hashing', { timeout: 30_000 }, () => {
  let hash = ''
  beforeAll(async () => {
    hash = await hashPassword(PASSWORD)
  }, 30_000)

  describe('validatePassword', () => {
    it('rejects an empty password', () => {
      expect(validatePassword('')).toBe('a senha não pode ser vazia.')
    })

    it('requires at least 12 characters', () => {
      expect(validatePassword('a'.repeat(11))).toContain('12')
      expect(validatePassword('a'.repeat(12))).toBeUndefined()
    })

    it('counts code points, not UTF-16 units', () => {
      expect(validatePassword('a'.repeat(10) + '😀')).toBeDefined()
      expect(validatePassword('a'.repeat(11) + '😀')).toBeUndefined()
    })

    it('allows at most 1024 characters', () => {
      expect(validatePassword('a'.repeat(1025))).toContain('1024')
      expect(validatePassword('a'.repeat(1024))).toBeUndefined()
    })

    it('never trims the password', () => {
      expect(validatePassword(' '.repeat(12))).toBeUndefined()
    })
  })

  describe('hashPassword', () => {
    it('produces the documented format', () => {
      expect(hash).toMatch(HASH_FORMAT)
    })

    it('salts every hash, and every hash verifies', async () => {
      const other = await hashPassword(PASSWORD)
      expect(other).not.toBe(hash)
      expect(await verifyPassword(PASSWORD, hash)).toBe(true)
      expect(await verifyPassword(PASSWORD, other)).toBe(true)
    })
  })

  describe('parseHash', () => {
    it('reads the parameters, salt and key of a fresh hash', () => {
      const parsed = parseHash(hash)
      expect(parsed).toMatchObject({ N: 65536, r: 8, p: 2 })
      expect(parsed?.salt.length).toBe(16)
      expect(parsed?.hash.length).toBe(32)
    })
  })

  describe('verifyPassword', () => {
    it('refuses a wrong password', async () => {
      expect(await verifyPassword('wrong horse battery', hash)).toBe(false)
    })

    it('refuses a password over the maximum length even when it is the one that was hashed', async () => {
      const overlong = 'a'.repeat(1025)
      expect(await verifyPassword(overlong, await hashPassword(overlong))).toBe(false)
      expect(await verifyPassword('a'.repeat(1025), hash)).toBe(false)
    })

    it('accepts the composed and decomposed forms of one accented password (NFKC)', async () => {
      const composed = 'café secreto 12'
      const decomposed = composed.normalize('NFD')
      expect(decomposed).not.toBe(composed)
      const accented = await hashPassword(composed)
      expect(await verifyPassword(composed, accented)).toBe(true)
      expect(await verifyPassword(decomposed, accented)).toBe(true)
    })

    const malformed: [string, (valid: string) => string][] = [
      ['an empty string', () => ''],
      ['a bare scheme name', () => 'scrypt'],
      ['a `$`-separated variant', (valid) => valid.replaceAll(':', '$')],
      ['N that is not a power of two', (valid) => withField(valid, 1, '65535')],
      ['N above 2^20', (valid) => withField(valid, 1, '2097152')],
      ['r above 16', (valid) => withField(valid, 2, '17')],
      ['p above 16', (valid) => withField(valid, 3, '17')],
      ['a 21-character salt', (valid) => withField(valid, 4, 'A'.repeat(21))],
      ['N at the limit with r 16, which scrypt refuses above maxmem', (valid) => withField(withField(valid, 1, '1048576'), 2, '16')],
    ]
    it.each(malformed)('resolves false, never throws, for %s', async (_name, build) => {
      expect(await verifyPassword(PASSWORD, build(hash))).toBe(false)
    })

    it('does not block the event loop', async () => {
      let ticked = false
      const pending = verifyPassword(PASSWORD, hash)
      setImmediate(() => {
        ticked = true
      })
      await pending
      expect(ticked).toBe(true)
    })
  })
})
