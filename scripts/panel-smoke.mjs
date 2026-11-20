// Headless-Chrome end-to-end check of the admin panel's notas list, driven over the Chrome DevTools Protocol.
//
// What it does: serves the real app (createApp with an in-memory SQLite repo and a gov stub) on 127.0.0.1, logs in through the
// real POST /login, hands the session cookie to Chrome and checks what the browser renders and sends. Chrome is started with
// the CDN stylesheet blocked, so a run is offline and deterministic: the checks rely on /panel.css and the DOM, never on
// Pico's colors. Pico's own look is left to the human check at the end of the phase.
//
// Run it from the repo root (it is a local verification aid, not part of `pnpm test`, CI or the Docker image):
//   node --disable-warning=ExperimentalWarning scripts/panel-smoke.mjs
// Environment: CHROME is the browser binary (default google-chrome); PANEL_SMOKE_SHOTS is a directory that receives
// screenshots of the list. It needs no package beyond the repo's own: Node's global WebSocket speaks CDP.
// Exit status: 0 when every check passed (and at least one ran), 1 otherwise, 2 when Chrome does not start.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from '../src/app.ts'
import { envFrom } from '../src/env.ts'
import { hashPassword } from '../src/password.ts'
import { createSqliteRepo, openDatabase } from '../src/repo.ts'

const NBSP = ' '
const HOSTILE = `<img src=x onerror="document.title='pwned'">`
const TITLE = 'Emissor de NFS-e'
const LABELS = ['Emitida', 'Rejeitada', 'Cancelada', 'Substituída', 'Pendente', 'Sem resposta']

const servers = []
let chrome
let profile
let finished = false

/** Stops everything and exits; the one way out of the script. */
const finish = (code) => {
  if (finished) return
  finished = true
  chrome?.kill('SIGKILL')
  for (const server of servers) {
    server.closeAllConnections?.()
    server.close()
  }
  try {
    if (profile) rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
  } catch {
    // A profile directory Chrome still holds open is left to the temp cleaner.
  }
  process.exit(code)
}

setTimeout(() => {
  console.log('panel-smoke: timed out after 90 s')
  finish(1)
}, 90_000).unref()

const password = randomBytes(12).toString('hex')
const hash = await hashPassword(password)
const apiToken = randomBytes(16).toString('hex')

/** Fixtures: 26 notas with strictly decreasing createdAt, index 0 the newest. The number shown on a row is 100 - index. */
const fixtures = () =>
  Array.from({ length: 26 }, (_, i) => {
    const createdAt =
      i < 5 ? `2026-11-20T0${9 - i}:00:00.000Z` : i === 5 ? '2026-11-20T02:30:00.000Z' : `2026-11-20T01:${String(59 - i).padStart(2, '0')}:00.000Z`
    const status = ['issued', 'rejected', 'unknown', 'pending', 'canceled', 'replaced'][i % 6]
    const named = { name: `Cliente ${i}`, taxId: '11222333000181' }
    const takers = {
      0: named,
      1: { name: 'Maria Souza', taxId: '12345678909' },
      2: { name: 'Acme Inc', abroad: { nif: 'US-1', address: { country: 'US', postalCode: '10001', city: 'New York', region: 'NY', street: '5th Ave', number: '1' } } },
      3: undefined,
      4: { name: 'Globex GmbH', abroad: { noNifReason: '1' } },
      6: { name: HOSTILE, taxId: '11222333000181' },
    }
    const taker = i in takers ? takers[i] : named
    const issuedLike = status === 'issued' || status === 'canceled' || status === 'replaced'
    return {
      id: `n${i}`,
      status: i === 6 ? 'issued' : status,
      request: {
        id: `n${i}`,
        serviceCode: '080201',
        description: 'Aula',
        valueCents: 1000 + i * 137,
        ...(i === 5 || i === 8 ? {} : { competence: `2026-11-${String(20 - (i % 20)).padStart(2, '0')}` }),
        ...(taker ? { taker } : {}),
      },
      dpsNumber: 100 - i,
      dpsId: `DPS${i}`,
      ...(issuedLike || i === 6 ? { accessKey: '4'.repeat(50), nfseNumber: String(100 - i) } : {}),
      createdAt,
      updatedAt: createdAt,
    }
  })

