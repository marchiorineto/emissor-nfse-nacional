import { describe, expect, it } from 'vitest'
import { createApi } from './api.js'
import type { ApiFetch, ApiResponse } from './api.d.ts'

type Call = Parameters<ApiFetch>

/** A response shaped like fetch's; json() rejects when `json` is undefined, like an HTML 502. */
const response = (status: number, json?: unknown, headers: Record<string, string> = {}): ApiResponse => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: () => (json === undefined ? Promise.reject(new SyntaxError('Unexpected token <')) : Promise.resolve(json)),
})

/** A fake fetch that records its calls and answers with the next response (or rejects with an Error). */
const fakeFetch = (...answers: Array<ApiResponse | Error>) => {
  const calls: Call[] = []
  const fetch: ApiFetch = async (...args) => {
    calls.push(args)
    const answer = answers.shift() ?? response(200, {})
    if (answer instanceof Error) throw answer
    return answer
  }
  return { fetch, calls }
}

/** An api over a fake fetch; now() returns 1000 then 1250, and the redirects are recorded. */
const setup = (...answers: Array<ApiResponse | Error>) => {
  const { fetch, calls } = fakeFetch(...answers)
  const redirects: string[] = []
  const clock = [1000, 1250]
  const token = { value: 'tok-1' }
  const api = createApi({ fetch, csrf: () => token.value, redirect: (url) => redirects.push(url), now: () => clock.shift() ?? 9999 })
  return { api, calls, redirects, token }
}

describe('request', () => {
  it('posts JSON with the session cookie and exactly the three headers', async () => {
    const { api, calls } = setup(response(200, { id: 'x' }))
    await api.request('POST', '/v1/notas', { id: 'x' })
    expect(calls).toHaveLength(1)
    const [path, init] = calls[0] as Call
    expect(path).toBe('/v1/notas')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')
    expect(init.headers).toEqual({ accept: 'application/json', 'content-type': 'application/json', 'x-csrf-token': 'tok-1' })
    expect(init.body).toBe('{"id":"x"}')
  })

  it('never sends an Authorization header', async () => {
    const { api, calls } = setup(response(200, {}))
    await api.request('POST', '/v1/notas', {})
    const [, init] = calls[0] as Call
    expect(Object.keys(init.headers).map((name) => name.toLowerCase())).not.toContain('authorization')
  })

  it('resolves { status, body, date, elapsedMs } for 200, 202, 400, 403 and 422 without throwing', async () => {
    for (const status of [200, 202, 400, 403, 422]) {
      const { api } = setup(response(status, { status }, { date: 'Sat, 21 Nov 2026 15:00:10 GMT' }))
      await expect(api.request('POST', '/v1/notas', {})).resolves.toEqual({ status, body: { status }, date: 'Sat, 21 Nov 2026 15:00:10 GMT', elapsedMs: 250 })
    }
  })

  it('gives a null body when the answer is not JSON and a null date without the header', async () => {
    const { api } = setup(response(502))
    await expect(api.request('POST', '/v1/notas', {})).resolves.toEqual({ status: 502, body: null, date: null, elapsedMs: 250 })
  })

  it('sends no body and no content-type without a payload', async () => {
    const { api, calls } = setup(response(200, {}))
    await api.request('POST', '/v1/notas/a/cancel')
    const [, init] = calls[0] as Call
    expect(init.body).toBeUndefined()
    expect(init.headers).toEqual({ accept: 'application/json', 'x-csrf-token': 'tok-1' })
  })

  it('redirects to /login once and rejects with "unauthorized" on a 401', async () => {
    const { api, redirects } = setup(response(401, { error: 'unauthorized' }))
    await expect(api.request('POST', '/v1/notas', {})).rejects.toThrow('unauthorized')
    expect(redirects).toEqual(['/login'])
  })

  it('rejects on a network failure and never redirects', async () => {
    const { api, redirects } = setup(new TypeError('Failed to fetch'))
    await expect(api.request('POST', '/v1/notas', {})).rejects.toThrow(TypeError)
    expect(redirects).toEqual([])
  })

  it('reads the CSRF token on every request', async () => {
    const { api, calls, token } = setup(response(200, {}), response(200, {}))
    await api.request('POST', '/v1/notas', {})
    token.value = 'tok-2'
    await api.request('POST', '/v1/notas', {})
    expect((calls[0] as Call)[1].headers['x-csrf-token']).toBe('tok-1')
    expect((calls[1] as Call)[1].headers['x-csrf-token']).toBe('tok-2')
  })
})

describe('get', () => {
  it('sends a GET with only the accept header and returns the parsed body on 200', async () => {
    const { api, calls } = setup(response(200, { id: 'a' }))
    await expect(api.get('/v1/notas/a')).resolves.toEqual({ id: 'a' })
    const [path, init] = calls[0] as Call
    expect(path).toBe('/v1/notas/a')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('same-origin')
    expect(init.headers).toEqual({ accept: 'application/json' })
    expect(init.body).toBeUndefined()
  })

  it('rejects with "HTTP 404" on a 404', async () => {
    const { api, redirects } = setup(response(404, { error: 'not found' }))
    await expect(api.get('/v1/notas/a')).rejects.toThrow('HTTP 404')
    expect(redirects).toEqual([])
  })

  it('redirects to /login and rejects with "unauthorized" on a 401', async () => {
    const { api, redirects } = setup(response(401, {}))
    await expect(api.get('/v1/notas/a')).rejects.toThrow('unauthorized')
    expect(redirects).toEqual(['/login'])
  })
})
