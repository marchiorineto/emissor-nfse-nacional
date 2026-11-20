/** The settings of the server, read from the environment (the `.env` file in development; see `.env.example`). */
export interface Env {
  /** "restricted" (the government's test environment) or "production". */
  NFSE_ENVIRONMENT: string
  ISSUER_CNPJ: string
  ISSUER_CITY_CODE: string
  ISSUER_MUNICIPAL_SUBSCRIPTION: string
  ISSUER_SIMPLES_OPTION: string
  ISSUER_SIMPLES_APURATION: string
  ISSUER_SIMPLES_TOTAL_TAX_PERCENT: string
  DPS_SERIES: string
  /** Bearer token of the API; also the key of the public links' signatures. */
  API_TOKEN: string
  /** The A1 certificate (.pfx) in base64 and its password, written by `pnpm run certificate`. */
  CERT_PFX_B64: string
  CERT_PASSWORD: string
  /** Path of the SQLite database file. */
  DATABASE_PATH: string
  PORT: number
  /** Public address of the API (e.g. https://nfse.example.com), for the links; empty uses the request's own. */
  PUBLIC_URL: string
  /** Salted scrypt hash of the panel password, written by `pnpm run admin-password`; empty turns the panel off. */
  ADMIN_PASSWORD: string
}

export const envFrom = (vars: Record<string, string | undefined>): Env => ({
  NFSE_ENVIRONMENT: vars.NFSE_ENVIRONMENT ?? 'restricted',
  ISSUER_CNPJ: vars.ISSUER_CNPJ ?? '',
  ISSUER_CITY_CODE: vars.ISSUER_CITY_CODE ?? '',
  ISSUER_MUNICIPAL_SUBSCRIPTION: vars.ISSUER_MUNICIPAL_SUBSCRIPTION ?? '',
  ISSUER_SIMPLES_OPTION: vars.ISSUER_SIMPLES_OPTION ?? '',
  ISSUER_SIMPLES_APURATION: vars.ISSUER_SIMPLES_APURATION ?? '1',
  ISSUER_SIMPLES_TOTAL_TAX_PERCENT: vars.ISSUER_SIMPLES_TOTAL_TAX_PERCENT ?? '',
  DPS_SERIES: vars.DPS_SERIES ?? '1',
  API_TOKEN: vars.API_TOKEN ?? '',
  CERT_PFX_B64: vars.CERT_PFX_B64 ?? '',
  CERT_PASSWORD: vars.CERT_PASSWORD ?? '',
  DATABASE_PATH: vars.DATABASE_PATH || 'data/emissor-nfse.db',
  PORT: Number(vars.PORT) || 8080,
  PUBLIC_URL: (vars.PUBLIC_URL ?? '').replace(/\/+$/, ''),
  ADMIN_PASSWORD: (vars.ADMIN_PASSWORD ?? '').trim(),
})
