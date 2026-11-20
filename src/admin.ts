import { readFileSync } from 'node:fs'
import type { Context, Hono, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { html } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'
import type { Env } from './env.ts'
import { STATUS_ORDER, statusLabel } from './panel/format.js'
import { verifyPassword } from './password.ts'
import {
  clientIp,
  createLoginThrottle,
  csrfToken,
  isHttps,
  issueSession,
  readSession,
  SESSION_COOKIE,
  SESSION_SECONDS,
  timingSafeEqual,
} from './session.ts'

/**
 * Pico.css 2.1.1, classless build: it styles semantic elements and centers body > header, main and footer with side
 * gutters, so panel markup needs no class attributes (D-12). Pinned to an exact version and loaded with its Subresource
 * Integrity hash; nothing is vendored.
 */
export const PICO_CSS_URL = 'https://cdn.jsdelivr.net/npm/@picocss/pico@2.1.1/css/pico.classless.min.css'
export const PICO_CSS_INTEGRITY = 'sha384-NZhm4G1I7BpEGdjDKnzEfy3d78xvy7ECKUwwnKTYi036z42IyF056PbHfpQLIYgL'

/**
 * The panel's own few rules on top of Pico, served from this origin at /panel.css (inline styles stay blocked by the CSP).
 * A `main[data-card]` page (login and refusals) shows one narrow card centered on the screen instead of a page-wide form.
 */
export const PANEL_CSS = `main[data-card] {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding-block: 2rem;
}
main[data-card] > article {
  width: 100%;
  max-width: 24rem;
  margin: 0;
}
main[data-card] > article > header h1 {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}
main[data-card] > article > header p {
  margin: 0;
  color: var(--pico-muted-color);
}
main[data-card] form,
main[data-card] form > button:last-child,
main[data-card] > article > p:last-child {
  margin-bottom: 0;
}
#notas td {
  overflow-wrap: anywhere;
}
#notas-body td [data-status="rejected"],
#notas-body td [data-status="unknown"] {
  color: var(--pico-del-color);
  font-weight: 600;
}
#notas-body td [data-status="issued"] {
  color: var(--pico-ins-color);
}
#notas-body td [data-status="canceled"],
#notas-body td [data-status="replaced"],
#notas-body td [data-status="pending"] {
  color: var(--pico-muted-color);
}
#notas-body tr[data-status="rejected"] > td:first-child,
#notas-body tr[data-status="unknown"] > td:first-child {
  box-shadow: inset 0.25rem 0 0 var(--pico-del-color, currentColor);
}
#notas-body small {
  display: block;
  color: var(--pico-muted-color);
}
#notas-body [data-muted] {
  color: var(--pico-muted-color);
}
@media (max-width: 767px) {
  #notas table,
  #notas thead,
  #notas tbody,
  #notas tr,
  #notas th,
  #notas td {
    display: block;
  }
  #notas thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  #notas tbody tr {
    border: var(--pico-border-width) solid var(--pico-muted-border-color);
    border-radius: var(--pico-border-radius);
    margin-bottom: var(--pico-spacing);
    padding: var(--pico-spacing);
  }
  #notas td {
    border: 0;
    padding: 0.25rem 0;
  }
  #notas td::before {
    content: attr(data-label);
    display: block;
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--pico-muted-color);
  }
  #notas td:empty {
    display: none;
  }
  #notas-body tr[data-status="rejected"],
  #notas-body tr[data-status="unknown"] {
    border-left: 0.25rem solid var(--pico-del-color, currentColor);
  }
  #notas-body tr[data-status="rejected"] > td:first-child,
  #notas-body tr[data-status="unknown"] > td:first-child {
    box-shadow: none;
  }
}
`

/**
 * The Content-Security-Policy of every panel page: styles only from jsDelivr (Pico) and this origin (/panel.css), scripts
 * only from this origin (the panel modules under /admin/), fetch only to this origin (the panel reads /v1 with the session
 * cookie), images from this origin plus data: (Pico embeds data: SVG icons), forms posting only here, no framing, no base
 * tag (D-12).
 */
export const PAGE_CSP =
  "default-src 'none'; style-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; connect-src 'self'"

/**
 * The panel's browser modules: plain ES modules with no build step, read once at startup (a missing file fails the start,
 * not a request) and served from /admin/ behind the session guard. Only these names are served; nothing else under src/ is.
 */
export const PANEL_SCRIPTS: ReadonlyMap<string, string> = new Map(
  ['panel.js', 'format.js'].map((name) => [name, readFileSync(new URL(`./panel/${name}`, import.meta.url), 'utf8')]),
)

export interface AdminDeps {
  env: Env
  /** Signs sessions and CSRF tokens; see `sessionKey`. */
  key: Buffer
  /** Clock in milliseconds. */
  now: () => number
}

/** NN.NNN.NNN/NNNN-NN for 14 digits, otherwise the value as given. */
export const formatCnpj = (cnpj: string): string => cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

/** The environment as the badge shows it. */
export const environmentLabel = (environment: string): string =>
  environment === 'restricted' ? 'Homologação (produção restrita)' : environment === 'production' ? 'Produção' : environment

type Html = HtmlEscapedString | Promise<HtmlEscapedString>

/** The page shell: semantic markup only, no classes; a script only when the page content brings one (/admin). `html` escapes every interpolated value. */
const layout = (title: string, content: Html, csrf?: string): Html => html`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${title}</title>
    <link rel="stylesheet" href="${PICO_CSS_URL}" integrity="${PICO_CSS_INTEGRITY}" crossorigin="anonymous">
    <link rel="stylesheet" href="/panel.css">
    ${csrf ? html`<meta name="csrf-token" content="${csrf}">` : ''}
  </head>
  <body>
    ${content}
  </body>
</html>`

/**
 * The login form; the password field never carries a value, so it always comes back empty. With an error the field points
 * at it through aria-describedby, and `invalid` also marks the field aria-invalid, which Pico paints red together with the
 * small that follows it (the 429 notice is not about the password, so it leaves `invalid` off).
 */
const loginPage = (error?: string, invalid = false): Html =>
  layout(
    'Entrar – Emissor de NFS-e',
    html`<main data-card>
      <article>
        <header>
          <h1>Emissor de NFS-e</h1>
          <p>Painel administrativo</p>
        </header>
        <form method="post" action="/login">
          <label for="password">Senha</label>
          <input type="password" id="password" name="password" autocomplete="current-password" required autofocus${error ? html` aria-describedby="login-error"` : ''}${error && invalid ? html` aria-invalid="true"` : ''}>
          ${error ? html`<small id="login-error" role="alert">${error}</small>` : ''}
          <button type="submit">Entrar</button>
        </form>
      </article>
    </main>`,
  )

/** The environment badge: produção is strong on the dark mark, anything else on the light mark, so the two always differ. */
const environmentBadge = (environment: string): Html =>
  environment === 'production'
    ? html`<strong><mark data-theme="dark">${environmentLabel(environment)}</mark></strong>`
    : html`<mark data-theme="light">${environmentLabel(environment)}</mark>`

/**
 * The panel skeleton: a nav header with issuer and environment badge on the left and logout on the right, then the notas list: a
 * status line and a table that the /admin/panel.js module fills. The Sair button has no type attribute on purpose: inside a form it submits anyway, and leaving it off
 * keeps Pico's full-width and bottom-margin rules for typed submit buttons away, so it takes its content width in the nav.
 */
const adminPage = (cnpj: string, environment: string, csrf: string): Html =>
  layout(
    'Emissor de NFS-e',
    html`<header>
        <nav>
          <ul>
            <li>
              <hgroup>
                <h1>Emissor de NFS-e</h1>
                <p>CNPJ ${cnpj} ${environmentBadge(environment)}</p>
              </hgroup>
            </li>
          </ul>
          <ul>
            <li>
              <form method="post" action="/logout">
                <input type="hidden" name="csrf" value="${csrf}">
                <button>Sair</button>
              </form>
            </li>
          </ul>
        </nav>
      </header>
      <main id="notas">
        <noscript><p>O painel precisa de JavaScript para mostrar as notas.</p></noscript>
        <h2>Notas</h2>
        <label for="status">Situação</label>
        <select id="status" name="status">
          <option value="">Todas</option>
          ${STATUS_ORDER.map((status) => html`<option value="${status}">${statusLabel(status)}</option>`)}
        </select>
        <p id="notas-state" role="status"></p>
        <table role="table">
          <thead>
            <tr role="row">
              <th scope="col" role="columnheader">Competência</th>
              <th scope="col" role="columnheader">Cliente</th>
              <th scope="col" role="columnheader">Valor</th>
              <th scope="col" role="columnheader">Número</th>
              <th scope="col" role="columnheader">Situação</th>
              <th scope="col" role="columnheader">PDF</th>
            </tr>
          </thead>
          <tbody id="notas-body"></tbody>
        </table>
        <button type="button" id="more" hidden>Carregar mais</button>
      </main>
      <script type="module" src="/admin/panel.js"></script>`,
    csrf,
  )

/** A refused request as a styled page with one link back. Only fixed strings reach it: no request header or body is echoed. */
const refusalPage = (heading: string, href: '/login' | '/admin', label: string): Html =>
  layout(
    `${heading} – Emissor de NFS-e`,
    html`<main data-card>
      <article>
        <header>
          <h1>${heading}</h1>
        </header>
        <p><a href="${href}">${label}</a></p>
      </article>
    </main>`,
  )

/**
 * Whether a login post comes from this site (D-17, a deliberate superset of what D-17 refuses). Sec-Fetch-Site decides when
 * the browser sends it; otherwise Origin must name this server, PUBLIC_URL or the proxy's forwarded origin, and the
 * literal `null` never passes; with neither header (curl, old browsers) the post proceeds. The headers are never echoed.
 */
const sameOriginLogin = (c: Context, publicUrl: string): boolean => {
  const site = c.req.header('sec-fetch-site')
  if (site !== undefined) return site === 'same-origin' || site === 'none'
  const origin = c.req.header('origin')
  if (origin === undefined) return true
  if (origin === 'null') return false
  const allowed = [new URL(c.req.url).origin]
  if (publicUrl) {
    try {
      allowed.push(new URL(publicUrl).origin)
    } catch {
      // An unparseable PUBLIC_URL contributes no allowed origin.
    }
  }
  const proto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim()
  const host = c.req.header('x-forwarded-host')?.split(',')[0]?.trim()
  if (proto && host) allowed.push(`${proto}://${host}`)
  return allowed.includes(origin)
}

/** Makes a panel response not cacheable, not frameable, not sniffed and free of referrers, redirects and refusals included. */
const pageHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
  c.header('Content-Security-Policy', PAGE_CSP)
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-Content-Type-Options', 'nosniff')
}

