import { describe, expect, it } from 'vitest'
import { csrfToken, isHttps, issueSession, readSession, sessionKey, SESSION_SECONDS, timingSafeEqual } from './session.ts'

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
