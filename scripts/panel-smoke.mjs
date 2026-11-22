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

/**
 * Fixtures: 45 notas, index 0 the newest. The number shown on a row is 100 - index. The 20th and 21st newest (index 19 and 20)
 * share one createdAt, the case a page edge must not skip or repeat, and their ids sort so that index order is the list order
 * (id descending breaks the tie). Notas from index 26 on are all issued, so the issued filter spans two pages (24 notas).
 */
const fixtures = () =>
  Array.from({ length: 45 }, (_, i) => {
    const minute = i === 20 ? 40 : 59 - i
    const createdAt =
      i < 5 ? `2026-11-20T0${9 - i}:00:00.000Z` : i === 5 ? '2026-11-20T02:30:00.000Z' : `2026-11-20T01:${String(minute).padStart(2, '0')}:00.000Z`
    const status = i >= 26 ? 'issued' : ['issued', 'rejected', 'unknown', 'pending', 'canceled', 'replaced'][i % 6]
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
      id: `n${200 - i}`,
      status: i === 6 ? 'issued' : status,
      request: {
        id: `n${200 - i}`,
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

/**
 * Fixtures of the details dialog, served by their own app so the list fixtures above (and the paging maths built on them) stay
 * as they are: a rejected nota whose two errors include a hostile message, an issued nota with errors and cancelErrors, an
 * export nota that replaces another seeded nota, that replaced nota pointing back, a canceled nota and the two unanswered states.
 */
const detailFixtures = () => {
  const base = (id, index, status, extra = {}) => ({
    id,
    status,
    request: {
      id,
      serviceCode: '080201',
      nbsCode: '123012100',
      description: 'Aula de violão',
      valueCents: 123456,
      competence: '2026-11-19',
      taker: { name: 'Acme Ltda', taxId: '11222333000181', email: 'contato@acme.test', phone: '11999990000' },
      ...extra.request,
    },
    dpsNumber: 300 + index,
    dpsId: `DPS${300 + index}`,
    createdAt: `2026-11-20T0${index}:00:00.000Z`,
    updatedAt: `2026-11-20T0${index}:00:00.000Z`,
    ...(['issued', 'canceled', 'replaced'].includes(status) ? { accessKey: '4'.repeat(50), nfseNumber: String(300 + index), issuedAt: '2026-11-20T15:30:00Z' } : {}),
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'request')),
  })
  return [
    base('rej', 1, 'rejected', {
      errors: [
        { code: 'E0014', message: 'DPS duplicada', detail: 'Complemento do erro' },
        { code: 'HTTP 403', message: HOSTILE },
      ],
    }),
    base('both', 2, 'issued', {
      errors: [{ code: 'E0001', message: 'Primeira tentativa recusada' }],
      cancelErrors: [{ code: 'E0777', message: 'Cancelamento recusado', detail: 'Fora do prazo' }],
    }),
    base('exp', 3, 'issued', {
      request: {
        export: { resultCountry: 'US', currency: '220', foreignValueCents: 25000, mode: '1', relationship: '0', shareWithMdic: false },
        replaces: { id: 'old', reasonCode: '01' },
      },
    }),
    base('old', 4, 'replaced', { replacedBy: 'exp' }),
    base('can', 5, 'canceled', { canceledAt: '2026-11-21T15:30:00Z' }),
    base('pend', 6, 'pending'),
    base('unk', 7, 'unknown'),
    base('rej2xx', 8, 'rejected', { errors: [{ code: 'HTTP 200', message: '{"chaveAcesso":""}' }] }),
  ]
}

/**
 * A government stub that can actually answer, one scripted step at a time. `dps` and `events` are step queues the checks push
 * onto; an empty queue means the default ('issue' for a DPS, 'ok' for an event). A step is a name or { delayMs, then }, which
 * waits delayMs and then applies `then` (default the same default). `sent` and `eventsSent` hold every XML posted. The steps:
 * DPS 'issue' (a unique access key and NFS-e number), 'reject' (E0310 with a hostile complement), 'unreached';
 * event 'ok', 'refuse' (E1235 with a hostile complement), 'unreached'.
 */
const scriptedGov = () => {
  let counter = 0
  const dps = []
  const events = []
  const sent = []
  const eventsSent = []
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const take = async (queue, fallback) => {
    const step = queue.shift() ?? fallback
    if (typeof step === 'string') return step
    await wait(step.delayMs ?? 0)
    return step.then ?? fallback
  }
  const unreached = { reached: false, error: 'offline' }
  const gov = {
    sendDps: async (_host, xml) => {
      sent.push(xml)
      const step = await take(dps, 'issue')
      if (step === 'reject') {
        return { reached: true, status: 400, json: { erros: [{ Codigo: 'E0310', Descricao: 'Código de tributação nacional inexistente', Complemento: HOSTILE }] } }
      }
      if (step === 'unreached') return unreached
      counter += 1
      return {
        reached: true,
        status: 201,
        json: {
          chaveAcesso: String(counter).padStart(50, '0'),
          nfseXml: `<NFSe><infNFSe><nNFSe>${900 + counter}</nNFSe><dhProc>2026-11-21T10:00:00-03:00</dhProc></infNFSe></NFSe>`,
        },
      }
    },
    sendEvent: async (_host, _accessKey, xml) => {
      eventsSent.push(xml)
      const step = await take(events, 'ok')
      if (step === 'refuse') {
        return { reached: true, status: 400, json: { erros: [{ Codigo: 'E1235', Descricao: 'Cancelamento fora do prazo', Complemento: HOSTILE }] } }
      }
      if (step === 'unreached') return unreached
      return { reached: true, status: 201, json: { eventoXml: '<evento/>' } }
    },
    get: async (_host, path) => {
      if (path.startsWith('/danfse/')) return { reached: true, status: 200, json: { pdfB64: Buffer.from('%PDF-1.4 smoke').toString('base64') } }
      if (path.includes('/dps/')) return { reached: true, status: 404, json: {} }
      return unreached
    },
  }
  return { gov, dps, events, sent, eventsSent }
}

/**
 * Serves one app on a free 127.0.0.1 port; scenarios share the password hash, so one session cookie works on every port. `gov`
 * replaces the default stub (which never answers a DPS); `posts` records, on the server side, every non-GET request to /v1.
 */
const scenario = async ({ notas = [], failList = false, gov: given } = {}) => {
  const base = createSqliteRepo(openDatabase(':memory:'))
  for (const nota of notas) await base.save(nota)
  const repo = failList ? { ...base, list: async () => Promise.reject(new Error('boom')) } : base
  const unreached = { reached: false, error: 'offline' }
  const gov = given ?? {
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
  const posts = []
  const recording = async (request, ...rest) => {
    const { pathname } = new URL(request.url)
    if (request.method !== 'GET' && pathname.startsWith('/v1/')) {
      posts.push({ method: request.method, path: pathname, headers: Object.fromEntries(request.headers), body: await request.clone().text() })
    }
    return app.fetch(request, ...rest)
  }
  const server = serve({ fetch: recording, port: 0, hostname: '127.0.0.1' })
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  return { port: server.address().port, origin: `http://127.0.0.1:${server.address().port}`, repo, posts }
}

const main = await scenario({ notas: fixtures() })
const empty = await scenario()
// Exactly one full page of issued notas: the "Carregar mais" click that returns an empty page, and a filter without matches.
const exact = await scenario({
  notas: fixtures()
    .slice(0, 20)
    .map((nota) => ({ ...nota, status: 'issued', accessKey: '4'.repeat(50), nfseNumber: String(nota.dpsNumber) })),
})
const failing = await scenario({ notas: fixtures(), failList: true })
const detail = await scenario({ notas: detailFixtures() })
// The issue form: an empty repo and a government stub that issues, with the XML it was sent.
const issuingGov = scriptedGov()
const issuing = await scenario({ gov: issuingGov.gov })
// The cancel action: the list fixtures (every issued nota has an access key) and a government stub whose events the checks script.
const cancelingGov = scriptedGov()
const canceling = await scenario({ notas: fixtures(), gov: cancelingGov.gov })

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

// Downloads and tabs, recorded for the whole run: the row PDF link must save a file without opening a tab.
const downloads = []
const createdTargets = []
listeners.push((message) => {
  if (message.method === 'Browser.downloadWillBegin') downloads.push(message.params)
  if (message.method === 'Target.targetCreated') createdTargets.push(message.params.targetInfo)
})
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(profile, 'downloads'), eventsEnabled: true })
await send('Target.setDiscoverTargets', { discover: true })

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
const page = (method, params) => send(method, params, sessionId)
for (const domain of ['Network', 'Runtime', 'Log', 'Page']) await page(`${domain}.enable`)
await page('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*'] })
await page('Network.setCookie', { name: 'nfse_admin', value: cookie, url: `${main.origin}/`, httpOnly: true, sameSite: 'Strict' })

