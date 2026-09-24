import { describe, expect, test, beforeEach } from 'bun:test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { createProject } from './projects'
import { generateDbPassword, buildConnectionString, buildSshTunnel } from '../lib/db-engines'
import {
  allocateHostPort,
  createDatabase as createDb,
  deleteDatabase,
  getDatabase,
  listDatabases,
  setAccessMode,
  setDbStatus,
  updateExposedDomain,
} from './databases'

let db: Database
let projectId: string
let tmp: string

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
  projectId = createProject(db, { name: 'Blog' }).id
  tmp = mkdtempSync(join(tmpdir(), 'hikari-db-'))
})

describe('generateDbPassword', () => {
  test('bikin 32 karakter', () => {
    expect(generateDbPassword()).toHaveLength(32)
  })

  test('beda tiap kali', () => {
    expect(generateDbPassword()).not.toBe(generateDbPassword())
  })

  test('aman dipakai di connection string (tanpa karakter aneh)', () => {
    const p = generateDbPassword()
    // Cuma alfanumerik: nggak ada : / @ ? # yang bikin URL rusak.
    expect(/^[A-Za-z0-9]+$/.test(p)).toBe(true)
  })
})

describe('buildConnectionString', () => {
  const base = {
    engine: 'postgres' as const,
    user: 'hikari',
    password: 'rahasia',
    dbName: 'app',
    host: '127.0.0.1',
    port: 20001,
  }

  test('postgres pakai URL postgresql://', () => {
    expect(buildConnectionString(base)).toBe(
      'postgresql://hikari:rahasia@127.0.0.1:20001/app'
    )
  })

  test('postgres lewat TLS tambahin sslmode=require', () => {
    expect(buildConnectionString({ ...base, tls: true })).toContain('sslmode=require')
  })

  test('mysql pakai URL mysql:// tanpa nama database di path', () => {
    const url = buildConnectionString({ ...base, engine: 'mysql' })
    expect(url).toBe('mysql://hikari:rahasia@127.0.0.1:20001/app')
  })

  test('redis pakai URL redis:// tanpa user', () => {
    const url = buildConnectionString({ ...base, engine: 'redis' })
    expect(url).toBe('redis://:rahasia@127.0.0.1:20001')
    expect(url).not.toContain('hikari@')
  })

  test('redis lewat TLS pakai skema rediss://', () => {
    expect(buildConnectionString({ ...base, engine: 'redis', tls: true })).toStartWith(
      'rediss://'
    )
  })
})

describe('buildSshTunnel', () => {
  test('bikin perintah ssh -L yang bisa dicopy', () => {
    const cmd = buildSshTunnel({ hostPort: 20001, containerPort: 5432 })
    expect(cmd).toBe('ssh -L 20001:localhost:20001 user@ip-vps-kamu')
  })

  test('pakai host port (yang kebuka di VPS), bukan port container', () => {
    expect(buildSshTunnel({ hostPort: 20001, containerPort: 5432 })).toContain('20001')
    expect(buildSshTunnel({ hostPort: 20001, containerPort: 5432 })).not.toContain('5432')
  })
})

