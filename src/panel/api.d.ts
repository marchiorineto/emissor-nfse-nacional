// Types of api.js, the panel's fetch wrapper. The folder has no allowJs, so tsc needs this file to accept typed imports.
// The response and fetch types are structural because tsconfig has no DOM lib.

/** The part of a fetch Response the wrapper reads. */
export type ApiResponse = { status: number; ok: boolean; headers: { get(name: string): string | null }; json(): Promise<unknown> }
/** The fetch the wrapper calls: always same-origin credentials and a plain header record. */
export type ApiFetch = (path: string, init: { method: string; credentials: 'same-origin'; headers: Record<string, string>; body?: string }) => Promise<ApiResponse>
/** What a write resolves to: the HTTP status, the parsed JSON (null when it is not JSON), the Date header and the milliseconds the browser waited. */
export type ApiAnswer = { status: number; body: any; date: string | null; elapsedMs: number }
/** The panel's door to /v1: `get` returns the JSON of a 2xx answer, `request` resolves any HTTP answer. */
export type Api = { get(path: string): Promise<any>; request(method: 'POST', path: string, payload?: unknown): Promise<ApiAnswer> }

/** An api over the given fetch, CSRF token reader and redirect; a 401 redirects to /login and throws Error('unauthorized'). */
export function createApi(deps: { fetch: ApiFetch; csrf: () => string; redirect: (url: string) => void; now?: () => number }): Api
/** The api of the browser page: global fetch, the CSRF token of the page's meta tag, location.assign. */
export function pageApi(): Api
