import { createHmac, randomBytes, timingSafeEqual as bytesEqual } from 'node:crypto'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'

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

/** The longest wait after a wrong password, in seconds. The delay never grows past it, so the admin is never locked out for good (D-07). */
export const THROTTLE_MAX_DELAY_SECONDS = 30
/** A failure this long after the previous one counts as the first again. */
export const THROTTLE_RESET_MS = 10 * 60 * 1000
/** The most addresses the throttle remembers; past it the oldest is forgotten. */
export const THROTTLE_MAX_ENTRIES = 10_000

const ADDRESS_MAX_LENGTH = 64
const PRUNE_MIN_ENTRIES = 100
const PRUNE_INTERVAL_MS = 60_000

interface ThrottleEntry {
  failures: number
  blockedUntil: number
  lastFailureAt: number
  inFlight: boolean
}

export interface LoginThrottle {
  /** 0 when the attempt may proceed (the address is now marked in flight); otherwise the whole seconds to wait, at least 1. */
  begin(ip: string): number
  /** Ends an attempt that `begin` allowed: a success forgets the address, a failure lengthens its wait. */
  end(ip: string, ok: boolean): void
  /** How many addresses are remembered. */
  size(): number
}

/**
 * Per-address login delay: after the n-th consecutive wrong password an address waits min(2^(n-1), 30) seconds, answered
 * by the caller as 429 before any password work. One attempt per address runs at a time, so parallel guesses from one
 * address never run scrypt in parallel. There is no global limit (D-08): it would let an attacker lock the admin out.
 */
export const createLoginThrottle = ({ now }: { now: () => number }): LoginThrottle => {
  const entries = new Map<string, ThrottleEntry>()
  const keyOf = (ip: string) => ip.slice(0, ADDRESS_MAX_LENGTH)
  let lastPruneAt = Number.NEGATIVE_INFINITY

  // At most once per minute of clock time, so an attack with many addresses cannot turn every login into a full scan.
  const prune = (at: number) => {
    if (entries.size <= PRUNE_MIN_ENTRIES || at - lastPruneAt < PRUNE_INTERVAL_MS) return
    for (const [key, entry] of entries) {
      if (!entry.inFlight && entry.blockedUntil <= at && at - entry.lastFailureAt > THROTTLE_RESET_MS) entries.delete(key)
    }
    lastPruneAt = at
  }

  return {
    // The check and the in-flight mark run with no await between them, so two concurrent posts cannot both pass.
    begin(ip) {
      const key = keyOf(ip)
      const at = now()
      prune(at)
      const entry = entries.get(key)
      if (entry?.inFlight) return 1
      if (entry && entry.blockedUntil > at) return Math.ceil((entry.blockedUntil - at) / 1000)
      if (entry) {
        entry.inFlight = true
        return 0
      }
      if (entries.size >= THROTTLE_MAX_ENTRIES) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(key, { failures: 0, blockedUntil: 0, lastFailureAt: 0, inFlight: true })
      return 0
    },
    end(ip, ok) {
      const key = keyOf(ip)
      const entry = entries.get(key)
      if (!entry) return
      if (ok) {
        entries.delete(key)
        return
      }
      const at = now()
      entry.inFlight = false
      if (at - entry.lastFailureAt > THROTTLE_RESET_MS) entry.failures = 0
      entry.failures += 1
      entry.lastFailureAt = at
      entry.blockedUntil = at + Math.min(2 ** (entry.failures - 1), THROTTLE_MAX_DELAY_SECONDS) * 1000
    },
    size: () => entries.size,
  }
}

/**
 * The address a login attempt is counted under: the last X-Forwarded-For entry, else the connection address, else
 * 'unknown'. The last entry is the one the nearest proxy appends. This is an accepted risk (D-09): with nothing in
 * front of the server a client can send a different fake X-Forwarded-For on each attempt and dodge the delay; the
 * 12-character minimum plus scrypt keep brute force impractical. Behind two chained proxies (a CDN, then Caddy) the
 * users of one edge share a counter.
 */
export const clientIp = (c: Context): string => {
  const last = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim().slice(0, ADDRESS_MAX_LENGTH)
  if (last) return last
  try {
    // getConnInfo throws under app.request (no Node socket), so a missing address falls back to 'unknown'.
    return getConnInfo(c).remote.address?.slice(0, ADDRESS_MAX_LENGTH) || 'unknown'
  } catch {
    return 'unknown'
  }
}