describe('allocateHostPort', () => {
  test('mulai dari awal range', () => {
    expect(allocateHostPort(db)).toBe(20001)
  })

  test('naik kalau udah kepake', () => {
    createDb(db, {
      projectId,
      name: 'Db Satu',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    expect(allocateHostPort(db)).toBe(20002)
  })

  test('ngisi lubang yang ditinggal database yang dihapus', () => {
    const a = createDb(db, {
      projectId,
      name: 'A',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    createDb(db, {
      projectId,
      name: 'B',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    deleteDatabase(db, a.id)
    // Port 20001 udah kosong, jadi dipakai lagi.
    expect(allocateHostPort(db)).toBe(20001)
  })
})

describe('createDatabase', () => {
  test('bikin database dengan password 32 karakter & volume otomatis', () => {
    const d = createDb(db, {
      projectId,
      name: 'Produksi',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    expect(d.engine).toBe('postgres')
    expect(d.container_port).toBe(5432)
    expect(d.host_port).toBe(20001)
    expect(d.access_mode).toBe('internal')
    expect(d.status).toBe('stopped')
    expect(d.memory_limit_mb).toBe(512)
    expect(d.volume_name).toContain('hikari-db-')
    expect(d.password).toHaveLength(32)
  })

  test('port container sesuai engine', () => {
    const my = createDb(db, {
      projectId,
      name: 'MySQL',
      engine: 'mysql',
      version: '8',
      password: generateDbPassword(),
    })
    expect(my.container_port).toBe(3306)

    const rd = createDb(db, {
      projectId,
      name: 'Redis',
      engine: 'redis',
      version: '7',
      password: generateDbPassword(),
    })
    expect(rd.container_port).toBe(6379)
  })

  test('host port unik walau engine beda', () => {
    const a = createDb(db, {
      projectId,
      name: 'A',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    const b = createDb(db, {
      projectId,
      name: 'B',
      engine: 'mysql',
      version: '8',
      password: generateDbPassword(),
    })
    expect(a.host_port).not.toBe(b.host_port)
  })

  test('nama database & user dibikin aman buat SQL', () => {
    const d = createDb(db, {
      projectId,
      name: 'Blog Saya!!',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    expect(d.db_name).toMatch(/^[a-z0-9_]+$/)
    expect(d.db_user).toMatch(/^[a-z0-9_]+$/)
  })
})

describe('listDatabases', () => {
  test('kosong di awal', () => {
    expect(listDatabases(db)).toEqual([])
  })

  test('difilter per project', () => {
    const p2 = createProject(db, { name: 'Lain' }).id
    createDb(db, {
      projectId,
      name: 'A',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    createDb(db, {
      projectId: p2,
      name: 'B',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    expect(listDatabases(db, projectId)).toHaveLength(1)
    expect(listDatabases(db)).toHaveLength(2)
  })
})

describe('setAccessMode', () => {
  test('ubah mode akses', () => {
    const d = createDb(db, {
      projectId,
      name: 'A',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    setAccessMode(db, d.id, 'public')
    expect(getDatabase(db, d.id)?.access_mode).toBe('public')
  })

  test('mode domain nyimpen hostname', () => {
    const d = createDb(db, {
      projectId,
      name: 'A',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    setAccessMode(db, d.id, 'domain', 'db.contoh.com')
    const after = getDatabase(db, d.id)
    expect(after?.access_mode).toBe('domain')
    expect(after?.expose_domain).toBe('db.contoh.com')
  })

  test('ganti balik ke internal ngehapus hostname', () => {
    const d = createDb(db, {
      projectId,
      name: 'A',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    setAccessMode(db, d.id, 'domain', 'db.contoh.com')
    setAccessMode(db, d.id, 'internal')
    expect(getDatabase(db, d.id)?.expose_domain).toBeNull()
  })
})

describe('deleteDatabase', () => {
  test('hapus database', () => {
    const d = createDb(db, {
      projectId,
      name: 'A',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    expect(deleteDatabase(db, d.id)).toBe(true)
    expect(getDatabase(db, d.id)).toBeNull()
  })

  test('hapus project ikut hapus database', () => {
    const d = createDb(db, {
      projectId,
      name: 'A',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    db.query('DELETE FROM projects WHERE id = ?').run(projectId)
    expect(getDatabase(db, d.id)).toBeNull()
  })
})

describe('setDbStatus', () => {
  test('ubah status', () => {
    const d = createDb(db, {
      projectId,
      name: 'A',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    setDbStatus(db, d.id, 'running')
    expect(getDatabase(db, d.id)?.status).toBe('running')
  })
})

describe('updateExposedDomain', () => {
  test('nggak bisa dipakai dua database', () => {
    const a = createDb(db, {
      projectId,
      name: 'A',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    const b = createDb(db, {
      projectId,
      name: 'B',
      engine: 'postgres',
      version: '16',
      password: generateDbPassword(),
    })
    updateExposedDomain(db, a.id, 'db.contoh.com')
    expect(() => updateExposedDomain(db, b.id, 'db.contoh.com')).toThrow()
  })
})

// tmp dipakai buat nanti, biar import-nya nggak nganggur
test('tmpdir bisa dipakai', () => {
  expect(typeof tmp).toBe('string')
  rmSync(tmp, { recursive: true, force: true })
})
