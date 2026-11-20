import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { Nota, Repo } from './notas.ts'
import { createMemoryRepo, createSqliteRepo, openDatabase } from './repo.ts'

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

describe.each<[string, () => Repo]>([
  ['sqlite repo', () => createSqliteRepo(openDatabase(':memory:'))],
  ['memory repo', () => createMemoryRepo()],
])('%s list', (_name, makeRepo) => {
  const T = '2026-11-20T12:00:00.000Z'
  const ids = async (repo: Repo, options: Parameters<Repo['list']>[0]) => (await repo.list(options)).map((n) => n.id)

  it('lists the newest first, by status and before a date', async () => {
    const repo = makeRepo()
    await repo.save(nota('old', '2026-11-01T00:00:00Z'))
    await repo.save(nota('mid', '2026-11-02T00:00:00Z', 'rejected'))
    await repo.save(nota('new', '2026-11-03T00:00:00Z'))
    expect(await ids(repo, { limit: 10 })).toEqual(['new', 'mid', 'old'])
    expect(await ids(repo, { status: 'issued', limit: 10 })).toEqual(['new', 'old'])
    expect(await ids(repo, { limit: 10, before: '2026-11-03T00:00:00Z' })).toEqual(['mid', 'old'])
    expect(await ids(repo, { limit: 1 })).toEqual(['new'])
  })

  it('orders notas sharing a createdAt by id descending, identically on repeated calls', async () => {
    const repo = makeRepo()
    for (const id of ['b', 'a', 'c']) await repo.save(nota(id, T))
    expect(await ids(repo, { limit: 10 })).toEqual(['c', 'b', 'a'])
    expect(await ids(repo, { limit: 10 })).toEqual(['c', 'b', 'a'])
  })

  it('pages through a tie with before and beforeId without skipping or repeating', async () => {
    const repo = makeRepo()
    for (const id of ['a', 'b', 'c']) await repo.save(nota(id, T))
    expect(await ids(repo, { limit: 2 })).toEqual(['c', 'b'])
    expect(await ids(repo, { limit: 2, before: T, beforeId: 'b' })).toEqual(['a'])
  })

  it('ignores beforeId without before', async () => {
    const repo = makeRepo()
    for (const id of ['a', 'b', 'c']) await repo.save(nota(id, T))
    expect(await ids(repo, { limit: 10, beforeId: 'b' })).toEqual(['c', 'b', 'a'])
  })

  it('orders ids by UTF-8 bytes, like SQLite BINARY collation', async () => {
    const repo = makeRepo()
    for (const id of ['Z', 'a', 'é', 'z']) await repo.save(nota(id, T))
    expect(await ids(repo, { limit: 10 })).toEqual(['é', 'z', 'a', 'Z'])
  })

  it('returns copies, not the stored notas', async () => {
    const repo = makeRepo()
    await repo.save(nota('a', T))
    const [listed] = await repo.list({ limit: 10 })
    if (listed) listed.status = 'rejected'
    expect((await repo.get('a'))?.status).toBe('issued')
    expect((await repo.list({ limit: 10 }))[0]?.status).toBe('issued')
  })
})
