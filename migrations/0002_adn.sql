-- The NFS-e the government's ADN distributes to this CNPJ: issued here or elsewhere, received as taker or as
-- intermediary. Filled by src/adn.ts from GET /contribuintes/DFe/{NSU}; only the fields the list needs, never the XML.
CREATE TABLE adn_nfse (
  access_key TEXT PRIMARY KEY,
  -- issuer, taker, intermediary, or other (the CNPJ matched none of the three).
  role TEXT NOT NULL,
  nfse_number TEXT,
  -- dhProc in UTC ISO, so it sorts with notas.created_at.
  issued_at TEXT NOT NULL,
  competence TEXT,
  issuer_tax_id TEXT,
  issuer_name TEXT,
  taker_tax_id TEXT,
  taker_name TEXT,
  value_cents INTEGER,
  service_code TEXT,
  description TEXT,
  -- chSubstda: the access key of the nota this one replaces.
  replaces_key TEXT,
  nsu INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX adn_nfse_issued ON adn_nfse (issued_at, access_key);
CREATE INDEX adn_nfse_replaces ON adn_nfse (replaces_key);

-- Registered events of any NFS-e (cancellation, substitution, confirmations...), one row per NSU. The status of a nota
-- is worked out from them when read, so it is right whatever order the documents arrive in.
CREATE TABLE adn_events (
  nsu INTEGER PRIMARY KEY,
  access_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX adn_events_key ON adn_events (access_key);

-- Where the distribution stopped (lastNsu) and how the last run went.
CREATE TABLE adn_sync (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- The merged list hides an ADN row when a local nota already holds its access key.
CREATE INDEX notas_access_key ON notas (json_extract(data, '$.accessKey'));