/** Registers the panel's routes. Called only when ADMIN_PASSWORD is set, so with the panel off they answer the plain 404. */
export const registerAdmin = (app: Hono, { env, key, now }: AdminDeps): void => {
  const sessionOf = (cookie: string | undefined) => readSession(key, cookie, now())
  const throttle = createLoginThrottle({ now })

  // Registered first, before the /admin guard, so redirects get the headers too.
  app.use('/login', pageHeaders)
  app.use('/logout', pageHeaders)
  app.use('/admin/*', pageHeaders)
  app.use('/panel.css', pageHeaders)

  app.get('/panel.css', (c) => c.body(PANEL_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8' }))

  app.get('/login', (c) => (sessionOf(getCookie(c, SESSION_COOKIE)) ? c.redirect('/admin', 303) : c.html(loginPage())))

  // Order: body limit, cross-site check, throttle, parse, verify. Refused posts run no scrypt and count as no failure.
  app.post('/login', bodyLimit({ maxSize: 4 * 1024, onError: (c) => c.html(refusalPage('Pedido grande demais', '/login', 'Voltar ao login'), 413) }), async (c) => {
    if (!sameOriginLogin(c, env.PUBLIC_URL)) return c.html(refusalPage('Pedido recusado', '/login', 'Voltar ao login'), 403)
    const ip = clientIp(c)
    const wait = throttle.begin(ip)
    if (wait > 0) {
      c.header('Retry-After', String(wait))
      return c.html(loginPage(`Muitas tentativas. Tente de novo em ${wait} s.`), 429)
    }
    let ok = false
    try {
      const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>)
      const password = typeof form.password === 'string' ? form.password : ''
      ok = await verifyPassword(password, env.ADMIN_PASSWORD)
      if (!ok) return c.html(loginPage('Senha incorreta.', true), 401)
    } finally {
      throttle.end(ip, ok)
    }
    const { value } = issueSession(key, now())
    setCookie(c, SESSION_COOKIE, value, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: SESSION_SECONDS,
      secure: isHttps(c.req.url, env.PUBLIC_URL, c.req.header('x-forwarded-proto')),
    })
    return c.redirect('/admin', 303)
  })

  // The same readSession decides here and in GET /login, so the two cannot disagree and loop.
  app.use('/admin/*', async (c, next) => {
    if (!sessionOf(getCookie(c, SESSION_COOKIE))) return c.redirect('/login', 303)
    await next()
  })

  // Logout only clears this browser's cookie: there is no revocation list, so a copied cookie stays valid until its
  // 12 h expiry, an accepted risk (D-04). There is no GET handler, so a GET does not log out (D-15).
  app.post('/logout', async (c) => {
    const clear = () => {
      deleteCookie(c, SESSION_COOKIE, { path: '/', secure: isHttps(c.req.url, env.PUBLIC_URL, c.req.header('x-forwarded-proto')) })
      return c.redirect('/login', 303)
    }
    const session = sessionOf(getCookie(c, SESSION_COOKIE))
    if (!session) return clear()
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>)
    const csrf = typeof form.csrf === 'string' ? form.csrf : ''
    if (!timingSafeEqual(csrf, csrfToken(key, session.id))) return c.html(refusalPage('Sessão expirada ou formulário inválido', '/admin', 'Voltar ao painel'), 403)
    return clear()
  })

  // After the guard above, so a script is served only to a session; the allow-list is PANEL_SCRIPTS.
  for (const [name, source] of PANEL_SCRIPTS) app.get(`/admin/${name}`, (c) => c.body(source, 200, { 'Content-Type': 'text/javascript; charset=utf-8' }))

  app.get('/admin', (c) => {
    const session = sessionOf(getCookie(c, SESSION_COOKIE))
    if (!session) return c.redirect('/login', 303)
    return c.html(adminPage(formatCnpj(env.ISSUER_CNPJ), env.NFSE_ENVIRONMENT, csrfToken(key, session.id)))
  })
}