// (e) What the page logs and sends, reset on every navigation.
let consoleErrors = []
const everyConsoleError = []
let v1Requests = []
const extraInfo = new Map()
listeners.push((message) => {
  if (message.sessionId !== sessionId) return
  const { method, params } = message
  const record = (line) => {
    consoleErrors.push(line)
    everyConsoleError.push(line)
  }
  if (method === 'Log.entryAdded' && ['security', 'javascript'].includes(params.entry.source)) record(`${params.entry.source}: ${params.entry.text}`)
  if (method === 'Runtime.exceptionThrown') record(`exception: ${params.exceptionDetails.text} ${params.exceptionDetails.exception?.description ?? ''}`)
  if (method === 'Network.requestWillBeSent' && new URL(params.request.url).pathname.startsWith('/v1/')) {
    v1Requests.push({ requestId: params.requestId, method: params.request.method, url: new URL(params.request.url), headers: params.request.headers })
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
  // A URL that differs from the open document only by its hash is a same-document navigation: leave through about:blank so it is a real load.
  const current = await evaluate('location.href').catch(() => '')
  if (typeof current === 'string' && current.split('#')[0] === url.split('#')[0]) {
    await page('Page.navigate', { url: 'about:blank' })
    await waitFor(`location.href === 'about:blank'`)
  }
  consoleErrors = []
  v1Requests = []
  extraInfo.clear()
  // A marker on the old document tells a finished navigation from a document that is still the previous one.
  await evaluate('window.__stale = true').catch(() => {})
  await page('Page.navigate', { url })
  await waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && !window.__stale`)
}

/**
 * Like goto for a page that rewrites its own query string (emitir.js sets ?id=): the wait is the URL's pathname, a finished load
 * and no stale marker, not the exact href.
 */
const gotoRewritten = async (url) => {
  const target = new URL(url)
  const current = await evaluate('location.href').catch(() => '')
  if (typeof current === 'string' && current.split('#')[0] === url.split('#')[0]) {
    await page('Page.navigate', { url: 'about:blank' })
    await waitFor(`location.href === 'about:blank'`)
  }
  consoleErrors = []
  v1Requests = []
  extraInfo.clear()
  await evaluate('window.__stale = true').catch(() => {})
  await page('Page.navigate', { url })
  await waitFor(`location.origin === ${JSON.stringify(target.origin)} && location.pathname === ${JSON.stringify(target.pathname)} && document.readyState === 'complete' && !window.__stale`)
}

/** Sets the form fields by key (#field-<key>) and dispatches a bubbling input event on each, as typing does. */
const fill = (values) =>
  evaluate(`(() => {
    for (const [key, value] of Object.entries(${JSON.stringify(values)})) {
      const el = document.getElementById('field-' + key)
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })()`)

/** Today's date in Brasília as YYYY-MM-DD, computed in Node. */
const todayBrasilia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/** Reloads the open page and waits for the new document. */
const reload = async () => {
  await evaluate('window.__stale = true')
  await page('Page.reload')
  await waitFor(`document.readyState === 'complete' && !window.__stale`)
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
/** The value with every object's keys sorted, so two JSON texts compare regardless of key order. */
const sortKeys = (value) =>
  Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value

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

/** The data-status of every row shown. */
const rowStatuses = () => evaluate(`[...document.querySelectorAll('#notas-body tr')].map((tr) => tr.dataset.status)`)

/** Waits until at least one row is shown and every row has the given status. */
const waitForOnly = (status) =>
  waitFor(`(() => { const rows = [...document.querySelectorAll('#notas-body tr')]; return rows.length > 0 && rows.every((tr) => tr.dataset.status === ${JSON.stringify(status)}) })()`)

await check('filter-url', async () => {
  await viewport(1280, false)
  await goto(`${main.origin}/admin?status=rejected`)
  await waitForOnly('rejected')
  assert((await evaluate(`document.getElementById('status').value`)) === 'rejected', 'the select does not show rejected')
  const request = v1Requests.find((r) => r.url.pathname === '/v1/notas')
  assert(request?.url.searchParams.get('status') === 'rejected', `request status is "${request?.url.searchParams.get('status')}"`)
  assert(request?.url.searchParams.get('limit') === '20', `request limit is "${request?.url.searchParams.get('limit')}"`)
  await evaluate(`(() => { const select = document.getElementById('status'); select.value = 'issued'; select.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await waitFor(`location.search === '?status=issued'`)
  await waitForOnly('issued')
  await evaluate('history.back()')
  await waitFor(`location.search === '?status=rejected'`)
  await waitForOnly('rejected')
  assert((await evaluate(`document.getElementById('status').value`)) === 'rejected', 'Back left the select out of step with the URL')
  await evaluate('window.__stale = true')
  await page('Page.reload')
  await waitFor(`document.readyState === 'complete' && !window.__stale`)
  await waitForOnly('rejected')
  assert((await evaluate('location.search')) === '?status=rejected', 'a reload lost the filter')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('filter-invalid', async () => {
  await goto(`${main.origin}/admin?status=bogus`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length > 0`)
  assert((await evaluate(`document.getElementById('status').value`)) === '', 'the select does not show Todas for an unknown status')
  assert(new Set(await rowStatuses()).size >= 2, 'an unknown status did not behave as Todas')
  const request = v1Requests.find((r) => r.url.pathname === '/v1/notas')
  assert(request && !request.url.searchParams.has('status'), 'the request carries a status parameter')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('session-expired', async () => {
  try {
    await goto(`${main.origin}/admin`)
    await waitFor(`document.querySelectorAll('#notas-body tr').length > 0`)
    await page('Network.deleteCookies', { name: 'nfse_admin', url: `${main.origin}/` })
    await evaluate(`(() => { const select = document.getElementById('status'); select.value = 'issued'; select.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await waitFor(`location.pathname === '/login'`, 5000)
  } finally {
    await page('Network.setCookie', { name: 'nfse_admin', value: cookie, url: `${main.origin}/`, httpOnly: true, sameSite: 'Strict' })
  }
})

/** Clicks Carregar mais. */
const clickMore = () => evaluate(`document.getElementById('more').click()`)

/** The number each row shows, as a list of integers. */
const rowNumbers = async () => (await rowTexts()).map((cells) => Number(/\d+/.exec(cells[3])?.[0]))

await check('more-pages', async () => {
  const all = fixtures()
  const expected = all.map((_, i) => 100 - i)
  await goto(`${main.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  assert((await evaluate(`document.getElementById('more').hidden`)) === false, 'Carregar mais is hidden after a full first page')
  await clickMore()
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 40`)
  await clickMore()
  await waitFor(`document.querySelectorAll('#notas-body tr').length === ${all.length} && document.getElementById('more').hidden`)
  const numbers = await rowNumbers()
  assert(new Set(numbers).size === numbers.length, `a nota appears twice: ${numbers.join(',')}`)
  assert(numbers.join(',') === expected.join(','), `rows are not every nota once, newest first: ${numbers.join(',')}`)
  const lists = v1Requests.filter((r) => r.url.pathname === '/v1/notas')
  assert(lists.length === 3, `expected 3 list requests, saw ${lists.length}`)
  for (const [n, edge] of [[1, all[19]], [2, all[39]]]) {
    const { searchParams } = lists[n].url
    assert(searchParams.get('limit') === '20', `request ${n + 1}: limit is "${searchParams.get('limit')}"`)
    assert(searchParams.get('before') === edge.createdAt, `request ${n + 1}: before is "${searchParams.get('before')}", expected ${edge.createdAt}`)
    assert(searchParams.get('beforeId') === edge.id, `request ${n + 1}: beforeId is "${searchParams.get('beforeId')}", expected ${edge.id}`)
    assert(!searchParams.has('status'), `request ${n + 1} carries a status`)
  }
  assert(all[19].createdAt === all[20].createdAt, 'the fixtures lost the createdAt tie at the page edge')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)

  const issued = all.filter((nota) => nota.status === 'issued')
  await goto(`${main.origin}/admin?status=issued`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  await clickMore()
  await waitFor(`document.querySelectorAll('#notas-body tr').length === ${issued.length} && document.getElementById('more').hidden`)
  assert((await rowStatuses()).every((status) => status === 'issued'), 'an appended row is not issued')
  const issuedNumbers = await rowNumbers()
  assert(issuedNumbers.join(',') === issued.map((nota) => nota.dpsNumber).join(','), `issued rows: ${issuedNumbers.join(',')}`)
  const filtered = v1Requests.filter((r) => r.url.pathname === '/v1/notas')
  assert(filtered.length === 2 && filtered.every((r) => r.url.searchParams.get('status') === 'issued'), 'a page request lost the status filter')
  assert(filtered[1].url.searchParams.get('beforeId') === issued[19].id, `second page beforeId is "${filtered[1].url.searchParams.get('beforeId')}"`)
})

await check('more-exact-page', async () => {
  await goto(`${exact.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  assert((await evaluate(`document.getElementById('more').hidden`)) === false, 'Carregar mais is hidden after a full page')
  await clickMore()
  await waitFor(`document.getElementById('more').hidden`)
  const rows = await evaluate(`document.querySelectorAll('#notas-body tr').length`)
  assert(rows === 20, `${rows} rows after the empty page, expected 20`)
  const line = await evaluate(`document.getElementById('notas-state').textContent`)
  assert(line === '', `the status line says "${line}"`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('filter-empty', async () => {
  await goto(`${exact.origin}/admin?status=rejected`)
  await waitFor(`document.getElementById('notas-state').textContent === 'Nenhuma nota encontrada.'`)
  assert((await evaluate(`document.querySelectorAll('#notas-body tr').length`)) === 0, 'rows shown for a filter without matches')
  assert((await evaluate(`document.getElementById('more').hidden`)) === true, 'Carregar mais is visible for an empty list')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('pdf-row-download', async () => {
  await goto(`${main.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  const links = await evaluate(`[...document.querySelectorAll('#notas-body tr')].map((tr) => {
    const a = tr.querySelector('a[download]')
    return { status: tr.dataset.status, number: tr.children[3].textContent, href: a?.getAttribute('href') ?? null, download: a?.getAttribute('download') ?? null, label: a?.getAttribute('aria-label') ?? null }
  })`)
  for (const row of links) {
    if (['pending', 'rejected', 'unknown'].includes(row.status)) assert(row.href === null, `a ${row.status} row has a PDF link (${row.href})`)
    else {
      assert(/^\/v1\/notas\/[^/]+\/pdf\?download=1$/.test(row.href ?? ''), `${row.status} row ${row.number}: href is "${row.href}"`)
      assert(row.download === `nfse-${/\d+/.exec(row.number)?.[0]}.pdf`, `${row.number}: download is "${row.download}"`)
      assert(row.label === `Baixar PDF da ${row.number}`, `${row.number}: aria-label is "${row.label}"`)
    }
  }
  const issued = links.find((row) => row.status === 'issued' && row.href)
  assert(issued, 'no issued row with a PDF link')
  const before = { downloads: downloads.length, targets: createdTargets.length }
  await evaluate(`document.querySelector('#notas-body tr[data-status="issued"] a[download]').click()`)
  for (let wait = 0; wait < 100 && downloads.length === before.downloads; wait++) await new Promise((resolve) => setTimeout(resolve, 50))
  const started = downloads[before.downloads]
  const expected = `nfse-${/\d+/.exec(issued.number)?.[0]}.pdf`
  assert(started?.suggestedFilename === expected, `download starts as "${started?.suggestedFilename}", expected ${expected}`)
  assert((await evaluate('location.pathname')) === '/admin', 'the page left /admin')
  assert(createdTargets.length === before.targets, `a new target opened: ${createdTargets.slice(before.targets).map((t) => `${t.type} ${t.url}`).join(', ')}`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

/** Whether the nota dialog is open, and the title and status it shows. */
const dialogOpen = () => evaluate(`document.getElementById('nota-dialog').open`)
const dialogTitle = () => evaluate(`document.getElementById('nota-title').textContent`)

/** Opens the nota of the first row whose data-status matches (or the first row) through its Número link, as a click does. */
const openFromRow = async (status) => {
  await evaluate(`document.querySelector('#notas-body tr${status ? `[data-status="${status}"]` : ''} a:not([download])').click()`)
  await waitFor(`location.hash.startsWith('#nota=') && document.getElementById('nota-dialog').open`)
}

/** Presses and releases a key in the page. */
const pressKey = async (key, code, keyCode) => {
  for (const type of ['keyDown', 'keyUp']) await page('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode })
}

await check('dialog-deep-link', async () => {
  const all = fixtures()
  const rejected = all.find((nota) => nota.status === 'rejected')
  await viewport(1280, false)
  await goto(`${main.origin}/admin?status=rejected#nota=${encodeURIComponent(rejected.id)}`)
  await waitFor(`document.getElementById('nota-title').textContent === 'DPS ${rejected.dpsNumber}'`)
  assert(await dialogOpen(), 'the dialog is not open for a deep link')
  await waitForOnly('rejected')
  assert((await evaluate(`document.getElementById('status').value`)) === 'rejected', 'the select does not show rejected')
  const detail = v1Requests.filter((r) => r.url.pathname === `/v1/notas/${rejected.id}`)
  assert(detail.length === 1, `expected 1 request for the nota, saw ${detail.length}`)
  const oldest = all[all.length - 1]
  await goto(`${main.origin}/admin#nota=${encodeURIComponent(oldest.id)}`)
  await waitFor(`document.getElementById('nota-title').textContent === 'NFS-e ${oldest.nfseNumber}'`)
  assert(await dialogOpen(), 'the dialog is not open for a nota beyond the first page')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('dialog-close', async () => {
  await goto(`${main.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  await openFromRow()
  assert(await dialogOpen(), 'the dialog did not open from the row link')
  await evaluate(`document.querySelector('#nota-dialog footer form button').click()`)
  await waitFor(`!document.getElementById('nota-dialog').open && location.hash === ''`)
  assert(!(await evaluate('location.href')).endsWith('#'), 'closing left a bare # in the URL')
  await openFromRow()
  await pressKey('Escape', 'Escape', 27)
  await waitFor(`!document.getElementById('nota-dialog').open && location.hash === ''`)
  assert(!(await evaluate('location.href')).endsWith('#'), 'Esc left a bare # in the URL')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('dialog-back', async () => {
  await goto(`${main.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  await clickMore()
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 40`)
  const lists = () => v1Requests.filter((r) => r.url.pathname === '/v1/notas').length
  const before = lists()
  await openFromRow()
  await evaluate('history.back()')
  await waitFor(`!document.getElementById('nota-dialog').open && location.hash === ''`)
  const rows = await evaluate(`document.querySelectorAll('#notas-body tr').length`)
  assert(rows === 40, `${rows} rows after Back, expected 40`)
  assert(lists() === before, `Back sent ${lists() - before} new list request(s)`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('dialog-unknown', async () => {
  await goto(`${main.origin}/admin#nota=nao-existe`)
  await waitFor(`document.getElementById('nota-title').textContent === 'Nota não encontrada.'`)
  assert(await dialogOpen(), 'the dialog is not open for an unknown id')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

/** Opens a nota's dialog by deep link and waits until its title is not the loading text. */
const openDeepLink = async (id) => {
  await goto(`${detail.origin}/admin#nota=${encodeURIComponent(id)}`)
  await waitFor(`document.getElementById('nota-dialog').open && !/^Carregando/.test(document.getElementById('nota-title').textContent)`)
}

await check('dialog-sections', async () => {
  await viewport(1280, false)
  await openDeepLink('exp')
  const titles = await evaluate(`[...document.querySelectorAll('#nota-body h3')].map((h) => h.textContent)`)
  assert(titles.join(',') === 'Resumo,Tomador,Serviço,Documento,Exportação,Substituição', `sections are: ${titles.join(',')}`)
  const pairs = await evaluate(`[...document.querySelectorAll('#nota-body dl')].every((dl) => [...dl.children].every((el, i) => el.tagName === (i % 2 === 0 ? 'DT' : 'DD')))`)
  assert(pairs, 'a dl does not alternate dt and dd')
  const resumo = await evaluate(`[...document.querySelector('#nota-body dl').children].map((el) => el.textContent)`)
  for (const label of ['Situação', 'Número da NFS-e', 'Número da DPS', 'Valor', 'Criada em', 'Emitida em', 'Identificador']) assert(resumo.includes(label), `Resumo lacks ${label}`)
  assert((await evaluate(`document.querySelector('#nota-body a[href="#nota=old"]')?.textContent`)) === 'old', 'the Substitui link is missing')
  await evaluate(`document.querySelector('#nota-body a[href="#nota=old"]').click()`)
  await waitFor(`document.getElementById('nota-title').textContent === 'NFS-e 304'`)
  assert(await dialogOpen(), 'the dialog closed when following the Substitui link')
  assert((await evaluate('location.hash')) === '#nota=old', 'the hash did not follow the link')
  const back = await evaluate(`document.querySelector('#nota-body a[href="#nota=exp"]')?.textContent`)
  assert(back === 'exp', 'the replaced nota does not link back to its replacement')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('dialog-errors', async () => {
  await openDeepLink('both')
  const boxes = await evaluate(`[...document.querySelectorAll('#nota-body > section[data-errors]')].map((s) => s.querySelector('h3').textContent)`)
  assert(boxes.join('|') === 'Erros na emissão|Erros no cancelamento', `error boxes are: ${boxes.join('|')}`)
  const first = await evaluate(`[...document.getElementById('nota-body').children].slice(0, 2).map((el) => el.hasAttribute('data-errors'))`)
  assert(first.every(Boolean), 'the error boxes are not the first blocks of the dialog')
  await openDeepLink('rej')
  const text = await evaluate(`document.getElementById('nota-body').querySelector('section[data-errors]').textContent`)
  for (const part of ['E0014', 'DPS duplicada', 'Complemento do erro', 'HTTP 403', HOSTILE]) assert(text.includes(part), `the error box lacks "${part}"`)
  const items = await evaluate(`document.querySelectorAll('#nota-body section[data-errors] li').length`)
  assert(items === 2, `${items} error entries, expected 2`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('dialog-already-issued', async () => {
  await viewport(1280, false)
  await goto(`${detail.origin}/admin#nota=both&ja-emitida`)
  await waitFor(`document.getElementById('nota-dialog').open && !/^Carregando/.test(document.getElementById('nota-title').textContent)`)
  const first = await evaluate(`(() => { const el = document.getElementById('nota-body').firstElementChild; return { tag: el.tagName, role: el.getAttribute('role'), text: el.textContent } })()`)
  assert(first.tag === 'P' && first.role === 'note' && first.text === 'Esta nota já foi emitida com este id.', `the first block of the dialog is ${JSON.stringify(first)}`)
  assert((await evaluate(`document.getElementById('nota-title').textContent`)) === 'NFS-e 302', 'the dialog does not show the stored nota')
  await evaluate(`document.querySelector('#nota-dialog footer form button').click()`)
  await waitFor(`!document.getElementById('nota-dialog').open && location.hash === ''`)
  await goto(`${detail.origin}/admin#nota=both`)
  await waitFor(`document.getElementById('nota-dialog').open && !/^Carregando/.test(document.getElementById('nota-title').textContent)`)
  assert(!(await evaluate(`document.getElementById('nota-body').textContent`)).includes('Esta nota já foi emitida com este id.'), 'the notice shows without the flag')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('dialog-rejected-hint', async () => {
  const hint = 'O governo pode ter emitido esta nota'
  await openDeepLink('rej2xx')
  const found = await evaluate(`(() => {
    const body = document.getElementById('nota-body')
    const box = body.querySelector('section[data-errors]')
    const note = [...body.querySelectorAll('[role="note"]')].find((el) => el.textContent.includes(${JSON.stringify(hint)}))
    return { hasNote: Boolean(note), after: Boolean(note) && Boolean(box.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING) }
  })()`)
  assert(found.hasNote && found.after, `the hint is missing or not after the error box: ${JSON.stringify(found)}`)
  await openDeepLink('rej')
  assert(!(await evaluate(`document.getElementById('nota-body').textContent`)).includes(hint), 'the hint shows for a rejection without a 2xx code')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('dialog-hostile-text', async () => {
  await openDeepLink('rej')
  const shown = await evaluate(`document.getElementById('nota-dialog').innerText`)
  assert(shown.includes(HOSTILE), 'the hostile message is not visible as text')
  assert((await evaluate(`document.querySelectorAll('#nota-dialog img').length`)) === 0, 'an img element exists in the dialog')
  assert((await evaluate('document.title')) === TITLE, `document.title changed to "${await evaluate('document.title')}"`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('dialog-pdf', async () => {
  await openDeepLink('both')
  const link = await evaluate(`(() => { const a = document.querySelector('#nota-body a[download]'); return a && { href: a.getAttribute('href'), download: a.getAttribute('download') } })()`)
  assert(link?.href === '/v1/notas/both/pdf?download=1' && link.download === 'nfse-302.pdf', `PDF link is ${JSON.stringify(link)}`)
  const before = { downloads: downloads.length, targets: createdTargets.length }
  await evaluate(`document.querySelector('#nota-body a[download]').click()`)
  for (let wait = 0; wait < 100 && downloads.length === before.downloads; wait++) await new Promise((resolve) => setTimeout(resolve, 50))
  assert(downloads[before.downloads]?.suggestedFilename === 'nfse-302.pdf', `download starts as "${downloads[before.downloads]?.suggestedFilename}"`)
  assert(createdTargets.length === before.targets, 'a new target opened')
  assert(await dialogOpen(), 'the dialog closed after the download')

  await openDeepLink('can')
  const canceled = await evaluate(`document.getElementById('nota-body').textContent`)
  assert(canceled.includes('Este documento não é mais válido: a nota foi cancelada.'), 'the canceled nota lacks the no-longer-valid notice')
  assert((await evaluate(`document.querySelectorAll('#nota-body a[download]').length`)) === 1, 'the canceled nota lost its PDF link')
  const order = await evaluate(`(() => { const note = document.querySelector('#nota-body [role="note"]'); const a = document.querySelector('#nota-body a[download]'); return note.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING })()`)
  assert(order, 'the notice does not come before the PDF link')

  await openDeepLink('old')
  assert((await evaluate(`document.getElementById('nota-body').textContent`)).includes('Este documento não é mais válido: a nota foi substituída.'), 'the replaced nota lacks its notice')

  for (const id of ['pend', 'unk']) {
    await openDeepLink(id)
    const body = await evaluate(`document.getElementById('nota-body').textContent`)
    assert(body.includes('O governo não respondeu. A nota será verificada quando o sistema de origem reenviar este id.'), `${id}: the D-16a notice is missing`)
    assert((await evaluate(`document.querySelectorAll('#nota-body a[download]').length`)) === 0, `${id}: a PDF link is shown`)
    const buttons = await evaluate(`[...document.querySelectorAll('#nota-dialog button')].map((b) => b.textContent)`)
    assert(buttons.join(',') === 'Fechar', `${id}: buttons are ${buttons.join(',')}`)
    assert((await evaluate(`document.querySelectorAll('#nota-body a').length`)) === 0, `${id}: the dialog body offers links`)
  }
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('dialog-backdrop', async () => {
  await viewport(1280, false)
  await goto(`${main.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  await openFromRow()
  await waitFor(`!/^Carregando/.test(document.getElementById('nota-title').textContent)`)
  for (const type of ['mousePressed', 'mouseReleased']) await page('Input.dispatchMouseEvent', { type, x: 5, y: 5, button: 'left', clickCount: 1 })
  await waitFor(`!document.getElementById('nota-dialog').open && location.hash === ''`)
  assert(!(await evaluate('location.href')).endsWith('#'), 'a backdrop click left a bare # in the URL')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('dialog-scroll-lock', async () => {
  await goto(`${main.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  const overflow = () => evaluate(`getComputedStyle(document.documentElement).overflow`)
  assert((await overflow()) !== 'hidden', `the page is locked with no dialog open (overflow ${await overflow()})`)
  await openFromRow()
  assert((await overflow()) === 'hidden', `the page behind the dialog is not locked (overflow ${await overflow()})`)
  await evaluate(`document.querySelector('#nota-dialog footer form button').click()`)
  await waitFor(`!document.getElementById('nota-dialog').open`)
  assert((await overflow()) !== 'hidden', `the page stays locked after closing (overflow ${await overflow()})`)
})

await check('dialog-narrow', async () => {
  await viewport(1280, false)
  await openDeepLink('rej')
  await shot('dialog-wide.png')
  await viewport(375, true)
  await openDeepLink('exp')
  const narrow = await evaluate(`(() => {
    const article = document.querySelector('#nota-dialog article')
    return {
      page: document.documentElement.scrollWidth,
      scroll: article.scrollWidth,
      client: article.clientWidth,
      columns: getComputedStyle(document.querySelector('#nota-body dl')).gridTemplateColumns.trim().split(/\\s+/).length,
    }
  })()`)
  assert(narrow.page <= 375, `the page scrolls sideways: scrollWidth ${narrow.page} at 375 px`)
  assert(narrow.scroll <= narrow.client, `the dialog article overflows: scrollWidth ${narrow.scroll} > clientWidth ${narrow.client}`)
  assert(narrow.columns === 1, `the dl has ${narrow.columns} columns at 375 px, expected 1`)
  await openDeepLink('rej')
  await shot('dialog-narrow.png')
  await viewport(1280, false)
})

await check('emitir-issue', async () => {
  await viewport(1280, false)
  await goto(`${issuing.origin}/admin`)
  await waitFor(`document.getElementById('notas-state').textContent === 'Nenhuma nota encontrada.'`)
  await evaluate(`document.querySelector('a[href="/admin/emitir"]').click()`)
  await waitFor(`location.pathname === '/admin/emitir' && /^\\?id=painel-\\d{8}-[a-z0-9]{6}$/.test(location.search) && document.readyState === 'complete'`)
  const today = todayBrasilia()
  const first = await evaluate(`new URLSearchParams(location.search).get('id')`)
  assert(first.slice(7, 15) === today.replaceAll('-', ''), `the suggested id "${first}" does not carry today's Brasília date ${today}`)
  assert((await evaluate(`document.getElementById('field-id').value`)) === first, 'the id field differs from the URL id')
  assert((await evaluate(`document.getElementById('field-competence').value`)) === today, 'the competence does not start on today in Brasília')

  await reload()
  assert((await evaluate(`new URLSearchParams(location.search).get('id')`)) === first, 'a reload changed the id in the URL')
  assert((await evaluate(`document.getElementById('field-id').value`)) === first, 'a reload changed the id field')

  const typed = 'loja 7/venda #42?'
  await fill({ id: typed })
  assert((await evaluate(`new URLSearchParams(location.search).get('id')`)) === typed, 'editing the id field did not rewrite ?id=')
  await reload()
  assert((await evaluate(`new URLSearchParams(location.search).get('id')`)) === typed, 'a reload changed the typed id')
  assert((await evaluate(`document.getElementById('field-id').value`)) === typed, 'a reload changed the typed id in the field')
  await fill({ id: first })

  const csrf = await evaluate(`document.querySelector('meta[name="csrf-token"]').getAttribute('content')`)
  assert(typeof csrf === 'string' && csrf.length > 0, 'the page has no csrf-token meta')
  await fill({ taxId: '123.456.789-09', name: 'Maria Souza', serviceCode: '080201', description: 'Aula de violão', value: 'R$ 1.234,56' })
  await evaluate(`document.getElementById('emitir-submit').click()`)
  await waitFor(`location.pathname === '/admin' && location.hash === ${JSON.stringify(`#${new URLSearchParams({ nota: first })}`)}`)
  await waitFor(`document.getElementById('nota-dialog').open && /^NFS-e \\d+$/.test(document.getElementById('nota-title').textContent)`)
  assert((await evaluate(`document.getElementById('nota-status').textContent`)) === 'Emitida', 'the details do not show Emitida')

  assert(issuing.posts.length === 1, `expected 1 POST to /v1, saw ${issuing.posts.length}`)
  const [post] = issuing.posts
  assert(post.method === 'POST' && post.path === '/v1/notas', `the POST was ${post.method} ${post.path}`)
  assert(/nfse_admin=/.test(post.headers.cookie ?? ''), 'the POST does not carry the session cookie')
  assert(post.headers['x-csrf-token'] === csrf, `the POST x-csrf-token is "${post.headers['x-csrf-token']}", expected the meta value`)
  assert(post.headers['content-type'] === 'application/json', `the POST content-type is "${post.headers['content-type']}"`)
  assert(!('authorization' in post.headers), 'the POST carries an Authorization header')
  const expected = { id: first, competence: today, serviceCode: '080201', description: 'Aula de violão', valueCents: 123456, taker: { taxId: '12345678909', name: 'Maria Souza' } }
  assert(JSON.stringify(sortKeys(JSON.parse(post.body))) === JSON.stringify(sortKeys(expected)), `the POST body is ${post.body}`)
  assert(issuingGov.sent.length === 1, `the government was sent ${issuingGov.sent.length} DPS, expected 1`)

  await evaluate(`document.querySelector('#nota-dialog footer form button').click()`)
  await waitFor(`!document.getElementById('nota-dialog').open`)
  await evaluate(`document.querySelector('a[href="/admin/emitir"]').click()`)
  await waitFor(`location.pathname === '/admin/emitir' && /^\\?id=painel-/.test(location.search) && document.readyState === 'complete'`)
  const second = await evaluate(`new URLSearchParams(location.search).get('id')`)
  assert(second !== first, 'a second visit to Emitir nota reused the previous id')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

/** The value of every form control (#field-<key>) as an object keyed by id. */
const fieldValues = () =>
  evaluate(`Object.fromEntries([...document.querySelectorAll('[id^="field-"]')].filter((el) => /^field-[A-Za-z]+$/.test(el.id)).map((el) => [el.id, el.value]))`)

await check('emitir-rejected', async () => {
  await viewport(1280, false)
  const id = 'painel-20261121-rej001'
  const values = { taxId: '11222333000181', name: 'Acme Ltda', serviceCode: '080201', description: 'Aula de violão', value: '1.234,56' }
  issuingGov.dps.push('reject')
  await gotoRewritten(`${issuing.origin}/admin/emitir?id=${id}`)
  const title = await evaluate('document.title')
  await fill(values)
  const typed = await fieldValues()
  await evaluate(`document.getElementById('emitir-submit').click()`)
  await waitFor(`document.querySelector('#emitir-errors section[data-errors]')`)
  assert((await evaluate(`document.querySelector('#emitir-errors section[data-errors] h3').textContent`)) === 'Erros na emissão', 'the errors box is not headed Erros na emissão')
  const shown = await evaluate(`document.getElementById('emitir-errors').textContent`)
  for (const part of ['E0310', 'Código de tributação nacional inexistente', HOSTILE]) assert(shown.includes(part), `the errors box lacks "${part}"`)
  assert((await evaluate(`document.querySelectorAll('main img').length`)) === 0, 'an img element exists under main')
  assert((await evaluate('document.title')) === title, `document.title changed to "${await evaluate('document.title')}"`)
  const after = await fieldValues()
  assert(JSON.stringify(after) === JSON.stringify(typed), `the fields changed after the rejection: ${JSON.stringify(after)}`)
  assert((await evaluate('location.search')) === `?id=${id}`, `the URL is now ${await evaluate('location.search')}`)
  assert((await evaluate(`document.getElementById('emitir-submit').disabled`)) === false, 'the submit button stays disabled after the rejection')

  await fill({ description: 'Aula de violão (corrigida)' })
  await evaluate(`document.getElementById('emitir-submit').click()`)
  await waitFor(`location.pathname === '/admin' && location.hash === ${JSON.stringify(`#${new URLSearchParams({ nota: id })}`)}`)
  await waitFor(`document.getElementById('nota-dialog').open && /^NFS-e \\d+$/.test(document.getElementById('nota-title').textContent)`)
  assert((await evaluate(`document.getElementById('nota-status').textContent`)) === 'Emitida', 'the resent nota is not Emitida')
  const numbers = issuingGov.sent.slice(-2).map((xml) => /<nDPS>(\d+)<\/nDPS>/.exec(xml)?.[1])
  assert(numbers.length === 2 && numbers[0] !== undefined && numbers[0] === numbers[1], `the two DPS carry nDPS ${numbers.join(' and ')}`)
  assert(JSON.parse(issuing.posts[issuing.posts.length - 1].body).description === 'Aula de violão (corrigida)', 'the resent POST lacks the corrected description')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

/** A form every rule accepts, apart from the id. */
const VALID = { taxId: '11222333000181', name: 'Acme Ltda', serviceCode: '080201', description: 'Aula de violão', value: '1.234,56' }

/** The text of the small that follows a field, or null when the field has no error shown. */
const fieldError = (key) =>
  evaluate(`(() => {
    const el = document.getElementById('field-${key}')
    const small = el.nextElementSibling
    return el.getAttribute('aria-invalid') === 'true' && small?.tagName === 'SMALL' && small.id === 'field-${key}-error' ? small.textContent : null
  })()`)

/** Waits a moment, so a request the page should not have sent has time to show up on the server. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

await check('emitir-validation', async () => {
  await viewport(1280, false)
  await gotoRewritten(`${issuing.origin}/admin/emitir`)
  await evaluate(`localStorage.removeItem('nfse-painel:servico')`)
  await gotoRewritten(`${issuing.origin}/admin/emitir`)
  const before = issuing.posts.length
  await evaluate(`document.getElementById('emitir-submit').click()`)
  await waitFor(`document.getElementById('field-value').getAttribute('aria-invalid') === 'true'`)
  for (const key of ['serviceCode', 'description', 'value']) {
    const message = await fieldError(key)
    assert(message && /[a-zç]{4,}/i.test(message), `${key} shows no pt-BR error next to it ("${message}")`)
  }
  assert((await evaluate('document.activeElement.id')) === 'field-value', `the focus is on ${await evaluate('document.activeElement.id')}, expected the first invalid field (field-value)`)
  await settle()
  assert(issuing.posts.length === before, `an empty form sent ${issuing.posts.length - before} POST(s)`)

  const tomorrow = new Date(`${todayBrasilia()}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  await fill({ value: '1234.56', competence: tomorrow.toISOString().slice(0, 10), taxId: '12345678900', name: '', phone: '123', serviceCode: '080201', description: 'Aula' })
  await evaluate(`document.getElementById('emitir-submit').click()`)
  await waitFor(`document.getElementById('field-phone').getAttribute('aria-invalid') === 'true'`)
  for (const key of ['value', 'competence', 'taxId', 'name', 'phone']) assert(await fieldError(key), `${key} shows no error next to it`)
  for (const key of ['serviceCode', 'description']) assert((await fieldError(key)) === null, `${key} still shows an error after it was fixed`)
  await settle()
  assert(issuing.posts.length === before, `an invalid form sent ${issuing.posts.length - before} POST(s)`)
  await fill({ value: '1.234,56' })
  assert((await fieldError('value')) === null && (await evaluate(`document.getElementById('field-value-error')`)) === null, 'typing in the value did not remove its error')
  assert((await fieldError('taxId')) !== null, 'typing in the value removed the taxId error')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('emitir-answers', async () => {
  const id = 'painel-20261121-ans001'
  await gotoRewritten(`${issuing.origin}/admin/emitir?id=${id}`)
  await fill(VALID)
  const answer = (status, body, raw) =>
    `() => Promise.resolve(new Response(${raw ? JSON.stringify(raw) : `JSON.stringify(${JSON.stringify(body)})`}, { status: ${status}, headers: { 'content-type': 'application/json' } }))`
  const lost = 'Não foi possível confirmar o resultado. Envie de novo: o mesmo identificador não gera uma segunda nota.'
  const typed = await fieldValues()
  const submitWith = async (impl) => {
    await evaluate(`window.fetch = ${impl}`)
    await evaluate(`document.getElementById('emitir-submit').click()`)
    await waitFor(`!document.getElementById('emitir-submit').disabled && document.getElementById('emitir-state').textContent !== 'Enviando a nota…'`)
    assert(JSON.stringify(await fieldValues()) === JSON.stringify(typed), 'the fields changed after the answer')
    assert((await evaluate('location.search')) === `?id=${id}`, `the URL is now ${await evaluate('location.search')}`)
    assert((await evaluate(`document.getElementById('emitir-submit').disabled`)) === false, 'the submit button stays disabled')
    return evaluate(`document.getElementById('emitir-state').textContent`)
  }
  const before = issuing.posts.length
  try {
    const original = `window.__fetch = window.__fetch || window.fetch`
    await evaluate(original)
    const taxIdSaid = await submitWith(answer(400, { error: 'taker.taxId: a CPF or CNPJ (or taker.abroad for a taker outside Brazil)' }))
    assert(taxIdSaid === 'Confira os campos destacados.', `400 status line is "${taxIdSaid}"`)
    assert(/CPF/.test((await fieldError('taxId')) ?? ''), 'the 400 did not mark the taxId field with its pt-BR message')

    const unknown400 = await submitWith(answer(400, { error: 'something new' }))
    assert(unknown400 === 'A API recusou o pedido: something new', `an unknown 400 says "${unknown400}"`)

    const stale = await submitWith(answer(403, { error: 'invalid csrf token' }))
    assert(stale === 'A sessão mudou. Recarregue a página e envie de novo; o identificador continua o mesmo.', `403 says "${stale}"`)
    assert((await evaluate(`[...document.querySelectorAll('#emitir-errors button')].map((b) => b.textContent).join()`)) === 'Recarregar', 'the 403 offers no Recarregar button')

    assert((await submitWith(`() => Promise.reject(new TypeError('Failed to fetch'))`)) === lost, 'a network failure does not say the result is unknown')
    assert((await submitWith(answer(502, null, '<html>bad gateway</html>'))) === lost, 'a 502 with an HTML body does not say the result is unknown')
    assert((await submitWith(answer(500, { error: 'internal error' }))) === lost, 'a 500 does not say the result is unknown')
  } finally {
    await evaluate(`window.fetch = window.__fetch`)
  }
  await settle()
  assert(issuing.posts.length === before, 'the scripted answers reached the server')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('emitir-session-expired', async () => {
  try {
    await gotoRewritten(`${issuing.origin}/admin/emitir?id=painel-20261121-exp001`)
    await fill(VALID)
    await page('Network.deleteCookies', { name: 'nfse_admin', url: `${main.origin}/` })
    await evaluate(`document.getElementById('emitir-submit').click()`)
    await waitFor(`location.pathname === '/login'`, 5000)
  } finally {
    await page('Network.setCookie', { name: 'nfse_admin', value: cookie, url: `${main.origin}/`, httpOnly: true, sameSite: 'Strict' })
  }
})

await check('emitir-double-click', async () => {
  const id = 'painel-20261121-dbl001'
  await gotoRewritten(`${issuing.origin}/admin/emitir?id=${id}`)
  await fill(VALID)
  const before = { posts: issuing.posts.length, sent: issuingGov.sent.length }
  issuingGov.dps.push({ delayMs: 800 })
  await evaluate(`(() => { const button = document.getElementById('emitir-submit'); button.click(); button.click() })()`)
  assert((await evaluate(`document.getElementById('emitir-submit').disabled`)) === true, 'the submit button is not disabled while sending')
  assert((await evaluate(`document.getElementById('emitir-form').getAttribute('aria-busy')`)) === 'true', 'the form is not aria-busy while sending')
  await waitFor(`location.pathname === '/admin' && location.hash === ${JSON.stringify(`#${new URLSearchParams({ nota: id })}`)}`)
  assert(issuing.posts.length === before.posts + 1, `two clicks recorded ${issuing.posts.length - before.posts} POST(s), expected 1`)
  assert(issuingGov.sent.length === before.sent + 1, `two clicks sent ${issuingGov.sent.length - before.sent} DPS, expected 1`)
})

await check('emitir-two-tabs', async () => {
  await gotoRewritten(`${issuing.origin}/admin/emitir`)
  const before = issuingGov.sent.length
  issuingGov.dps.push({ delayMs: 800 })
  const answers = await evaluate(`(async () => {
    const csrf = document.querySelector('meta[name="csrf-token"]').getAttribute('content')
    const body = JSON.stringify({ id: 'painel-20261121-tab001', competence: ${JSON.stringify(todayBrasilia())}, serviceCode: '080201', description: 'Aula', valueCents: 1000 })
    const send = async () => {
      const res = await fetch('/v1/notas', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body })
      const nota = await res.json()
      return { status: res.status, dpsNumber: nota.dpsNumber, accessKey: nota.accessKey }
    }
    return Promise.all([send(), send()])
  })()`)
  assert(answers.every((a) => a.status === 200), `the two answers are ${answers.map((a) => a.status).join(' and ')}`)
  assert(answers[0].dpsNumber === answers[1].dpsNumber && answers[0].accessKey === answers[1].accessKey && answers[0].accessKey, `the two answers differ: ${JSON.stringify(answers)}`)
  assert(issuingGov.sent.length === before + 1, `the government received ${issuingGov.sent.length - before} DPS, expected 1`)
})

await check('emitir-resubmit', async () => {
  const id = 'painel-20261121-dup001'
  const hash = `#${new URLSearchParams({ nota: id })}`
  await gotoRewritten(`${issuing.origin}/admin/emitir?id=${id}`)
  await fill(VALID)
  await evaluate(`document.getElementById('emitir-submit').click()`)
  await waitFor(`location.pathname === '/admin' && location.hash === ${JSON.stringify(hash)}`)
  await waitFor(`document.getElementById('nota-dialog').open && /^NFS-e \\d+$/.test(document.getElementById('nota-title').textContent)`)
  // The Date header has a resolution of one second, so wait it out before the id is used again.
  await new Promise((resolve) => setTimeout(resolve, 1300))

  await gotoRewritten(`${issuing.origin}/admin/emitir?id=${id}`)
  await fill({ ...VALID, value: '9,99', nbsCode: '123012100' })
  const before = { posts: issuing.posts.length, sent: issuingGov.sent.length }
  await evaluate(`document.getElementById('emitir-submit').click()`)
  await waitFor(`location.pathname === '/admin' && location.hash === ${JSON.stringify(`${hash}&ja-emitida`)}`)
  await waitFor(`document.getElementById('nota-dialog').open && /^NFS-e \\d+$/.test(document.getElementById('nota-title').textContent)`)
  const first = await evaluate(`document.getElementById('nota-body').firstElementChild.textContent`)
  assert(first === 'Esta nota já foi emitida com este id.', `the first note reads "${first}"`)
  const valor = await evaluate(`[...document.querySelectorAll('#nota-body dt')].find((dt) => dt.textContent === 'Valor')?.nextElementSibling.textContent`)
  assert(/^R\$\s1\.234,56$/.test(valor ?? ''), `the dialog shows Valor "${valor}", expected the stored R$ 1.234,56`)
  assert(issuing.posts.length === before.posts + 1, `the second submit recorded ${issuing.posts.length - before.posts} POST(s), expected 1`)
  assert(issuingGov.sent.length === before.sent, `the government received ${issuingGov.sent.length - before.sent} new DPS`)
  const [firstRequest] = v1Requests
  assert(firstRequest?.method === 'POST' && firstRequest.url.pathname === '/v1/notas', `the first request of the page was ${firstRequest?.method} ${firstRequest?.url.pathname}`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('emitir-defaults', async () => {
  await gotoRewritten(`${issuing.origin}/admin/emitir`)
  const values = await fieldValues()
  assert(values['field-serviceCode'] === '080201' && values['field-nbsCode'] === '123012100' && values['field-description'] === 'Aula de violão', `the service fields are ${JSON.stringify(values)}`)
  for (const key of ['taxId', 'name', 'email', 'phone', 'value']) assert(values[`field-${key}`] === '', `field ${key} was remembered ("${values[`field-${key}`]}")`)
  const keys = await evaluate(`Object.keys(JSON.parse(localStorage.getItem('nfse-painel:servico'))).sort().join()`)
  assert(keys === 'description,nbsCode,serviceCode', `the remembered keys are ${keys}`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('emitir-narrow', async () => {
  await viewport(1280, false)
  issuingGov.dps.push('reject')
  await gotoRewritten(`${issuing.origin}/admin/emitir?id=painel-20261121-nar001`)
  await fill(VALID)
  await evaluate(`document.getElementById('emitir-submit').click()`)
  await waitFor(`document.querySelector('#emitir-errors section[data-errors]')`)
  await shot('emitir-wide.png')
  await viewport(375, true)
  const narrow = await evaluate(`(() => ({
    page: document.documentElement.scrollWidth,
    border: getComputedStyle(document.querySelector('#emitir-errors section[data-errors]')).borderLeftWidth,
  }))()`)
  assert(narrow.page <= 375, `the page scrolls sideways: scrollWidth ${narrow.page} at 375 px`)
  assert(narrow.border !== '0px', `the errors box has no left accent (border-left-width ${narrow.border})`)
  await shot('emitir-narrow.png')
  await viewport(1280, false)
})

/** The POSTs the server recorded for a scenario that went to a cancel route. */
const cancelPosts = (served) => served.posts.filter((post) => post.method === 'POST' && /^\/v1\/notas\/[^/]+\/cancel$/.test(post.path))

/** The list row of a nota, found by comparing dataset.id (never through a selector built from the id), as an expression. */
const rowOf = (id) => `[...document.querySelectorAll('#notas-body tr')].find((tr) => tr.dataset.id === ${JSON.stringify(id)})`

await check('cancel-row', async () => {
  await viewport(1280, false)
  await goto(`${canceling.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  await clickMore()
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 40`)
  const value = await evaluate(`${rowOf('n170')}.children[2].textContent`)
  const offered = await evaluate(`[...document.querySelectorAll('#notas-body tr')].map((tr) => [tr.dataset.status, Boolean(tr.querySelector('a[href$="&cancelar"]'))])`)
  for (const [status, link] of offered) assert(link === (status === 'issued'), `a ${status} row ${link ? 'has' : 'lacks'} the Cancelar link`)
  const header = await evaluate(`[...document.querySelectorAll('#notas thead th')].map((th) => th.textContent).pop()`)
  assert(header === 'Ações', `the last column is "${header}"`)

  const before = { posts: cancelPosts(canceling).length, events: cancelingGov.eventsSent.length }
  await evaluate(`${rowOf('n170')}.querySelector('a[href$="&cancelar"]').click()`)
  await waitFor(`document.getElementById('nota-dialog').open && document.querySelector('#nota-dialog section#cancel-form')`)
  assert((await evaluate('location.hash')) === '#nota=n170&cancelar', `the hash is ${await evaluate('location.hash')}`)
  const summary = await evaluate(`document.querySelector('#cancel-form p').textContent`)
  for (const part of ['NFS-e 70', 'Cliente 30', value]) assert(summary.includes(part), `the summary "${summary}" lacks "${part}"`)
  assert((await evaluate(`document.getElementById('cancel-code').value`)) === '2', 'the reason code does not start on 2')
  assert((await evaluate(`document.getElementById('cancel-reason').value`)) === 'Serviço não prestado; valor devolvido ao cliente', 'the reason text is not the code 2 suggestion')
  assert((await evaluate(`document.querySelectorAll('#nota-dialog form').length`)) === 1, 'the dialog has a form besides the Fechar one')
  assert(cancelPosts(canceling).length === before.posts, 'a cancel was sent before the confirmation')

  // A nota that cannot be canceled shows no Cancelar in the footer.
  await evaluate(`location.hash = '#nota=n197'`)
  await waitFor(`document.getElementById('nota-status').textContent === 'Pendente'`)
  assert((await evaluate(`document.getElementById('nota-actions').children.length`)) === 0, 'a pending nota has an action in the footer')
  await evaluate(`location.hash = '#nota=n170&cancelar'`)
  await waitFor(`document.querySelector('#nota-dialog section#cancel-form')`)
  assert(cancelPosts(canceling).length === before.posts, 'a cancel was sent before the confirmation')

  await evaluate(`document.getElementById('cancel-confirm').click()`)
  await waitFor(`document.getElementById('nota-status').textContent === 'Cancelada' && !document.getElementById('cancel-form')`)
  assert((await evaluate('location.hash')) === '#nota=n170', `the hash after the cancel is ${await evaluate('location.hash')}`)
  const row = await evaluate(`(() => { const tr = ${rowOf('n170')}; return { status: tr.dataset.status, label: tr.children[4].textContent, link: Boolean(tr.querySelector('a[href$="&cancelar"]')) } })()`)
  assert(row.status === 'canceled' && row.label === 'Cancelada' && !row.link, `the n170 row is ${JSON.stringify(row)}`)
  assert((await evaluate(`document.querySelectorAll('#notas-body tr').length`)) === 40, 'the list lost rows after the cancel')
  const sent = cancelPosts(canceling).slice(before.posts)
  assert(sent.length === 1 && sent[0].path === '/v1/notas/n170/cancel', `expected one POST to /v1/notas/n170/cancel, saw ${sent.map((post) => post.path).join()}`)
  assert((sent[0].headers['x-csrf-token'] ?? '') !== '', 'the cancel POST has no x-csrf-token')
  assert(JSON.stringify(sortKeys(JSON.parse(sent[0].body))) === JSON.stringify({ reason: 'Serviço não prestado; valor devolvido ao cliente', reasonCode: '2' }), `the cancel body is ${sent[0].body}`)
  assert(cancelingGov.eventsSent.length === before.events + 1, `the government received ${cancelingGov.eventsSent.length - before.events} event(s), expected 1`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

/** Opens a nota of the canceling scenario by deep link and waits until its dialog is filled. */
const openCancelable = async (id, flags = '') => {
  await goto(`${canceling.origin}/admin#nota=${encodeURIComponent(id)}${flags}`)
  await waitFor(`document.getElementById('nota-dialog').open && !/^Carregando/.test(document.getElementById('nota-title').textContent)`)
}

/** Picks a reason code in the cancel section the way a user does (change event), and types a reason (input event). */
const chooseCode = (code) => evaluate(`(() => { const el = document.getElementById('cancel-code'); el.value = ${JSON.stringify(code)}; el.dispatchEvent(new Event('change', { bubbles: true })) })()`)
const typeReason = (value) => evaluate(`(() => { const el = document.getElementById('cancel-reason'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
const reasonValue = () => evaluate(`document.getElementById('cancel-reason').value`)
const cancelState = () => evaluate(`document.getElementById('cancel-state')?.textContent ?? null`)
const dialogHash = () => evaluate('location.hash')

await check('cancel-nothing-sent', async () => {
  await viewport(1280, false)
  const before = { posts: canceling.posts.length, events: cancelingGov.eventsSent.length }
  await openCancelable('n174')
  assert((await evaluate(`document.querySelector('#cancel-form')`)) === null, 'the section shows without the flag')
  await evaluate(`document.querySelector('#nota-actions a').click()`)
  await waitFor(`document.querySelector('#nota-dialog section#cancel-form')`)
  assert((await dialogHash()).endsWith('&cancelar'), `the hash after the footer Cancelar is ${await dialogHash()}`)
  assert((await evaluate(`document.querySelectorAll('#nota-actions a').length`)) === 0, 'the footer still offers Cancelar while the section shows')
  await chooseCode('9')
  assert((await reasonValue()) === 'Cancelamento solicitado pelo emitente', `code 9 gives "${await reasonValue()}"`)
  await typeReason('Cliente desistiu da compra antes do curso')
  await chooseCode('1')
  assert((await reasonValue()) === 'Cliente desistiu da compra antes do curso', 'changing the code replaced the typed reason')
  await evaluate(`document.getElementById('cancel-back').click()`)
  await waitFor(`!document.getElementById('cancel-form')`)
  assert((await dialogHash()) === '#nota=n174', `Voltar left the hash ${await dialogHash()}`)
  assert(await dialogOpen(), 'Voltar closed the dialog')

  await evaluate(`document.querySelector('#nota-actions a').click()`)
  await waitFor(`document.querySelector('#nota-dialog section#cancel-form')`)
  assert((await reasonValue()) === 'Serviço não prestado; valor devolvido ao cliente', 'the section did not start fresh after Voltar')
  await typeReason('curto')
  await evaluate(`document.getElementById('cancel-confirm').click()`)
  await waitFor(`document.getElementById('cancel-state').textContent === 'O motivo deve ter de 15 a 255 caracteres.'`)
  assert((await evaluate(`document.getElementById('cancel-reason').getAttribute('aria-invalid')`)) === 'true', 'the reason is not marked invalid')
  await evaluate(`document.getElementById('cancel-reason').focus()`)
  await pressKey('Enter', 'Enter', 13)
  await pressKey('Escape', 'Escape', 27)
  await waitFor(`!document.getElementById('nota-dialog').open && location.hash === ''`)

  await openCancelable('n188', '&cancelar')
  assert((await evaluate(`Boolean(document.querySelector('#nota-dialog section#cancel-form'))`)) === true, 'the deep link with the flag does not show the section')
  await evaluate(`document.querySelector('#nota-dialog footer form button').click()`)
  await waitFor(`!document.getElementById('nota-dialog').open && location.hash === ''`)
  await openCancelable('n197', '&cancelar')
  assert((await evaluate(`document.querySelector('#nota-dialog section#cancel-form')`)) === null, 'a pending nota shows the cancel section')
  await settle()
  assert(canceling.posts.length === before.posts, `${canceling.posts.length - before.posts} request(s) were sent without a confirmation`)
  assert(cancelingGov.eventsSent.length === before.events, 'the government received an event without a confirmation')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('cancel-answers', async () => {
  await viewport(1280, false)
  const before = { posts: cancelPosts(canceling).length, events: cancelingGov.eventsSent.length }
  const typed = 'Motivo escrito pelo administrador'
  await openCancelable('n168', '&cancelar')
  await waitFor(`document.getElementById('cancel-form')`)
  const title = await evaluate('document.title')

  await typeReason(typed)
  cancelingGov.events.push('refuse')
  await evaluate(`document.getElementById('cancel-confirm').click()`)
  await waitFor(`document.querySelector('#nota-body section[data-errors]')`)
  assert((await evaluate(`document.querySelector('#nota-body section[data-errors] h3').textContent`)) === 'Erros no cancelamento', 'the errors box is not headed Erros no cancelamento')
  const shown = await evaluate(`document.querySelector('#nota-body section[data-errors]').textContent`)
  for (const part of ['E1235', 'Cancelamento fora do prazo', HOSTILE]) assert(shown.includes(part), `the cancel errors box lacks "${part}"`)
  assert((await evaluate(`document.querySelectorAll('#nota-dialog img').length`)) === 0, 'an img element exists in the dialog')
  assert((await evaluate('document.title')) === title, `document.title changed to "${await evaluate('document.title')}"`)
  assert((await evaluate(`document.getElementById('nota-status').textContent`)) === 'Emitida', 'the dialog does not stay Emitida after a refusal')
  assert((await evaluate(`Boolean(document.getElementById('cancel-form'))`)) === true, 'the section closed after a refusal')
  assert((await reasonValue()) === typed, 'the typed reason was lost after a refusal')
  assert((await evaluate(`document.getElementById('cancel-confirm').disabled`)) === false, 'the confirm button stays disabled after a refusal')

  cancelingGov.events.push('unreached')
  await evaluate(`document.getElementById('cancel-confirm').click()`)
  await waitFor(`document.getElementById('cancel-state').textContent === 'O governo não respondeu. Tente de novo em alguns instantes.'`)
  assert((await evaluate(`Boolean(document.getElementById('cancel-form'))`)) === true, 'the section closed after a 502')
  assert((await reasonValue()) === typed, 'the typed reason was lost after a 502')

  const stored = await canceling.repo.get('n168')
  await canceling.repo.save({ ...stored, status: 'replaced' })
  await evaluate(`document.getElementById('cancel-confirm').click()`)
  await waitFor(`document.getElementById('cancel-state').textContent === 'Esta nota não pode ser cancelada: a situação dela é Substituída.'`)
  assert((await evaluate(`document.getElementById('nota-status').textContent`)) === 'Emitida', 'the dialog changed after a 409')

  await openCancelable('n166', '&cancelar')
  await waitFor(`document.getElementById('cancel-form')`)
  const respond = (status, body) => `window.fetch = () => Promise.resolve(new Response(${JSON.stringify(JSON.stringify(body))}, { status: ${status}, headers: { 'content-type': 'application/json' } }))`
  try {
    await evaluate(`window.__fetch = window.__fetch || window.fetch`)
    await evaluate(respond(403, { error: 'invalid csrf token' }))
    await evaluate(`document.getElementById('cancel-confirm').click()`)
    await waitFor(`document.getElementById('cancel-state').textContent === 'A sessão mudou. Recarregue a página e tente de novo.'`)
    await evaluate(`window.fetch = () => Promise.reject(new TypeError('Failed to fetch'))`)
    await evaluate(`document.getElementById('cancel-confirm').click()`)
    await waitFor(`document.getElementById('cancel-state').textContent === 'Não foi possível confirmar o resultado. Tente de novo: pedir o cancelamento outra vez não causa problema.'`)
    assert((await evaluate(`document.getElementById('cancel-confirm').disabled`)) === false, 'the confirm button stays disabled after a lost answer')
  } finally {
    await evaluate(`window.fetch = window.__fetch`)
  }
  await evaluate(`document.getElementById('cancel-confirm').click()`)
  await waitFor(`document.getElementById('nota-status').textContent === 'Cancelada' && !document.getElementById('cancel-form')`)

  const sent = cancelPosts(canceling).slice(before.posts)
  assert(sent.map((post) => post.path).join() === '/v1/notas/n168/cancel,/v1/notas/n168/cancel,/v1/notas/n168/cancel,/v1/notas/n166/cancel', `the cancel POSTs were ${sent.map((post) => post.path).join()}`)
  assert(cancelingGov.eventsSent.length === before.events + 3, `the government received ${cancelingGov.eventsSent.length - before.events} event(s), expected 3`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('cancel-double-click', async () => {
  const before = { posts: cancelPosts(canceling).length, events: cancelingGov.eventsSent.length }
  await openCancelable('n164', '&cancelar')
  await waitFor(`document.getElementById('cancel-form')`)
  cancelingGov.events.push({ delayMs: 800 })
  const disabled = await evaluate(`(() => { const button = document.getElementById('cancel-confirm'); button.click(); button.click(); return button.disabled })()`)
  assert(disabled === true, 'the confirm button is not disabled while waiting')
  await waitFor(`document.getElementById('nota-status').textContent === 'Cancelada' && !document.getElementById('cancel-form')`)
  const sent = cancelPosts(canceling).slice(before.posts)
  assert(sent.length === 1 && sent[0].path === '/v1/notas/n164/cancel', `two clicks recorded ${sent.length} POST(s), expected 1`)
  assert(cancelingGov.eventsSent.length === before.events + 1, `two clicks sent ${cancelingGov.eventsSent.length - before.events} event(s), expected 1`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

/** The ids of the rows shown, in order. */
const rowIds = () => evaluate(`[...document.querySelectorAll('#notas-body tr')].map((tr) => tr.dataset.id)`)

await check('cancel-filtered', async () => {
  await viewport(1280, false)
  await goto(`${canceling.origin}/admin?status=issued`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  const before = await rowIds()
  const target = await evaluate(`[...document.querySelectorAll('#notas-body tr')].find((tr) => tr.querySelector('a[href$="&cancelar"]')).dataset.id`)
  await evaluate(`${rowOf(target)}.querySelector('a[href$="&cancelar"]').click()`)
  await waitFor(`document.querySelector('#nota-dialog section#cancel-form')`)
  await evaluate(`document.getElementById('cancel-confirm').click()`)
  await waitFor(`document.getElementById('nota-status').textContent === 'Cancelada' && !document.getElementById('cancel-form')`)
  const after = await rowIds()
  assert(after.length === before.length - 1, `the filtered list has ${after.length} rows after the cancel, expected ${before.length - 1}`)
  assert(!after.includes(target), `the canceled row ${target} is still in the issued list`)
  assert(after.join() === before.filter((id) => id !== target).join(), 'the other rows changed')
  assert((await evaluate(`document.getElementById('more').hidden`)) === false, 'Carregar mais disappeared although the list had a full page')
  await goto(`${canceling.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  const row = await evaluate(`(() => { const tr = ${rowOf(target)}; return tr ? { status: tr.dataset.status, label: tr.children[4].textContent } : null })()`)
  assert(row?.status === 'canceled' && row.label === 'Cancelada', `the unfiltered list shows ${JSON.stringify(row)} for ${target}`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('cancel-left-dialog', async () => {
  await viewport(1280, false)
  await goto(`${canceling.origin}/admin`)
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 20`)
  await clickMore()
  await waitFor(`document.querySelectorAll('#notas-body tr').length === 40`)
  assert((await evaluate(`${rowOf('n162')}.dataset.status`)) === 'issued', 'n162 is not issued before the cancel')
  cancelingGov.events.push({ delayMs: 800 })
  await evaluate(`${rowOf('n162')}.querySelector('a[href$="&cancelar"]').click()`)
  await waitFor(`document.querySelector('#nota-dialog section#cancel-form')`)
  await evaluate(`document.getElementById('cancel-confirm').click()`)
  await evaluate(`document.querySelector('#nota-dialog footer form button').click()`)
  await waitFor(`!document.getElementById('nota-dialog').open && location.hash === ''`)
  await waitFor(`${rowOf('n162')}.dataset.status === 'canceled'`)
  assert((await evaluate(`${rowOf('n162')}.children[4].textContent`)) === 'Cancelada', 'the row does not say Cancelada')
  assert(!(await dialogOpen()), 'the answer reopened the dialog')
  assert((await evaluate(`document.getElementById('nota-status').textContent`)) !== 'Cancelada', 'the late answer was drawn into the closed dialog')
  assert((await evaluate('location.hash')) === '', 'the late answer put a hash back in the URL')
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('cancel-backdrop-drag', async () => {
  await viewport(1280, false)
  await openCancelable('n160', '&cancelar')
  await waitFor(`document.getElementById('cancel-form')`)
  const typed = 'Motivo que o administrador acabou de escrever'
  await typeReason(typed)
  const point = await evaluate(`(() => { const el = document.getElementById('cancel-reason'); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
  const mouse = (type, x, y, buttons) => page('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 })
  await mouse('mousePressed', point.x, point.y, 1)
  await mouse('mouseMoved', 5, 5, 1)
  await mouse('mouseReleased', 5, 5, 0)
  await settle()
  assert(await dialogOpen(), 'a drag from the reason field to the backdrop closed the dialog')
  assert((await reasonValue()) === typed, 'the drag changed the typed reason')
  await mouse('mousePressed', 5, 5, 1)
  await mouse('mouseReleased', 5, 5, 0)
  await waitFor(`!document.getElementById('nota-dialog').open && location.hash === ''`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
})

await check('cancel-style', async () => {
  await viewport(1280, false)
  await openCancelable('n158', '&cancelar')
  await waitFor(`document.getElementById('cancel-form')`)
  const colors = await evaluate(`({ confirm: getComputedStyle(document.getElementById('cancel-confirm')).backgroundColor, back: getComputedStyle(document.getElementById('cancel-back')).backgroundColor })`)
  assert(!['transparent', 'rgba(0, 0, 0, 0)'].includes(colors.confirm), `the confirm button background is ${colors.confirm}`)
  assert(colors.confirm !== colors.back, `the confirm and Voltar buttons share the background ${colors.confirm}`)
  await shot('cancel-wide.png')
  await viewport(375, true)
  const narrow = await evaluate(`(() => { const article = document.querySelector('#nota-dialog article'); return { page: document.documentElement.scrollWidth, scroll: article.scrollWidth, client: article.clientWidth } })()`)
  assert(narrow.page <= 375, `the page scrolls sideways: scrollWidth ${narrow.page} at 375 px`)
  assert(narrow.scroll <= narrow.client, `the dialog article overflows: scrollWidth ${narrow.scroll} > clientWidth ${narrow.client}`)
  await shot('cancel-narrow.png')
  await viewport(1280, false)
})

await check('console-clean', async () => {
  assert(everyConsoleError.length === 0, `console errors during the run: ${everyConsoleError.join(' | ')}`)
})

const passed = results.filter(Boolean).length
const failed = results.length - passed
console.log(`panel-smoke: ${passed} passed, ${failed} failed`)
finish(failed === 0 && passed > 0 ? 0 : 1)
