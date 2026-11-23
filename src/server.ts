// Entry point: `pnpm start`, which also loads .env (see package.json).
import { serve } from '@hono/node-server'
import { createAdnStore, createAdnSync } from './adn.ts'
import { adminPanelNotice, createApp } from './app.ts'
import { configProblems } from './config.ts'
import { hosts, type Environment } from './dps.ts'
import { envFrom } from './env.ts'
import { createCertificateSource, createGov } from './gov.ts'
import { createSqliteRepo, openDatabase } from './repo.ts'

const env = envFrom(process.env)
const db = openDatabase(env.DATABASE_PATH)
const certificate = createCertificateSource(env)
const gov = createGov(certificate)
const adnHost = hosts[env.NFSE_ENVIRONMENT as Environment]?.adn
const adnStore = createAdnStore(db)
const adn = adnHost
  ? { store: adnStore, sync: createAdnSync({ store: adnStore, gov, host: adnHost, ownTaxId: env.ISSUER_CNPJ, cooldownMs: env.ADN_SYNC_COOLDOWN_MINUTES * 60_000 }) }
  : undefined
const app = createApp({ env, repo: createSqliteRepo(db), gov, certificate, adn })

// The server starts even when something is missing, so GET /health can say what.
for (const problem of configProblems(env)) console.warn(`nfse: config: ${problem}`)
if (!env.API_TOKEN) console.warn('nfse: API_TOKEN is empty; every /v1 call will be refused')
const notice = adminPanelNotice(env)
if (notice.warn) console.warn(notice.message)
else console.log(notice.message)
const current = certificate()
console.log('error' in current ? `nfse: certificate: ${current.error}` : `nfse: certificate valid until ${current.notAfter}`)

const server = serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  console.log(`nfse: ${env.NFSE_ENVIRONMENT} API on http://localhost:${port}, database ${env.DATABASE_PATH}`)
})

const stop = () => {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
