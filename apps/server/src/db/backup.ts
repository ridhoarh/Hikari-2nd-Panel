import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ENGINES, type DbEngine } from '../lib/db-engines'
import { newId, nowIso } from '../lib/id'
import type { Database } from './client'

export type BackupRecord = {
  id: string
  database_id: string
  filename: string
  size_bytes: number
  created_at: string
}

export function backupFilename(engine: DbEngine, databaseId: string): string | null {
  // Redis nggak punya dump ke stdout yang gampang; dilewat di Fase 2.
  if (engine === 'redis') return null
  const aman = databaseId.replace(/[^A-Za-z0-9_-]/g, '')
  return `backup-${aman}.sql`
}

/**
 * Perintah `docker exec` buat nge-dump ke stdout.
 *
 * Password TIDAK dimasukin ke argumen: daftar argumen proses bisa dibaca
 * user lain lewat `ps`. Postgres udah punya password dari env container-nya,
 * jadi nggak perlu. MySQL juga — kita pakai flag yang baca dari env.
 */
export function backupCommand(opts: {
  engine: DbEngine
  containerName: string
  user: string
  password: string
  dbName: string
}): { cmd: string; args: string[] } | null {
  const spec = ENGINES[opts.engine]
  const args = spec.dumpArgs({
    user: opts.user,
    password: opts.password,
    dbName: opts.dbName,
  })

  if (!args) return null

  return {
    cmd: 'docker',
    args: ['exec', '-i', opts.containerName, ...args],
  }
}

export function listBackups(db: Database, databaseId: string): BackupRecord[] {
  return db
    .query(
      'SELECT * FROM backups WHERE database_id = ? ORDER BY created_at DESC, id DESC'
    )
    .all(databaseId) as BackupRecord[]
}

export function getBackup(db: Database, id: string): BackupRecord | null {
  return db.query('SELECT * FROM backups WHERE id = ?').get(id) as BackupRecord | null
}

export function recordBackup(
  db: Database,
  databaseId: string,
  filename: string,
  sizeBytes: number
): BackupRecord {
  const record: BackupRecord = {
    id: newId(),
    database_id: databaseId,
    filename,
    size_bytes: sizeBytes,
    created_at: nowIso(),
  }

  db.query(
    'INSERT INTO backups (id, database_id, filename, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(
    record.id,
    record.database_id,
    record.filename,
    record.size_bytes,
    record.created_at
  )

  return record
}

export function deleteBackupRecord(db: Database, id: string): boolean {
  const result = db.query('DELETE FROM backups WHERE id = ?').run(id)
  return result.changes > 0
}

export function backupPath(backupDir: string, filename: string): string {
  // Cegah path traversal: nama file dikunci ke basename-nya aja.
  const aman = filename.replace(/[/\\]/g, '').replace(/\.\./g, '')
  return join(backupDir, aman)
}

export function writeBackupFile(
  backupDir: string,
  filename: string,
  content: string
): number {
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true })
  const path = backupPath(backupDir, filename)
  Bun.write(path, content)
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/** Buang backup lama di disk kalau udah lebih dari `maxAgeDays`. */
export function pruneBackupFiles(backupDir: string, maxAgeDays: number): number {
  if (!existsSync(backupDir)) return 0

  const batas = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  let dihapus = 0

  for (const nama of readdirSync(backupDir)) {
    if (!nama.endsWith('.sql')) continue
    const path = join(backupDir, nama)
    try {
      if (statSync(path).mtimeMs < batas) {
        rmSync(path)
        dihapus += 1
      }
    } catch {
      // file udah nggak ada
    }
  }

  return dihapus
}
