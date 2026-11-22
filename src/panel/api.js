// The panel's one door to /v1 from the browser: the session cookie plus, on a write, the page's CSRF token. No other
// credential exists here: API_TOKEN never reaches the browser and no Authorization header is ever set.

/**
 * A fetch wrapper with its dependencies injected, so Node tests drive it with a fake fetch. `get` returns the parsed JSON of a
 * 2xx answer and throws on anything else; `request` resolves every HTTP answer (4xx and 422 included) as
 * { status, body, date, elapsedMs } and rejects only on a network failure. A 401 sends the browser to the login and throws
 * Error('unauthorized') in both. `csrf` is read on every request, so a token refreshed by another login is picked up.
 */
export const createApi = ({ fetch, csrf, redirect, now = Date.now }) => {
  const unauthorized = () => {
    redirect('/login')
    return new Error('unauthorized')
  }

  const get = async (path) => {
    const res = await fetch(path, { method: 'GET', credentials: 'same-origin', headers: { accept: 'application/json' } })
    if (res.status === 401) throw unauthorized()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  const request = async (method, path, payload) => {
    const started = now()
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        'x-csrf-token': csrf(),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    })
    if (res.status === 401) throw unauthorized()
    // A proxy's HTML 502 is not JSON: the status still reaches the caller.
    const body = await res.json().catch(() => null)
    return { status: res.status, body, date: res.headers.get('date'), elapsedMs: now() - started }
  }

  return { get, request }
}

/** The api of the page: the global fetch called as a plain function (as a method of another object it throws "Illegal invocation"), the CSRF token of the page's meta tag, and location.assign for the redirect. Nothing runs at import time. */
export const pageApi = () =>
  createApi({
    fetch: (path, init) => fetch(path, init),
    csrf: () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '',
    redirect: (url) => location.assign(url),
  })
