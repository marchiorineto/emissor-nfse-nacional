import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Nota, Repo } from './notas.ts'

const DPS_COUNTER = 'dps'

/** Opens the database file (creating its folder) and applies the pending migrations. */
export const openDatabase = (path: string, migrationsDir = join(import.meta.dirname, '..', 'migrations')): DatabaseSync => {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  migrate(db, migrationsDir)
  return db
}

/**
 * Applies the `.sql` files of `migrations/` not yet applied, in name order. They are tracked in `d1_migrations`, the
 * table Cloudflare D1 used, so a database exported from D1 opens as already migrated.
 */
export const migrate = (db: DatabaseSync, migrationsDir: string): void => {
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  const applied = new Set(db.prepare('SELECT name FROM d1_migrations').all().map((row) => String(row.name)))
  // A D1 export without its migrations table: the first migration is the one that created `notas`.
  const hasNotas = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notas'").get()
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    if (applied.has(file)) continue
    const isBaseline = hasNotas && !applied.size && file === files[0]
    db.exec('BEGIN')
    try {
      if (!isBaseline) db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
      db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(file)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(`migration ${file} failed: ${String(error)}`)
    }
  }
}

export const createSqliteRepo = (db: DatabaseSync): Repo => {
  const getNota = db.prepare('SELECT data FROM notas WHERE id = ?')
  const saveNota = db.prepare(
    `INSERT INTO notas (id, status, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET status = excluded.status, data = excluded.data, updated_at = excluded.updated_at`,
  )
  const increment = db.prepare('INSERT INTO counters (name, value) VALUES (?, 1) ON CONFLICT (name) DO UPDATE SET value = value + 1 RETURNING value')
  return {
    get: async (id) => {
      const row = getNota.get(id)
      return row ? (JSON.parse(String(row.data)) as Nota) : null
    },
    save: async (nota) => {
      saveNota.run(nota.id, nota.status, JSON.stringify(nota), nota.createdAt, nota.updatedAt)
    },
    nextNumber: async () => {
      const row = increment.get(DPS_COUNTER)
      if (!row) throw new Error('could not reserve a DPS number')
      return Number(row.value)
    },
    list: async ({ status, limit, before, beforeId }) => {
      const cursor = before && beforeId ? '(created_at, id) < (?, ?)' : before ? 'created_at < ?' : ''
      const filters = [status ? 'status = ?' : '', cursor].filter(Boolean)
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
      const params = [status, before, before ? beforeId : undefined].filter((value): value is string => Boolean(value))
      const rows = db.prepare(`SELECT data FROM notas ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).all(...params, limit)
      return rows.map((row) => JSON.parse(String(row.data)) as Nota)
    },
  }
}

/** In-memory Repo for tests. */
export const createMemoryRepo = (): Repo & { notas: Map<string, Nota>; setCounter(value: number): void } => {
  const notas = new Map<string, Nota>()
  let counter = 0
  return {
    notas,
    setCounter: (value) => {
      counter = value
    },
    get: async (id) => structuredClone(notas.get(id) ?? null),
    save: async (nota) => {
      notas.set(nota.id, structuredClone(nota))
    },
    nextNumber: async () => ++counter,
    list: async ({ status, limit }) => [...notas.values()].filter((nota) => !status || nota.status === status).slice(0, limit),
  }
}
