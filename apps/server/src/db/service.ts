import type Docker from 'dockerode'
import {
  buildConnectionString,
  buildSshTunnel,
  ENGINES,
  type DbEngine,
} from '../lib/db-engines'
import { decrypt } from '../lib/crypto'
import type { Database } from '../db/client'
import { getDocker } from '../docker/client'
import {
  dbContainerName,
  hapusDbContainer,
  hapusVolume,
  inspectDbContainer,
  runDbContainer,
  stopDbContainer,
} from '../docker/db-containers'
import {
  getDatabase,
  setAccessMode,
  setDbStatus,
  type AccessMode,
  type DbRecord,
} from '../repositories/databases'

export type DbInfo = {
  connectionString: string
  tunnelCommand: string | null
  endpoint: { host: string; port: number }
  warnings: string[]
}

/**
 * Terjemahin record database jadi info yang bisa dipakai user: connection
 * string, perintah tunnel, dan peringatan.
 *
 * Host yang dipakai BEDA per mode, dan itu penting:
 * - internal/tunnel/domain: `127.0.0.1` — dari sisi user, dia nyambung ke
 *   port host di VPS-nya sendiri.
 * - public: alamat IP VPS atau domain, karena tujuannya dari luar.
 */
export function describeDatabase(
  record: DbRecord,
  opts: { vpsIp?: string; cryptoKey: Buffer }
): DbInfo {
  const password = decrypt(record.password, opts.cryptoKey)

  const lewatDomain = record.access_mode === 'domain' && record.expose_domain
  const lewatPublicIp = record.access_mode === 'public'

  const host = lewatDomain
    ? (record.expose_domain as string)
    : lewatPublicIp
      ? (opts.vpsIp ?? 'ip-vps-kamu')
      : '127.0.0.1'

  const tls = Boolean(lewatDomain)

  const connectionString = buildConnectionString({
    engine: record.engine,
    user: record.db_user,
    password,
    dbName: record.db_name,
    host,
    port: record.host_port,
    tls,
  })

  const warnings: string[] = []
  if (record.access_mode === 'public') {
    warnings.push(
      'Port ini kebuka ke internet. Bot bakal nyoba masuk terus-terusan. ' +
        'Pastiin password-nya kuat dan cuma dipakai kalau perlu.'
    )
  }
  if (lewatDomain) {
    warnings.push(
      'Pakai domain BUKAN berarti aman. Bot tetap nyoba masuk lewat IP:port. ' +
        'Domain cuma bikin alamatnya lebih enak dibaca.'
    )
  }
  if (record.engine === 'redis' && record.access_mode === 'public') {
    warnings.push('Redis tanpa TLS: password dikirim apa adanya di jaringan publik.')
  }

  return {
    connectionString,
    tunnelCommand:
      record.access_mode === 'tunnel'
        ? buildSshTunnel({
            hostPort: record.host_port,
            containerPort: record.container_port,
          })
        : null,
    endpoint: { host, port: record.host_port },
    warnings,
  }
}

export type DbServiceDeps = {
  db: Database
  docker?: Docker
}

function toRunOptions(
  record: DbRecord,
  cryptoKey: Buffer
): Parameters<typeof runDbContainer>[0] {
  return {
    id: record.id,
    name: record.name,
    engine: record.engine as DbEngine,
    version: record.version,
    dbName: record.db_name,
    dbUser: record.db_user,
    password: decrypt(record.password, cryptoKey),
    volumeName: record.volume_name,
    containerPort: record.container_port,
    hostPort: record.host_port,
    accessMode: record.access_mode,
    memoryLimitMb: record.memory_limit_mb,
  }
}

/** Nyalain database: bikin container (kalau perlu) terus start. */
export async function startDatabase(
  deps: DbServiceDeps,
  id: string,
  cryptoKey: Buffer
): Promise<void> {
  const docker = deps.docker ?? getDocker()
  const record = getDatabase(deps.db, id)
  if (!record) throw new Error('Database nggak ketemu')

  await runDbContainer(toRunOptions(record, cryptoKey), docker)
  setDbStatus(deps.db, id, 'running')
}

export async function stopDatabase(
  deps: DbServiceDeps,
  id: string
): Promise<void> {
  const docker = deps.docker ?? getDocker()
  await stopDbContainer(docker, id)
  setDbStatus(deps.db, id, 'stopped')
}

/**
 * Ganti mode akses = bikin ulang container, karena pemetaan port nggak bisa
 * diubah di container yang udah jadi. Volume-nya tetap, jadi data aman.
 */
export async function changeAccessMode(
  deps: DbServiceDeps,
  id: string,
  mode: AccessMode,
  cryptoKey: Buffer,
  exposeDomain?: string | null
): Promise<void> {
  setAccessMode(deps.db, id, mode, exposeDomain)

  const record = getDatabase(deps.db, id)
  if (!record) throw new Error('Database nggak ketemu')

  // Cuma perlu bikin ulang kalau container-nya emang udah pernah jalan.
  const ada = await inspectDbContainer(deps.docker ?? getDocker(), id)
  if (ada) {
    await startDatabase(deps, id, cryptoKey)
  }
}

/**
 * Hapus database. Volume-nya SENGAJA nggak dihapus — data user bisa hilang
 * gara-gara salah klik. Hapus volume harus lewat fungsi terpisah yang
 * dipanggil setelah user konfirmasi.
 */
export async function destroyDatabase(
  deps: DbServiceDeps,
  id: string
): Promise<void> {
  await hapusDbContainer(deps.docker ?? getDocker(), id)
}

/** Hapus volume secara permanen. Cuma dipanggil setelah konfirmasi user. */
export async function destroyVolume(
  deps: DbServiceDeps,
  volumeName: string
): Promise<boolean> {
  return hapusVolume(deps.docker ?? getDocker(), volumeName)
}

export function containerNameFor(id: string): string {
  return dbContainerName(id)
}

export function imageFor(engine: DbEngine, version: string): string {
  return ENGINES[engine].image(version)
}
