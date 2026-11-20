import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { Nota } from './notas.ts'
import { createSqliteRepo, openDatabase } from './repo.ts'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')

const nota = (id: string, createdAt: string, status: Nota['status'] = 'issued'): Nota => ({
  id,
  status,
  request: { id, serviceCode: '080201', description: 'Aula', valueCents: 100 },
  dpsNumber: 1,
  dpsId: `DPS${id}`,
  createdAt,
  updatedAt: createdAt,
})

describe('sqlite repo', () => {
  it('saves, replaces and reads a nota', async () => {
    const repo = createSqliteRepo(openDatabase(':memory:'))
    await repo.save(nota('a', '2026-11-01T00:00:00Z', 'pending'))
    await repo.save({ ...nota('a', '2026-11-01T00:00:00Z'), accessKey: 'KEY' })
    expect(await repo.get('a')).toMatchObject({ status: 'issued', accessKey: 'KEY' })
    expect(await repo.get('missing')).toBeNull()
  })

  it('hands out DPS numbers that never repeat, across restarts', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'nfse-repo-')), 'data', 'nfse.db')
    const first = openDatabase(path)
    const repo = createSqliteRepo(first)
    expect([await repo.nextNumber(), await repo.nextNumber()]).toEqual([1, 2])
    first.close()
    expect(await createSqliteRepo(openDatabase(path)).nextNumber()).toBe(3)
  })

  it('lists the newest first, by status and before a date', async () => {
    const repo = createSqliteRepo(openDatabase(':memory:'))
    await repo.save(nota('old', '2026-11-01T00:00:00Z'))
    await repo.save(nota('mid', '2026-11-02T00:00:00Z', 'rejected'))
    await repo.save(nota('new', '2026-11-03T00:00:00Z'))
    expect((await repo.list({ limit: 10 })).map((n) => n.id)).toEqual(['new', 'mid', 'old'])
    expect((await repo.list({ status: 'issued', limit: 10 })).map((n) => n.id)).toEqual(['new', 'old'])
    expect((await repo.list({ limit: 10, before: '2026-11-03T00:00:00Z' })).map((n) => n.id)).toEqual(['mid', 'old'])
    expect((await repo.list({ limit: 1 })).map((n) => n.id)).toEqual(['new'])
  })

  it('applies each migration once', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'nfse-repo-')), 'nfse.db')
    openDatabase(path).close()
    const db = openDatabase(path)
    expect(db.prepare('SELECT name FROM d1_migrations').all().map((row) => row.name)).toEqual(['0001_init.sql'])
  })

  it('opens a database exported from D1 without its migrations table as already migrated', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'nfse-repo-')), 'nfse.db')
    const exported = new DatabaseSync(path)
    exported.exec(readFileSync(join(MIGRATIONS, '0001_init.sql'), 'utf8'))
    exported.exec("INSERT INTO counters (name, value) VALUES ('dps', 41)")
    exported.close()
    expect(await createSqliteRepo(openDatabase(path)).nextNumber()).toBe(42)
  })
})
