import type { DbEngine } from '../lib/db-engines'

/** Berapa byte awal file yang dibaca buat ngenalin jenis dump-nya. */
export const SNIFF_BYTES = 8192

/**
 * Perintah restore. Datanya dikirim lewat stdin, jadi password nggak perlu
 * muncul di daftar argumen (yang bisa dibaca user lain lewat `ps`).
 */
export function restoreCommand(opts: {
  engine: DbEngine
  containerName: string
  user: string
  dbName: string
}): { cmd: string; args: string[] } | null {
  if (opts.engine === 'postgres') {
    return {
      cmd: 'docker',
      args: [
        'exec',
        '-i',
        opts.containerName,
        'psql',
        '-U',
        opts.user,
        '-d',
        opts.dbName,
        // Berhenti kalau ada error, jangan lanjut diam-diam.
        '-v',
        'ON_ERROR_STOP=1',
      ],
    }
  }

  if (opts.engine === 'mysql') {
    return {
      cmd: 'docker',
      args: ['exec', '-i', opts.containerName, 'mysql', '-u', opts.user, opts.dbName],
    }
  }

  // Redis nggak punya restore lewat SQL.
  return null
}

export function canRestore(engine: DbEngine): boolean {
  return engine === 'postgres' || engine === 'mysql'
}

/**
 * Cek cepat apakah isinya kelihatan kayak dump SQL.
 *
 * Cuma baca awal file (SNIFF_BYTES) — file backup bisa ratusan MB, dan
 * ngecek seluruh isinya cuma buat validasi itu boros.
 */
export function validateBackupContent(
  engine: DbEngine,
  content: string
): { ok: boolean; reason?: string } {
  if (!canRestore(engine)) {
    return { ok: false, reason: `Restore belum didukung buat ${engine}` }
  }

  if (!content || content.trim().length === 0) {
    return { ok: false, reason: 'File backup-nya kosong' }
  }

  const awal = content.slice(0, SNIFF_BYTES)

  // Tanda umum dump SQL dari dua tool itu.
  const tandaSql = [
    'CREATE TABLE',
    'INSERT INTO',
    'COPY ',
    '-- PostgreSQL database dump',
    '-- MySQL dump',
    'SET ',
    'DROP TABLE',
  ]

  if (!tandaSql.some((t) => awal.includes(t))) {
    return {
      ok: false,
      reason:
        'Isi filenya kayaknya bukan dump SQL. Pastiin kamu upload file hasil backup Hikari.',
    }
  }

  return { ok: true }
}