/** Serves one app on a free 127.0.0.1 port; scenarios share the password hash, so one session cookie works on every port. */
const scenario = async ({ notas = [], failList = false } = {}) => {
  const base = createSqliteRepo(openDatabase(':memory:'))
  for (const nota of notas) await base.save(nota)
  const repo = failList ? { ...base, list: async () => Promise.reject(new Error('boom')) } : base
  const unreached = { reached: false, error: 'offline' }
  const gov = {
    sendDps: async () => unreached,
    sendEvent: async () => unreached,
    get: async (_host, path) => (path.startsWith('/danfse/') ? { reached: true, status: 200, json: { pdfB64: Buffer.from('%PDF-1.4 smoke').toString('base64') } } : unreached),
  }
  const env = envFrom({
    NFSE_ENVIRONMENT: 'restricted',
    ISSUER_CNPJ: '11222333000181',
    ISSUER_CITY_CODE: '3550308',
    ISSUER_SIMPLES_OPTION: '3',
    ISSUER_SIMPLES_APURATION: '1',
    ISSUER_SIMPLES_TOTAL_TAX_PERCENT: '6.00',
    API_TOKEN: apiToken,
    ADMIN_PASSWORD: hash,
  })
  const app = createApp({ env, repo, gov, certificate: () => ({ error: 'none' }) })
  // The failing scenario answers its 500 quietly, so the run output stays readable.
  if (failList) app.onError((_error, c) => c.json({ error: 'boom' }, 500))
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  return { port: server.address().port, origin: `http://127.0.0.1:${server.address().port}`, repo }
}

const main = await scenario({ notas: fixtures() })
const empty = await scenario()
const failing = await scenario({ notas: fixtures(), failList: true })

// (c) The real login: the cookie Chrome gets is the one the server issued.
const loginRes = await fetch(`${main.origin}/login`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password }),
})
const cookie = /nfse_admin=([^;]+)/.exec(loginRes.headers.getSetCookie().join('\n'))?.[1]
if (loginRes.status !== 303 || !cookie) {
  console.log(`panel-smoke: login failed (status ${loginRes.status})`)
  finish(1)
}

// (d) Chrome over CDP.
profile = mkdtempSync(join(tmpdir(), 'panel-smoke-'))
const wsUrl = await new Promise((resolve) => {
  const fail = () => {
    console.log('panel-smoke: cannot start Chrome (set CHROME)')
    finish(2)
  }
  chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  chrome.on('error', fail)
  chrome.on('exit', fail)
  let seen = ''
  chrome.stderr.on('data', (chunk) => {
    seen += chunk
    const match = /DevTools listening on (ws:\/\/\S+)/.exec(seen)
    if (match) resolve(match[1])
  })
  setTimeout(fail, 20_000).unref()
})

const socket = new WebSocket(wsUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 0
const pending = new Map()
const listeners = []
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data))
  if (message.id !== undefined) {
    const slot = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) slot?.reject(new Error(`${message.error.message}`))
    else slot?.resolve(message.result)
  } else {
    for (const listener of listeners) listener(message)
  }
})

/** Sends one CDP command, to the page when a session is given. */
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
const page = (method, params) => send(method, params, sessionId)
for (const domain of ['Network', 'Runtime', 'Log', 'Page']) await page(`${domain}.enable`)
await page('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*'] })
await page('Network.setCookie', { name: 'nfse_admin', value: cookie, url: `${main.origin}/`, httpOnly: true, sameSite: 'Strict' })

