import type { Database } from './client'
import {
  backupCommand,
  backupFilename,
  pruneBackupFiles,
  recordBackup,
  writeBackupFile,
} from './backup'
import { isDue } from './schedule'
import { run } from '../build/exec'
import { dbContainerName } from '../docker/db-containers'
import type { DbEngine } from '../lib/db-engines'
import { listAllDatabases, readPassword } from '../repositories/databases'
import { nowIso } from '../lib/id'

export const BACKUP_INTERVAL_KEY = 'backup_interval_hours'
export const BACKUP_LAST_KEY = 'backup_last_run_at'
export const BACKUP_KEEP_DAYS = 14

export function getBackupIntervalHours(db: Database): number {
  const row = db
    .query('SELECT value FROM settings WHERE key = ?')
    .get(BACKUP_INTERVAL_KEY) as { value: string } | null
  if (!row) return 0
  const n = Number(row.value)
  return Number.isFinite(n) ? n : 0
}

export function setBackupIntervalHours(db: Database, jam: number): void {
  db.query(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(BACKUP_INTERVAL_KEY, String(jam))
}

function getLastRunAt(db: Database): string | null {
  const row = db.query('SELECT value FROM settings WHERE key = ?').get(BACKUP_LAST_KEY) as
    | { value: string }
    | null
  return row?.value ?? null
}

function setLastRunAt(db: Database, waktu: string): void {
  db.query(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(BACKUP_LAST_KEY, waktu)
}

export type AutoBackupResult = {
  dijalankan: boolean
  berhasil: number
  gagal: { name: string; error: string }[]
}

/**
 * Backup otomatis yang dicek di jalur yang emang udah jalan (abis deploy
 * sukses). Nggak ada timer, nggak ada cron — kalau nggak ada aktivitas,
 * nggak ada backup, dan itu sesuai prinsip proyek ini.
 *
 * Satu database gagal nggak nge-stopin yang lain.
 */
export async function runAutoBackup(opts: {
  db: Database
  dataDir: string
  cryptoKey: Buffer
  now?: Date
  /** Paksa jalan walau jadwalnya belum due (dipakai tombol manual). */
  force?: boolean
}): Promise<AutoBackupResult> {
  const now = opts.now ?? new Date()
  const interval = getBackupIntervalHours(opts.db)

  if (
    !opts.force &&
    !isDue({ lastRunAt: getLastRunAt(opts.db), intervalHours: interval, now })
  ) {
    return { dijalankan: false, berhasil: 0, gagal: [] }
  }

  const backupDir = `${opts.dataDir}/backups`
  let berhasil = 0
  const gagal: { name: string; error: string }[] = []

  for (const record of listAllDatabases(opts.db)) {
    const engine = record.engine as DbEngine
    const filename = backupFilename(engine, record.id)
    if (!filename) continue

    const cmd = backupCommand({
      engine,
      containerName: dbContainerName(record.id),
      user: record.db_user,
      password: readPassword(record.password, opts.cryptoKey),
      dbName: record.db_name,
    })
    if (!cmd) continue

    try {
      const isi = await run(cmd.cmd, cmd.args, { timeoutMs: 10 * 60 * 1000 })
      const size = writeBackupFile(backupDir, filename, isi)
      recordBackup(opts.db, record.id, filename, size)
      berhasil += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      gagal.push({ name: record.name, error: message })
    }
  }

  pruneBackupFiles(backupDir, BACKUP_KEEP_DAYS)
  setLastRunAt(opts.db, nowIso())

  return { dijalankan: true, berhasil, gagal }
}

/** Buat nampilin di panel. */
export function backupScheduleInfo(db: Database): {
  intervalHours: number
  lastRunAt: string | null
  aktif: boolean
} {
  const intervalHours = getBackupIntervalHours(db)
  return {
    intervalHours,
    lastRunAt: getLastRunAt(db),
    aktif: intervalHours > 0,
  }
}
