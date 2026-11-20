import type { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { html } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'
import type { Env } from './env.ts'
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

/** Pico.css, pinned to an exact version and loaded with its Subresource Integrity hash (nothing is vendored). */
export const PICO_CSS_URL = 'https://cdn.jsdelivr.net/npm/@picocss/pico@2.1.1/css/pico.min.css'
export const PICO_CSS_INTEGRITY = 'sha384-L1dWfspMTHU/ApYnFiMz2QID/PlP1xCW9visvBdbEkOLkSSWsP6ZJWhPw6apiXxU'

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

/** The page shell: semantic markup only, no classes and no scripts. `html` escapes every interpolated value. */
const layout = (title: string, content: Html, csrf?: string): Html => html`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${title}</title>
    <link rel="stylesheet" href="${PICO_CSS_URL}" integrity="${PICO_CSS_INTEGRITY}" crossorigin="anonymous">
    ${csrf ? html`<meta name="csrf-token" content="${csrf}">` : ''}
  </head>
  <body>
    ${content}
  </body>
</html>`

/** The login form; the password field never carries a value, so it always comes back empty. */
const loginPage = (error?: string): Html =>
  layout(
    'Entrar - Emissor de NFS-e',
    html`<main>
      <h1>Painel do emissor</h1>
      <form method="post" action="/login">
        <label>Senha
          <input type="password" name="password" autocomplete="current-password" required autofocus>
        </label>
        ${error ? html`<p role="alert">${error}</p>` : ''}
        <button type="submit">Entrar</button>
      </form>
    </main>`,
  )

/** The panel skeleton: issuer, environment badge, logout form and an empty area for the notas list. */
const adminPage = (cnpj: string, environment: string, csrf: string): Html =>
  layout(
    'Emissor de NFS-e',
    html`<header>
        <h1>Emissor de NFS-e</h1>
        <p>${cnpj} <mark>${environment}</mark></p>
        <form method="post" action="/logout">
          <input type="hidden" name="csrf" value="${csrf}">
          <button type="submit">Sair</button>
        </form>
      </header>
      <main id="notas"></main>`,
    csrf,
  )

/** Registers the panel's routes. Called only when ADMIN_PASSWORD is set, so with the panel off they answer the plain 404. */
export const registerAdmin = (app: Hono, { env, key, now }: AdminDeps): void => {
  const sessionOf = (cookie: string | undefined) => readSession(key, cookie, now())
  const throttle = createLoginThrottle({ now })

  app.get('/login', (c) => (sessionOf(getCookie(c, SESSION_COOKIE)) ? c.redirect('/admin', 303) : c.html(loginPage())))

  app.post('/login', async (c) => {
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
      if (!ok) return c.html(loginPage('Senha incorreta.'), 401)
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
    if (!timingSafeEqual(csrf, csrfToken(key, session.id))) return c.text('Sessão expirada ou formulário inválido. Recarregue a página.', 403)
    return clear()
  })

  app.get('/admin', (c) => {
    const session = sessionOf(getCookie(c, SESSION_COOKIE))
    if (!session) return c.redirect('/login', 303)
    return c.html(adminPage(formatCnpj(env.ISSUER_CNPJ), environmentLabel(env.NFSE_ENVIRONMENT), csrfToken(key, session.id)))
  })
}