// (e) What the page logs and sends, reset on every navigation.
let consoleErrors = []
let v1Requests = []
const extraInfo = new Map()
listeners.push((message) => {
  if (message.sessionId !== sessionId) return
  const { method, params } = message
  if (method === 'Log.entryAdded' && ['security', 'javascript'].includes(params.entry.source)) consoleErrors.push(`${params.entry.source}: ${params.entry.text}`)
  if (method === 'Runtime.exceptionThrown') consoleErrors.push(`exception: ${params.exceptionDetails.text} ${params.exceptionDetails.exception?.description ?? ''}`)
  if (method === 'Network.requestWillBeSent' && new URL(params.request.url).pathname.startsWith('/v1/')) {
    v1Requests.push({ requestId: params.requestId, url: new URL(params.request.url), headers: params.request.headers })
  }
  if (method === 'Network.requestWillBeSentExtraInfo') extraInfo.set(params.requestId, params.headers)
})

/** Evaluates an expression in the page; an async arrow is awaited. */
const evaluate = async (expression) => {
  const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (exceptionDetails) throw new Error(`page error: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`)
  return result.value
}

/** Polls an expression until it is truthy; throws when it is not within the timeout. */
const waitFor = async (expression, timeoutMs = 8000) => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    let value
    try {
      value = await evaluate(expression)
    } catch {
      value = undefined
    }
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${expression}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** Opens a URL and waits for the document to finish loading; clears what was recorded before. */
const goto = async (url) => {
  consoleErrors = []
  v1Requests = []
  extraInfo.clear()
  // A marker on the old document tells a finished navigation from a document that is still the previous one.
  await evaluate('window.__stale = true').catch(() => {})
  await page('Page.navigate', { url })
  await waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && !window.__stale`)
}

/** Rows of the list as arrays of cell texts. */
const rowTexts = () => evaluate(`[...document.querySelectorAll('#notas-body tr')].map((tr) => [...tr.children].map((td) => td.textContent))`)

/** Sets the viewport: a phone (mobile) or a desktop window. */
const viewport = (width, mobile) => page('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile })

/** Saves a screenshot of the page when PANEL_SMOKE_SHOTS names a directory. */
const shot = async (name) => {
  const dir = process.env.PANEL_SMOKE_SHOTS
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  const { data } = await page('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(dir, name), Buffer.from(data, 'base64'))
}

const results = []
const check = async (name, fn) => {
  try {
    await fn()
    console.log(`ok ${name}`)
    results.push(true)
  } catch (error) {
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : error}`)
    results.push(false)
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

