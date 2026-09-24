import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import {
  backupCommand,
  backupFilename,
  backupPath,
  deleteBackupRecord,
  getBackup,
  listBackups,
  recordBackup,
  writeBackupFile,
} from '../db/backup'
import { describeDatabase, startDatabase, stopDatabase, changeAccessMode, destroyDatabase } from '../db/service'
import { canRestore, restoreCommand, validateBackupContent } from '../db/restore'
import {
  backupScheduleInfo,
  runAutoBackup,
  setBackupIntervalHours,
} from '../db/auto-backup'
import { runDenganInput } from '../build/exec'
import { dbContainerName } from '../docker/db-containers'
import { run } from '../build/exec'
import { validateHostname } from '../caddy/config'
import { DB_VERSION_DEFAULT, generateDbPassword, type DbEngine } from '../lib/db-engines'
import { getProject } from '../repositories/projects'
import {
  createDatabase,
  deleteDatabase,
  getDatabase,
  listDatabases,
  readPassword,
  setAccessMode,
  storePassword,
  updateExposedDomain,
} from '../repositories/databases'

const createSchema = z.object({
  name: z.string().min(1).max(64),
  engine: z.enum(['postgres', 'mysql', 'redis']),
  version: z.string().min(1).max(16).optional(),
  memoryLimitMb: z.number().int().min(64).max(32768).optional(),
})

const accessSchema = z.object({
  mode: z.enum(['internal', 'tunnel', 'public', 'domain']),
  domain: z.string().min(1).max(255).nullable().optional(),
  /** Wajib buat mode public — user harus nyatain ngerti risikonya. */
  understandRisk: z.boolean().optional(),
})

export type DatabaseRoutesDeps = {
  db: Database
  cryptoKey: Buffer
  dataDir: string
  vpsIp?: string
  onDomainChange: () => void
}

