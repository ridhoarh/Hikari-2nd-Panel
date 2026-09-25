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
  const aman = databaseId.replace(/[^A-Za-z0-9_-]/g, '')
  // Redis disimpen sebagai RDB, bukan SQL.
  if (engine === 'redis') return `backup-${aman}.rdb`
  return `backup-${aman}.sql`
}

/**
 * Perintah buat REDIS: paksa tulis snapshot ke disk, terus baca file-nya.
 *
 * Password dikirim lewat env `REDISCLI_AUTH`, BUKAN argumen `-a`. Dua alasan:
 *  - `-a` muncul di daftar argumen proses, dan bisa dibaca user lain lewat `ps`.
 *  - `--no-auth-warning` cuma nyembunyiin peringatan, bukan ngirim password.
 *    Tanpa `REDISCLI_AUTH`, perintahnya gagal `NOAUTH`.
 *
 * Password-nya dikirim pakai `docker exec -e`, BUKAN lewat `env` proses `docker`.
 * `docker exec` nggak nerusin environment host ke dalam container, jadi env
 * yang cuma ditempel di proses `docker` nggak bakal kebaca `redis-cli` di
 * dalam — gejalanya `NOAUTH` walau kita udah nge-set `REDISCLI_AUTH`.
 *
 * `BGSAVE` itu asynchronous — balik langsung, tapi tulisannya belum tentu
 * kelar. Cara nunggunya: baca field `rdb_bgsave_in_progress` dari
 * `INFO persistence`.
 *
 * JANGAN pakai perubahan `LASTSAVE` sebagai penanda selesai. Container Hikari
 * jalan dengan `--appendonly yes`, dan Redis mematikan RDB periodik di mode
 * itu. Jadi `BGSAVE` bisa jadi menulis snapshot tanpa update `LASTSAVE`, dan
 * penantian berbasis timestamp bakal nunggu sampai timeout terus-terusan.
 *
 * CATATAN: `password` sengaja masuk ke daftar argumen `docker exec -e`. Itu
 * kompromi yang disadari — `-e VAR=nilai` harus jadi argumen. Yang penting
 * password nggak muncul di daftar argumen `redis-cli` di dalam container,
 * dan `ps` di dalam container memang nggak nunjukin proses `docker exec`.
 */
export function redisBackupCommands(opts: {
  containerName: string
  password: string
}) {
  // `-e KEY=value` harus dikirim ke `docker exec`, bukan ke proses host.
  const auth = ['-e', `REDISCLI_AUTH=${opts.password}`]
  const cli = ['redis-cli']
  return {
    bgsave: {
      cmd: 'docker',
      args: ['exec', ...auth, opts.containerName, ...cli, 'BGSAVE'],
    },
    /**
     * Progres BGSAVE. Keluarannya `rdb_bgsave_in_progress:0|1`.
     */
    cekBgsave: {
      cmd: 'docker',
      args: ['exec', ...auth, opts.containerName, ...cli, 'INFO', 'persistence'],
    },
    /**
     * Ambil dump.rdb dari dalam container ke stdout.
     *
     * `cat` dipakai, bukan `docker cp`, karena `cp` nulis ke path host —
     * dan kita mau isinya lewat pipe biar seragam sama dump SQL.
     */
    bacaDump: {
      cmd: 'docker',
      args: ['exec', opts.containerName, 'cat', '/data/dump.rdb'],
    },
  }
}

/**
 * `BGSAVE` lagi jalan kalau `rdb_bgsave_in_progress` bernilai `1` di keluaran
 * `INFO persistence`. Kalau field-nya nggak ada, dianggap udah kelar biar
 * nggak nyangkut nunggu field yang nggak pernah muncul.
 *
 * Toleran terhadap `\r` (output dari Windows/mode lain) dan spasi sesudah
 * titik dua, karena format itu bisa beda antar versi Redis.
 */
export function bgsaveMasihJalan(info: string): boolean {
  return /(^|\r?\n)rdb_bgsave_in_progress:[ \t]*1[ \t]*(\r?\n|$)/.test(info)
}

/**
 * Status terakhir BGSAVE dari `INFO persistence`, dipakai buat pesan error
 * yang jelas waktu gagal.
 */
export function bgsaveStatusTerakhir(info: string): string {
  const status = info.match(/(^|\r?\n)rdb_last_bgsave_status:[ \t]*(\w+)/)?.[2]
  return status ?? 'tidak diketahui'
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