// (f) Checks.
await check('list-renders', async () => {
  await goto(`${main.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  const rows = await rowTexts()
  assert(rows.length === 20, `expected 20 rows, got ${rows.length}`)
  const numbers = rows.map((cells) => Number(/\d+/.exec(cells[3])?.[0]))
  assert(numbers.every((n, i) => n === 100 - i), `rows are not newest first: ${numbers.join(',')}`)
  for (const [i, cells] of rows.entries()) {
    assert(/^\d{2}\/\d{2}\/\d{4}$/.test(cells[0] ?? ''), `row ${i}: date "${cells[0]}" is not dd/mm/aaaa`)
    assert(new RegExp(`^R\\$${NBSP}\\d`).test(cells[2] ?? ''), `row ${i}: value "${cells[2]}" is not R$ + NBSP + digits`)
    assert(/^(NFS-e|DPS) \d+$/.test(cells[3] ?? ''), `row ${i}: number "${cells[3]}"`)
    assert(LABELS.includes(cells[4] ?? ''), `row ${i}: status "${cells[4]}" is not one of the six labels`)
  }
  assert(rows[5]?.[0] === '19/11/2026', `the 02:30Z nota shows "${rows[5]?.[0]}", expected 19/11/2026`)
  assert(rows[6]?.[1]?.includes(HOSTILE), `the hostile name is not visible as text: "${rows[6]?.[1]}"`)
  assert((await evaluate(`document.querySelectorAll('#notas-body img, #notas img').length`)) === 0, 'an img element exists in the table')
  assert((await evaluate('document.title')) === TITLE, `document.title changed to "${await evaluate('document.title')}"`)
  const listRequests = v1Requests.filter((r) => r.url.pathname === '/v1/notas')
  assert(listRequests.length === 1, `expected 1 GET /v1/notas, saw ${listRequests.length}`)
  const [request] = listRequests
  assert(request?.url.searchParams.get('limit') === '20', `limit is "${request?.url.searchParams.get('limit')}"`)
  assert(!Object.keys(request?.headers ?? {}).some((name) => name.toLowerCase() === 'authorization'), 'the request carries an Authorization header')
  for (let wait = 0; wait < 40 && !extraInfo.has(request?.requestId ?? ''); wait++) await new Promise((resolve) => setTimeout(resolve, 50))
  const extra = extraInfo.get(request?.requestId ?? '') ?? {}
  assert(/nfse_admin=/.test(Object.entries(extra).find(([name]) => name.toLowerCase() === 'cookie')?.[1] ?? ''), 'the request does not carry the session cookie')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('list-status-emphasis', async () => {
  await viewport(1280, false)
  await goto(`${main.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  const found = await evaluate(`(() => {
    const weight = (el) => Number(getComputedStyle(el).fontWeight)
    const alerts = [...document.querySelectorAll('#notas-body td [data-status="rejected"], #notas-body td [data-status="unknown"]')]
    const issued = document.querySelector('#notas-body td span[data-status="issued"]')
    const accent = document.querySelector('#notas-body tr[data-status="rejected"] > td:first-child')
    return { alerts: alerts.map(weight), issued: issued ? weight(issued) : null, shadow: accent ? getComputedStyle(accent).boxShadow : null }
  })()`)
  assert(found.alerts.length > 0, 'no rejected or unknown status label in the list')
  assert(found.alerts.every((w) => w >= 600), `alert labels have weights ${found.alerts.join(',')}, expected >= 600`)
  assert(found.issued !== null && found.issued < 600, `issued label weight is ${found.issued}, expected below 600`)
  assert(found.shadow !== null && found.shadow !== 'none', `the rejected row has no left accent (box-shadow ${found.shadow})`)
  await shot('list-wide.png')
})

await check('list-cards-narrow', async () => {
  await viewport(375, true)
  await goto(`${main.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  const narrow = await evaluate(`(() => {
    const row = document.querySelector('#notas-body tr')
    const cells = [...row.children].filter((td) => td.textContent !== '')
    return {
      display: getComputedStyle(row).display,
      headHeight: document.querySelector('#notas thead').getBoundingClientRect().height,
      labels: cells.map((td) => [getComputedStyle(td, '::before').content, '"' + td.dataset.label + '"']),
      scrollWidth: document.documentElement.scrollWidth,
    }
  })()`)
  assert(narrow.display === 'block', `row display is ${narrow.display} at 375 px, expected block`)
  assert(narrow.headHeight <= 1, `the table head is ${narrow.headHeight}px high, expected at most 1`)
  assert(narrow.labels.length >= 5, `only ${narrow.labels.length} non-empty cells`)
  for (const [content, label] of narrow.labels) assert(content === label, `cell label is ${content}, expected ${label}`)
  assert(narrow.scrollWidth <= 375, `the page scrolls sideways: scrollWidth ${narrow.scrollWidth} at 375 px`)
  await shot('list-narrow.png')
  await viewport(1280, false)
  await goto(`${main.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  const wide = await evaluate(`getComputedStyle(document.querySelector('#notas-body tr')).display`)
  assert(wide === 'table-row', `row display is ${wide} at 1280 px, expected table-row`)
})

await check('list-empty', async () => {
  await goto(`${empty.origin}/admin`)
  await waitFor(`document.getElementById('notas-state').textContent === 'Nenhuma nota encontrada.'`)
  const rows = await evaluate(`document.querySelectorAll('#notas-body tr').length`)
  assert(rows === 0, `${rows} rows in an empty list`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('list-error', async () => {
  await goto(`${failing.origin}/admin`)
  await waitFor(`document.getElementById('notas-state').textContent === 'Não foi possível carregar as notas. Tente de novo.'`)
  const rows = await evaluate(`document.querySelectorAll('#notas-body tr').length`)
  assert(rows === 0, `${rows} rows after a failed load`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

const passed = results.filter(Boolean).length
const failed = results.length - passed
console.log(`panel-smoke: ${passed} passed, ${failed} failed`)
finish(failed === 0 && passed > 0 ? 0 : 1)
