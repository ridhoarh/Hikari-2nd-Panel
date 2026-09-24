import { describe, expect, test } from 'bun:test'
import { openDatabase } from './client'
import { runMigrations } from './migrate'

describe('database', () => {
  test('bikin semua tabel yang dibutuhin', () => {
    const db = openDatabase(':memory:')
    runMigrations(db)

    const rows = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const tables = rows.map((r) => r.name)

    expect(tables).toContain('settings')
    expect(tables).toContain('users')
    expect(tables).toContain('projects')
    expect(tables).toContain('apps')
    expect(tables).toContain('env_vars')
    expect(tables).toContain('deployments')
    expect(tables).toContain('domains')
    expect(tables).toContain('webhook_deliveries')
  })

  test('foreign key aktif', () => {
    const db = openDatabase(':memory:')
    runMigrations(db)
    const row = db.query('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(row.foreign_keys).toBe(1)
  })

  test('jalanin migrasi dua kali nggak error', () => {
    const db = openDatabase(':memory:')
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
  })
})
