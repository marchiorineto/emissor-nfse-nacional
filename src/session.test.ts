import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  clientIp,
  createLoginThrottle,
  csrfToken,
  isHttps,
  issueSession,
  readSession,
  sessionKey,
  SESSION_SECONDS,
  THROTTLE_MAX_ENTRIES,
  THROTTLE_RESET_MS,
  timingSafeEqual,
} from './session.ts'

const T = Date.UTC(2026, 10, 20, 12)
const key = sessionKey('scrypt:hash-a')

/** The same string with one character of `part` (a 0-based segment of id.exp.signature) changed. */
const corrupt = (value: string, part: number): string => {
  const pieces = value.split('.')
  const piece = pieces[part] ?? ''
  pieces[part] = `${piece.slice(0, -1)}${piece.endsWith('1') ? '2' : '1'}`
  return pieces.join('.')
}

describe('session cookie', () => {
  it('issues a value of the documented shape that reads back to its id', () => {
    const { id, value } = issueSession(key, T)
    expect(value).toMatch(/^[A-Za-z0-9_-]{22}\.\d+\.[A-Za-z0-9_-]{43}$/)
    expect(readSession(key, value, T)).toEqual({ id })
  })

  it('refuses a value whose id, expiry or signature was changed', () => {
    const { value } = issueSession(key, T)
    for (const part of [0, 1, 2]) expect(readSession(key, corrupt(value, part), T)).toBeUndefined()
  })

  it('expires on the server at exactly 12 hours', () => {
    const { value } = issueSession(key, T)
    expect(SESSION_SECONDS).toBe(43200)
    expect(readSession(key, value, T + 43_199_999)).toBeDefined()
    expect(readSession(key, value, T + 43_200_000)).toBeUndefined()
  })

  it('refuses a value issued under another key', () => {
    const { value } = issueSession(sessionKey('scrypt:hash-a'), T)
    expect(readSession(sessionKey('scrypt:hash-b'), value, T)).toBeUndefined()
  })

  it('treats absent, empty and malformed values as no session', () => {
    for (const value of [undefined, '', 'x', 'a.b.c']) expect(readSession(key, value, T)).toBeUndefined()
  })
})

describe('csrfToken', () => {
  it('is stable, bound to the id and the key, and distinct from the session signature', () => {
    const { id, value } = issueSession(key, T)
    expect(csrfToken(key, id)).toBe(csrfToken(key, id))
    expect(csrfToken(key, id)).not.toBe(csrfToken(key, `${id}x`))
    expect(csrfToken(key, id)).not.toBe(csrfToken(sessionKey('scrypt:hash-b'), id))
    expect(csrfToken(key, id)).not.toBe(value.split('.')[2])
  })
})

describe('isHttps', () => {
  it('detects HTTPS from the URL, PUBLIC_URL or X-Forwarded-Proto', () => {
    expect(isHttps('https://api.test/login', '', undefined)).toBe(true)
    expect(isHttps('http://api.test/login', 'https://nfse.example.com', undefined)).toBe(true)
    expect(isHttps('http://api.test/login', '', 'https')).toBe(true)
    expect(isHttps('http://api.test/login', '', 'http')).toBe(false)
    expect(isHttps('http://api.test/login', '', undefined)).toBe(false)
  })
})

describe('timingSafeEqual', () => {
  it('compares strings by content and length', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('login throttle', () => {
  const setup = () => {
    const clock = { ms: T }
    return { clock, throttle: createLoginThrottle({ now: () => clock.ms }) }
  }
  const fail = (throttle: ReturnType<typeof setup>['throttle'], ip: string) => {
    expect(throttle.begin(ip)).toBe(0)
    throttle.end(ip, false)
  }

  it('waits 1, 2, 4, 8, 16, 30, 30 seconds after the 1st to 7th consecutive failure', () => {
    const { clock, throttle } = setup()
    const waits: number[] = []
    for (let n = 1; n <= 7; n++) {
      fail(throttle, 'a')
      waits.push(throttle.begin('a'))
      clock.ms += waits[n - 1]! * 1000
    }
    expect(waits).toEqual([1, 2, 4, 8, 16, 30, 30])
  })

  it('lets the address in again at exactly the end of the wait', () => {
    const { clock, throttle } = setup()
    fail(throttle, 'a')
    clock.ms += 999
    expect(throttle.begin('a')).toBe(1)
    clock.ms += 1
    expect(throttle.begin('a')).toBe(0)
  })

  it('forgets an address after a success, so the next failure waits 1 second again', () => {
    const { clock, throttle } = setup()
    fail(throttle, 'a')
    clock.ms += 1000
    fail(throttle, 'a')
    clock.ms += 2000
    expect(throttle.begin('a')).toBe(0)
    throttle.end('a', true)
    fail(throttle, 'a')
    expect(throttle.begin('a')).toBe(1)
  })

  it('counts a failure more than 10 minutes after the previous one as the first again', () => {
    const { clock, throttle } = setup()
    for (let n = 0; n < 4; n++) {
      fail(throttle, 'a')
      clock.ms += 60_000
    }
    clock.ms += THROTTLE_RESET_MS
    fail(throttle, 'a')
    expect(throttle.begin('a')).toBe(1)
  })

  it('refuses a second attempt while one is in flight and clears the mark on end', () => {
    const { throttle } = setup()
    expect(throttle.begin('a')).toBe(0)
    expect(throttle.begin('a')).toBe(1)
    throttle.end('a', true)
    expect(throttle.begin('a')).toBe(0)
  })

  it('does not slow another address', () => {
    const { throttle } = setup()
    fail(throttle, 'a')
    expect(throttle.begin('b')).toBe(0)
  })

  it('prunes idle entries once the map is large and 60 seconds passed', () => {
    const { clock, throttle } = setup()
    for (let n = 0; n < 150; n++) fail(throttle, `10.0.0.${n}`)
    expect(throttle.size()).toBe(150)
    clock.ms += 11 * 60 * 1000
    expect(throttle.begin('new')).toBe(0)
    expect(throttle.size()).toBe(1)
  })

  it('never holds more than 10 000 addresses and stays fast', () => {
    const { throttle } = setup()
    const started = performance.now()
    for (let n = 0; n <= THROTTLE_MAX_ENTRIES; n++) fail(throttle, `host-${n}`)
    expect(throttle.size()).toBeLessThanOrEqual(THROTTLE_MAX_ENTRIES)
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('stores an address under its first 64 characters', () => {
    const { throttle } = setup()
    fail(throttle, 'x'.repeat(100))
    expect(throttle.begin('x'.repeat(64))).toBe(1)
    expect(throttle.begin(`${'x'.repeat(64)}y`)).toBe(1)
  })
})

describe('clientIp', () => {
  const app = new Hono().get('/', (c) => c.text(clientIp(c)))
  const ipFor = async (header?: string) => (await app.request('http://api.test/', { headers: header === undefined ? {} : { 'x-forwarded-for': header } })).text()

  it('is the last X-Forwarded-For entry, trimmed and cut to 64 characters', async () => {
    expect(await ipFor('198.51.100.7, 203.0.113.9')).toBe('203.0.113.9')
    expect(await ipFor(' 203.0.113.9 ')).toBe('203.0.113.9')
    expect(await ipFor('y'.repeat(100))).toBe('y'.repeat(64))
  })

  it('is "unknown" with no header and no connection address', async () => {
    expect(await ipFor()).toBe('unknown')
  })
})
