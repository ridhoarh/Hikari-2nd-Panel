import { beforeEach, describe, expect, test } from 'bun:test'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { generateKey } from '../lib/crypto'
import { generateDbPassword } from '../lib/db-engines'
import { createProject } from '../repositories/projects'
import { createDatabase, getDatabase, storePassword } from '../repositories/databases'
import { describeDatabase } from './service'

let db: Database
let projectId: string
const cryptoKey = generateKey()

function bikinDb(
  input: { name?: string; engine?: 'postgres' | 'mysql' | 'redis' } = {}
) {
  return createDatabase(db, {
    projectId,
    name: input.name ?? 'Produksi',
    engine: input.engine ?? 'postgres',
    version: input.engine === 'mysql' ? '8' : input.engine === 'redis' ? '7' : '16',
    password: storePassword(generateDbPassword(), cryptoKey),
  })
}

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
  projectId = createProject(db, { name: 'Blog' }).id
})

describe('describeDatabase - internal', () => {
  test('pakai 127.0.0.1, bukan IP VPS', () => {
    const d = bikinDb()
    const info = describeDatabase(d, { vpsIp: '10.3.10.80', cryptoKey })
    expect(info.endpoint.host).toBe('127.0.0.1')
    expect(info.connectionString).toContain('@127.0.0.1:')
  })

  test('connection string postgres formatnya bener', () => {
    const d = bikinDb()
    const info = describeDatabase(d, { cryptoKey })
    expect(info.connectionString).toMatch(
      /^postgresql:\/\/hikari:[A-Za-z0-9]{32}@127\.0\.0\.1:\d+\/produksi$/
    )
  })

  test('nggak ada perintah tunnel di mode internal', () => {
    const d = bikinDb()
    expect(describeDatabase(d, { cryptoKey }).tunnelCommand).toBeNull()
  })

  test('nggak ada peringatan di mode internal', () => {
    const d = bikinDb()
    expect(describeDatabase(d, { cryptoKey }).warnings).toEqual([])
  })
})

describe('describeDatabase - tunnel', () => {
  test('nampilin perintah ssh -L', () => {
    const d = bikinDb()
    db.query('UPDATE databases SET access_mode = ? WHERE id = ?').run('tunnel', d.id)
    const info = describeDatabase(getDatabase(db, d.id)!, { cryptoKey })
    expect(info.tunnelCommand).toContain('ssh -L')
    expect(info.tunnelCommand).toContain(String(d.host_port))
  })

  test('tetep pakai 127.0.0.1', () => {
    const d = bikinDb()
    db.query('UPDATE databases SET access_mode = ? WHERE id = ?').run('tunnel', d.id)
    const info = describeDatabase(getDatabase(db, d.id)!, { cryptoKey })
    expect(info.endpoint.host).toBe('127.0.0.1')
  })
})

describe('describeDatabase - public', () => {
  test('pakai IP VPS', () => {
    const d = bikinDb()
    db.query('UPDATE databases SET access_mode = ? WHERE id = ?').run('public', d.id)
    const info = describeDatabase(getDatabase(db, d.id)!, {
      vpsIp: '203.0.113.5',
      cryptoKey,
    })
    expect(info.endpoint.host).toBe('203.0.113.5')
    expect(info.connectionString).toContain('203.0.113.5')
  })

  test('selalu kasih peringatan', () => {
    const d = bikinDb()
    db.query('UPDATE databases SET access_mode = ? WHERE id = ?').run('public', d.id)
    const info = describeDatabase(getDatabase(db, d.id)!, { cryptoKey })
    expect(info.warnings.length).toBeGreaterThan(0)
    expect(info.warnings.join(' ')).toContain('internet')
  })

  test('nggak pakai TLS di mode IP publik', () => {
    const d = bikinDb()
    db.query('UPDATE databases SET access_mode = ? WHERE id = ?').run('public', d.id)
    const info = describeDatabase(getDatabase(db, d.id)!, { cryptoKey })
    expect(info.connectionString).not.toContain('sslmode')
  })
})

describe('describeDatabase - domain', () => {
  test('pakai domain dan sslmode=require', () => {
    const d = bikinDb()
    db.query(
      'UPDATE databases SET access_mode = ?, expose_domain = ? WHERE id = ?'
    ).run('domain', 'db.contoh.com', d.id)
    const info = describeDatabase(getDatabase(db, d.id)!, { cryptoKey })
    expect(info.endpoint.host).toBe('db.contoh.com')
    expect(info.connectionString).toContain('sslmode=require')
  })

  test('kasih peringatan kalau lewat IP:port tetep kebuka', () => {
    const d = bikinDb()
    db.query(
      'UPDATE databases SET access_mode = ?, expose_domain = ? WHERE id = ?'
    ).run('domain', 'db.contoh.com', d.id)
    const info = describeDatabase(getDatabase(db, d.id)!, { cryptoKey })
    expect(info.warnings.join(' ')).toMatch(/IP:port|bot/i)
  })
})

describe('describeDatabase - per engine', () => {
  test('mysql connection string', () => {
    const d = bikinDb({ name: 'MyDb', engine: 'mysql' })
    expect(describeDatabase(d, { cryptoKey }).connectionString).toStartWith('mysql://')
  })

  test('redis connection string tanpa user', () => {
    const d = bikinDb({ name: 'Cache', engine: 'redis' })
    const cs = describeDatabase(d, { cryptoKey }).connectionString
    expect(cs).toStartWith('redis://')
    expect(cs).not.toContain('hikari@')
  })

  test('redis publik dikasih peringatan tambahan soal TLS', () => {
    const d = bikinDb({ name: 'Cache', engine: 'redis' })
    db.query('UPDATE databases SET access_mode = ? WHERE id = ?').run('public', d.id)
    const info = describeDatabase(getDatabase(db, d.id)!, { cryptoKey })
    expect(info.warnings.join(' ')).toContain('TLS')
  })
})

describe('password di connection string', () => {
  test('password terdekripsi dipakai, bukan teks terenkripsi', () => {
    const password = generateDbPassword()
    const d = createDatabase(db, {
      projectId,
      name: 'Produksi',
      engine: 'postgres',
      version: '16',
      password: storePassword(password, cryptoKey),
    })
    const cs = describeDatabase(d, { cryptoKey }).connectionString
    expect(cs).toContain(password)
    expect(cs).not.toContain('v1:')
  })
})
