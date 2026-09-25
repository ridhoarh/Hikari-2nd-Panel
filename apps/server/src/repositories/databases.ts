import type { Database } from '../db/client'
import { decrypt, encrypt } from '../lib/crypto'
import { ENGINES, type DbEngine } from '../lib/db-engines'
import { newId, nowIso, slugify } from '../lib/id'

export type AccessMode = 'internal' | 'tunnel' | 'public' | 'domain'
export type DbStatus = 'stopped' | 'running' | 'failed'

export type DbRecord = {
  id: string
  project_id: string
  name: string
  engine: DbEngine
  version: string
  db_name: string
  db_user: string
  password: string
  volume_name: string
  container_port: number
  host_port: number
  access_mode: AccessMode
  expose_domain: string | null
  status: DbStatus
  memory_limit_mb: number
  created_at: string
}

/** Range port host buat database. Jauh dari port panel 2508. */
export const HOST_PORT_MIN = 20001
export const HOST_PORT_MAX = 29999

/**
 * Cari host port kosong. Dipakai port yang paling kecil biar rapi, dan
 * lubang yang ditinggal database yang dihapus dipakai lagi.
 *
 * Sengaja cuma lihat database yang ADA DI DATABASE Hikari. Container sisa
 * yang nggak kecatet (misal dari percobaan yang gagal di tengah) nggak
 * keliatan dari sini — makanya `runDbContainer` juga nge-handle kasus port
 * bentrok dengan pesan yang jelas.
 */
export function allocateHostPort(db: Database): number {
  const rows = db.query('SELECT host_port FROM databases').all() as {
    host_port: number
  }[]
  const dipakai = new Set(rows.map((r) => r.host_port))

  for (let p = HOST_PORT_MIN; p <= HOST_PORT_MAX; p++) {
    if (!dipakai.has(p)) return p
  }

  throw new Error(
    `Port host buat database udah abis (${HOST_PORT_MIN}-${HOST_PORT_MAX})`
  )
}

/** Nama database/user harus aman dipakai sebagai identifier SQL. */
function safeIdentifier(name: string): string {
  const bersih = slugify(name).replace(/-/g, '_')
  const aman = bersih.replace(/^[0-9]+/, '')
  return (aman.length > 0 ? aman : 'db').slice(0, 32)
}

export function listDatabases(db: Database, projectId?: string): DbRecord[] {
  if (projectId) {
    return db
      .query(
        'SELECT * FROM databases WHERE project_id = ? ORDER BY created_at DESC, id DESC'
      )
      .all(projectId) as DbRecord[]
  }
  return db
    .query('SELECT * FROM databases ORDER BY created_at DESC, id DESC')
    .all() as DbRecord[]
}

export function getDatabase(db: Database, id: string): DbRecord | null {
  return db.query('SELECT * FROM databases WHERE id = ?').get(id) as DbRecord | null
}

export function listAllDatabases(db: Database): DbRecord[] {
  return db
    .query('SELECT * FROM databases ORDER BY created_at DESC, id DESC')
    .all() as DbRecord[]
}

export function createDatabase(
  db: Database,
  input: {
    projectId: string
    name: string
    engine: DbEngine
    version: string
    password: string
    memoryLimitMb?: number
  }
): DbRecord {
  const id = newId()
  const spec = ENGINES[input.engine]

  const record: DbRecord = {
    id,
    project_id: input.projectId,
    name: input.name,
    engine: input.engine,
    version: input.version,
    db_name: safeIdentifier(input.name),
    db_user: 'hikari',
    password: input.password,
    volume_name: `hikari-db-${id.toLowerCase()}`,
    container_port: spec.containerPort,
    host_port: allocateHostPort(db),
    access_mode: 'internal',
    expose_domain: null,
    status: 'stopped',
    memory_limit_mb: input.memoryLimitMb ?? 512,
    created_at: nowIso(),
  }

  db.query(
    `INSERT INTO databases (
      id, project_id, name, engine, version, db_name, db_user, password,
      volume_name, container_port, host_port, access_mode, expose_domain,
      status, memory_limit_mb, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.project_id,
    record.name,
    record.engine,
    record.version,
    record.db_name,
    record.db_user,
    record.password,
    record.volume_name,
    record.container_port,
    record.host_port,
    record.access_mode,
    record.expose_domain,
    record.status,
    record.memory_limit_mb,
    record.created_at
  )

  return record
}

export function setAccessMode(
  db: Database,
  id: string,
  mode: AccessMode,
  exposeDomain?: string | null
): void {
  const domain = mode === 'domain' ? (exposeDomain ?? null) : null
  db.query('UPDATE databases SET access_mode = ?, expose_domain = ? WHERE id = ?').run(
    mode,
    domain,
    id
  )
}

export function updateExposedDomain(
  db: Database,
  id: string,
  domain: string
): void {
  // UNIQUE constraint di skema yang jaga, tapi kita lempar error yang jelas
  // biar endpoint bisa balikin pesan yang masuk akal.
  const bentrok = db
    .query('SELECT id FROM databases WHERE expose_domain = ? AND id != ?')
    .get(domain, id)
  if (bentrok) throw new Error('Domain itu udah dipakai database lain')

  db.query('UPDATE databases SET expose_domain = ? WHERE id = ?').run(domain, id)
}

export function setDbStatus(db: Database, id: string, status: DbStatus): void {
  db.query('UPDATE databases SET status = ? WHERE id = ?').run(status, id)
}

export function deleteDatabase(db: Database, id: string): boolean {
  const result = db.query('DELETE FROM databases WHERE id = ?').run(id)
  return result.changes > 0
}

/**
 * Sama kayak env var: yang disimpen di disk terenkripsi, yang dipakai
 * runtime didekripsi. Dipisah biar nggak ada yang salah pakai nilai
 * terenkripsi buat connection string.
 */
export function storePassword(plain: string, cryptoKey: Buffer): string {
  return encrypt(plain, cryptoKey)
}

export function readPassword(stored: string, cryptoKey: Buffer): string {
  return decrypt(stored, cryptoKey)
}
