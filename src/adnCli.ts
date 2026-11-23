// `pnpm run adn-sync`: fills the ADN mirror in one go (the first load of a CNPJ's history), then exits. Safe to stop and
// run again: it resumes after the last NSU stored. The server's panel keeps the mirror up to date afterwards.
import { createAdnStore, createAdnSync } from './adn.ts'
import { configProblems } from './config.ts'
import { hosts, type Environment } from './dps.ts'
import { envFrom } from './env.ts'
import { createCertificateSource, createGov } from './gov.ts'
import { openDatabase } from './repo.ts'

const env = envFrom(process.env)
const problems = configProblems(env)
if (problems.length) {
  console.error(`adn-sync: fix the settings in .env: ${problems.join('; ')}`)
  process.exit(1)
}
const certificate = createCertificateSource(env)
const current = certificate()
if ('error' in current) {
  console.error(`adn-sync: certificate: ${current.error}`)
  process.exit(1)
}

const db = openDatabase(env.DATABASE_PATH)
const store = createAdnStore(db)
const sync = createAdnSync({
  store,
  gov: createGov(certificate),
  host: hosts[env.NFSE_ENVIRONMENT as Environment].adn,
  ownTaxId: env.ISSUER_CNPJ,
  cooldownMs: 0,
  forceCooldownMs: 0,
})

console.log(`adn-sync: ${env.NFSE_ENVIRONMENT}, CNPJ ${env.ISSUER_CNPJ}, starting after NSU ${store.state().lastNsu}`)
let total = 0
for (;;) {
  const result = await sync.run({ force: true, budgetMs: 60_000 })
  total += result.fetched
  console.log(`adn-sync: NSU ${result.lastNsu}, ${result.count} notas in the mirror, ${total} documents read`)
  if (result.error) {
    console.error(`adn-sync: stopped: ${result.error}`)
    db.close()
    process.exit(1)
  }
  if (result.caughtUp) break
}
console.log('adn-sync: up to date')
db.close()
