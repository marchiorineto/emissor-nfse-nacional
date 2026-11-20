import { createHmac, randomBytes, timingSafeEqual as bytesEqual } from 'node:crypto'

/** Name of the panel's session cookie. No `__Host-` prefix: it would force Secure and break plain-HTTP local installs. */
export const SESSION_COOKIE = 'nfse_admin'
/** A session lasts 12 hours from login, fixed (no renewal). */
export const SESSION_SECONDS = 43200

const SESSION_PATTERN = /^([A-Za-z0-9_-]{22})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/

/** Constant-time string comparison. */
export const timingSafeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.byteLength === right.byteLength && bytesEqual(left, right)
}

/**
 * The key that signs sessions and CSRF tokens. It derives only from the ADMIN_PASSWORD hash (never from API_TOKEN), so
 * a new hash after a restart ends every session.
 */
export const sessionKey = (adminHash: string): Buffer => createHmac('sha256', adminHash).update('admin-session').digest()

const sign = (key: Buffer, label: string): string => createHmac('sha256', key).update(label).digest('base64url')

/** A new session: a random id and a cookie value `<id>.<expSeconds>.<signature>` that expires 12 h after `nowMs`. */
export const issueSession = (key: Buffer, nowMs: number): { id: string; value: string } => {
  const id = randomBytes(16).toString('base64url')
  const exp = Math.floor(nowMs / 1000) + SESSION_SECONDS
  return { id, value: `${id}.${exp}.${sign(key, `session:${id}.${exp}`)}` }
}

/** The session a cookie value carries; undefined when it is absent, malformed, forged, signed under another key or expired. */
export const readSession = (key: Buffer, value: string | undefined, nowMs: number): { id: string } | undefined => {
  const match = value ? SESSION_PATTERN.exec(value) : null
  if (!match) return undefined
  const [, id = '', exp = '', signature = ''] = match
  if (!timingSafeEqual(signature, sign(key, `session:${id}.${exp}`))) return undefined
  return Number(exp) * 1000 > nowMs ? { id } : undefined
}

/** The CSRF token of a session, bound to its id; the distinct label keeps it from passing as a session signature. */
export const csrfToken = (key: Buffer, id: string): string => sign(key, `csrf:${id}`)

/** Whether the request came over HTTPS: the URL, PUBLIC_URL or X-Forwarded-Proto says so. */
export const isHttps = (url: string, publicUrl: string, forwardedProto: string | undefined): boolean =>
  new URL(url).protocol === 'https:' || publicUrl.startsWith('https://') || /(^|,)\s*https\s*(,|$)/i.test(forwardedProto ?? '')