export function createDatabaseRoutes(deps: DatabaseRoutesDeps): Hono {
  const { db, cryptoKey } = deps
  const router = new Hono()
  const backupDir = `${deps.dataDir}/backups`

  router.get('/projects/:projectId/databases', (c) => {
    const { projectId } = c.req.param()
    if (!getProject(db, projectId)) {
      return c.json({ error: 'Project nggak ketemu' }, 404)
    }
    // Password JANGAN pernah ikut kekirim ke list.
    const databases = listDatabases(db, projectId).map((d) => ({
      ...d,
      password: undefined,
    }))
    return c.json({ databases })
  })

  router.post('/projects/:projectId/databases', async (c) => {
    const { projectId } = c.req.param()
    if (!getProject(db, projectId)) {
      return c.json({ error: 'Project nggak ketemu' }, 404)
    }

    const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Data database nggak valid' }, 400)
    }

    const engine = parsed.data.engine as DbEngine
    const password = generateDbPassword()

    const record = createDatabase(db, {
      projectId,
      name: parsed.data.name,
      engine,
      version: parsed.data.version ?? DB_VERSION_DEFAULT[engine],
      password: storePassword(password, cryptoKey),
      memoryLimitMb: parsed.data.memoryLimitMb,
    })

    // Password ASLI cuma dikasih waktu bikin. Sesudah ini cuma bisa lewat
    // connection string (yang dihitung dari database).
    return c.json({ database: { ...record, password } }, 201)
  })

  router.get('/databases/:id', (c) => {
    const record = getDatabase(db, c.req.param('id'))
    if (!record) return c.json({ error: 'Database nggak ketemu' }, 404)

    const info = describeDatabase(record, { vpsIp: deps.vpsIp, cryptoKey })
    return c.json({
      database: { ...record, password: undefined },
      info,
    })
  })

  router.delete('/databases/:id', async (c) => {
    const id = c.req.param('id')
    const record = getDatabase(db, id)
    if (!record) return c.json({ error: 'Database nggak ketemu' }, 404)

    await destroyDatabase({ db }, id).catch(() => undefined)
    deleteDatabase(db, id)

    return c.json({
      ok: true,
      // Sengaja diinfokan: volume-nya MASIH ADA. Data user nggak kehapus.
      volumeKept: record.volume_name,
      pesan:
        'Container-nya udah dihapus, tapi volume datanya masih ada. ' +
        'Kalau mau dihapus permanen, hapus manual: docker volume rm ' +
        record.volume_name,
    })
  })

  router.post('/databases/:id/start', async (c) => {
    const id = c.req.param('id')
    if (!getDatabase(db, id)) return c.json({ error: 'Database nggak ketemu' }, 404)

    try {
      await startDatabase({ db }, id, cryptoKey)
      return c.json({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      db.query('UPDATE databases SET status = ? WHERE id = ?').run('failed', id)
      return c.json({ error: message }, 500)
    }
  })

  router.post('/databases/:id/stop', async (c) => {
    const id = c.req.param('id')
    if (!getDatabase(db, id)) return c.json({ error: 'Database nggak ketemu' }, 404)

    await stopDatabase({ db }, id)
    return c.json({ ok: true })
  })

  router.post('/databases/:id/access', async (c) => {
    const id = c.req.param('id')
    const record = getDatabase(db, id)
    if (!record) return c.json({ error: 'Database nggak ketemu' }, 404)

    const parsed = accessSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Data nggak valid' }, 400)

    const { mode, domain, understandRisk } = parsed.data

    // Mode public WAJIB konfirmasi. Ini bukan formalitas: port-nya beneran
    // kebuka ke internet.
    if (mode === 'public' && !understandRisk) {
      return c.json(
        { error: 'Centang dulu "Aku ngerti risikonya" buat buka port ke internet' },
        400
      )
    }

    if (mode === 'domain') {
      const check = validateHostname(domain ?? '')
      if (!check.ok) return c.json({ error: check.reason }, 400)

      try {
        updateExposedDomain(db, id, (domain as string).toLowerCase())
      } catch {
        return c.json({ error: 'Domain itu udah dipakai database lain' }, 409)
      }
    }

    try {
      await changeAccessMode({ db }, id, mode, cryptoKey, domain ?? null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 500)
    }

    if (mode === 'domain' || record.access_mode === 'domain') {
      deps.onDomainChange()
    }

    const after = getDatabase(db, id)
    if (!after) return c.json({ error: 'Database nggak ketemu' }, 404)

    return c.json({
      ok: true,
      info: describeDatabase(after, { vpsIp: deps.vpsIp, cryptoKey }),
    })
  })

  // --- Backup manual ---------------------------------------------------

  router.get('/databases/:id/backups', (c) => {
    const id = c.req.param('id')
    if (!getDatabase(db, id)) return c.json({ error: 'Database nggak ketemu' }, 404)
    return c.json({ backups: listBackups(db, id) })
  })

  router.post('/databases/:id/backups', async (c) => {
    const id = c.req.param('id')
    const record = getDatabase(db, id)
    if (!record) return c.json({ error: 'Database nggak ketemu' }, 404)

    const filename = backupFilename(record.engine as DbEngine, record.id)
    if (!filename) {
      return c.json(
        { error: `Backup otomatis belum didukung buat ${record.engine}` },
        400
      )
    }

    const cmd = backupCommand({
      engine: record.engine as DbEngine,
      containerName: dbContainerName(record.id),
      user: record.db_user,
      password: readPassword(record.password, cryptoKey),
      dbName: record.db_name,
    })

    if (!cmd) return c.json({ error: 'Engine itu nggak didukung' }, 400)

    try {
      const isi = await run(cmd.cmd, cmd.args, { timeoutMs: 10 * 60 * 1000 })
      const size = writeBackupFile(backupDir, filename, isi)
      const backup = recordBackup(db, id, filename, size)
      return c.json({ backup }, 201)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: `Backup gagal: ${message}` }, 500)
    }
  })

  router.get('/backups/:id/download', async (c) => {
    const backup = getBackup(db, c.req.param('id'))
    if (!backup) return c.json({ error: 'Backup nggak ketemu' }, 404)

    const path = backupPath(backupDir, backup.filename)
    const file = Bun.file(path)
    if (!(await file.exists())) {
      return c.json({ error: 'File backup udah nggak ada di disk' }, 404)
    }

    return new Response(file, {
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${backup.filename}"`,
      },
    })
  })

  router.delete('/backups/:id', (c) => {
    const id = c.req.param('id')
    const backup = getBackup(db, id)
    if (!backup) return c.json({ error: 'Backup nggak ketemu' }, 404)

    deleteBackupRecord(db, id)
    return c.json({ ok: true })
  })

  /**
   * Restore dari file backup yang di-upload. Isinya dikirim lewat stdin
   * ke psql/mysql client di dalem container — bukan ditulis ke disk dulu,
   * biar nggak perlu nampung file gede.
   */
  router.post('/databases/:id/restore', async (c) => {
    const id = c.req.param('id')
    const record = getDatabase(db, id)
    if (!record) return c.json({ error: 'Database nggak ketemu' }, 404)

    const engine = record.engine as DbEngine
    if (!canRestore(engine)) {
      return c.json({ error: `Restore belum didukung buat ${engine}` }, 400)
    }

    const isi = await c.req.text()
    const valid = validateBackupContent(engine, isi)
    if (!valid.ok) return c.json({ error: valid.reason }, 400)

    const cmd = restoreCommand({
      engine,
      containerName: dbContainerName(record.id),
      user: record.db_user,
      dbName: record.db_name,
    })
    if (!cmd) return c.json({ error: 'Engine itu nggak didukung' }, 400)

    try {
      await runDenganInput(cmd.cmd, cmd.args, isi, 30 * 60 * 1000)
      return c.json({ ok: true, pesan: 'Data-nya udah di-restore.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: `Restore gagal: ${message}` }, 500)
    }
  })

  // --- Backup otomatis terjadwal ---------------------------------------

  router.get('/backup-schedule', (c) => {
    return c.json(backupScheduleInfo(db))
  })

  router.post('/backup-schedule', async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      intervalHours?: number
    } | null

    const jam = Number(body?.intervalHours ?? 0)
    if (!Number.isFinite(jam) || jam < 0 || jam > 24 * 30) {
      return c.json({ error: 'Interval-nya harus 0 sampai 720 jam' }, 400)
    }

    setBackupIntervalHours(db, jam)
    return c.json({ ok: true, ...backupScheduleInfo(db) })
  })

  router.post('/backup-schedule/run', async (c) => {
    // Dijalanin manual: intervalnya dipaksa 1 jam dan waktu terakhirnya
    // dianggap udah lewat, jadi selalu due. Ngandelin nilai interval yang
    // disimpen nggak bisa — kalau fiturnya dimatiin (0), nggak bakal due.
    const hasil = await runAutoBackup({
      db,
      dataDir: deps.dataDir,
      cryptoKey,
      force: true,
    })
    return c.json(hasil)
  })

  return router
}
