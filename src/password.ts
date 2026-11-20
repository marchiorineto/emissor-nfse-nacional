import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/** Fewest code points an admin password may have. */
export const MIN_PASSWORD_LENGTH = 12
/** Most code points an admin password may have; bounds the work one login can cause. */
export const MAX_PASSWORD_LENGTH = 1024
/** scrypt settings for new hashes: one of OWASP's equivalent settings, about 0.4 s and 64 MiB per hash. */
export const SCRYPT_PARAMS = { N: 65536, r: 8, p: 2, keylen: 32 }
/** Memory ceiling passed to scrypt; Node's default of 32 MiB rejects N=65536 with r=8. */
export const SCRYPT_MAXMEM = 256 * 1024 * 1024

/** A stored hash split into its scrypt parameters, salt and derived key. */
export interface ParsedHash {
  N: number
  r: number
  p: number
  salt: Buffer
  hash: Buffer
}

const HASH_PATTERN = /^scrypt:(\d{1,7}):(\d{1,2}):(\d{1,2}):([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{43})$/
const SALT_BYTES = 16
const KEY_BYTES = 32
const MIN_COST = 1024
const MAX_COST = 1048576
const MAX_BLOCK_OR_PARALLEL = 16

/** The one place a password becomes a key, so hashing and verifying cannot diverge (NFKC on both sides). */
const derive = (password: string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keylen, { N, r, p, maxmem: SCRYPT_MAXMEM }, (error, key) => (error ? reject(error) : resolve(key)))
  })

/** Why a password is not acceptable, in pt-BR; undefined when it is fine. Counts code points and never trims. */
export const validatePassword = (password: string): string | undefined => {
  if (!password) return 'a senha não pode ser vazia.'
  const length = [...password].length
  if (length < MIN_PASSWORD_LENGTH) return `a senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (length > MAX_PASSWORD_LENGTH) return `a senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`
  return undefined
}

/** A salted scrypt hash, `scrypt:<N>:<r>:<p>:<salt>:<key>` with base64url fields, safe unquoted in .env and Docker Compose. */
export const hashPassword = async (password: string): Promise<string> => {
  const { N, r, p, keylen } = SCRYPT_PARAMS
  const salt = randomBytes(SALT_BYTES)
  const key = await derive(password, salt, N, r, p, keylen)
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join(':')
}

/** Splits a stored hash; undefined when it is malformed or its parameters are outside the accepted bounds. */
export const parseHash = (stored: string): ParsedHash | undefined => {
  const match = HASH_PATTERN.exec(stored)
  if (!match) return undefined
  const [N, r, p] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const powerOfTwo = (N & (N - 1)) === 0
  if (!powerOfTwo || N < MIN_COST || N > MAX_COST) return undefined
  if (r < 1 || r > MAX_BLOCK_OR_PARALLEL || p < 1 || p > MAX_BLOCK_OR_PARALLEL) return undefined
  const salt = Buffer.from(match[4] ?? '', 'base64url')
  const hash = Buffer.from(match[5] ?? '', 'base64url')
  if (salt.length !== SALT_BYTES || hash.length !== KEY_BYTES) return undefined
  return { N, r, p, salt, hash }
}

/** Whether the password matches the stored hash. Never throws: a bad hash, an overlong password or a scrypt refusal is false. */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parsed = parseHash(stored)
  if (!parsed || [...password].length > MAX_PASSWORD_LENGTH) return false
  try {
    const key = await derive(password, parsed.salt, parsed.N, parsed.r, parsed.p, parsed.hash.length)
    return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash)
  } catch {
    return false
  }
}
