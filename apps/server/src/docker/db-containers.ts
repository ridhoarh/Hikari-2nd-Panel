import type Docker from 'dockerode'
import { ENGINES, redisArgs, type DbEngine } from '../lib/db-engines'
import { getDocker, networkName } from './client'

export type DbAccessMode = 'internal' | 'tunnel' | 'public' | 'domain'

export type DbRunOptions = {
  id: string
  name: string
  engine: DbEngine
  version: string
  dbName: string
  dbUser: string
  password: string
  volumeName: string
  containerPort: number
  hostPort: number
  accessMode: DbAccessMode
  memoryLimitMb: number
}

const DEFAULT_MEMORY_MB = 512

export function dbContainerName(id: string): string {
  return `hikari-db-${id.toLowerCase()}`
}

export function dbVolumeName(volumeName: string): string {
  return volumeName
}

/**
 * Mode akses diterjemahin jadi HostIp:
 * - internal & tunnel: cuma dari dalam VPS
 * - domain: tetap di dalam, karena Caddy yang nerusin dari luar
 * - public: kebuka ke internet
 */
function hostIpUntuk(mode: DbAccessMode): string {
  return mode === 'public' ? '0.0.0.0' : '127.0.0.1'
}

export function buildDbContainerConfig(
  opts: DbRunOptions
): Docker.ContainerCreateOptions {
  const spec = ENGINES[opts.engine]

  const memoryMb =
    Number.isFinite(opts.memoryLimitMb) && opts.memoryLimitMb > 0
      ? opts.memoryLimitMb
      : DEFAULT_MEMORY_MB

  const keyPort = `${opts.containerPort}/tcp`

  return {
    name: dbContainerName(opts.id),
    Image: spec.image(opts.version),
    Env: Object.entries(
      spec.env({
        user: opts.dbUser,
        password: opts.password,
        dbName: opts.dbName,
      })
    ).map(([k, v]) => `${k}=${v}`),
    ...(opts.engine === 'redis' ? { Cmd: redisArgs(opts.password) } : {}),
    Labels: {
      'hikari.managed': 'true',
      'hikari.db': opts.id,
      'hikari.db.engine': opts.engine,
    },
    ExposedPorts: { [keyPort]: {} },
    HostConfig: {
      Memory: memoryMb * 1024 * 1024,
      MemorySwap: memoryMb * 1024 * 1024,
      NetworkMode: networkName(),
      AutoRemove: false,
      RestartPolicy: { Name: 'unless-stopped' },
      Binds: [`${opts.volumeName}:${spec.dataDir}`],
      PortBindings: {
        [keyPort]: [
          { HostIp: hostIpUntuk(opts.accessMode), HostPort: String(opts.hostPort) },
        ],
      },
    },
  }
}

/**
 * Jalanin container database. Selalu dibikin ulang (bukan restart) karena
 * pemetaan port nggak bisa diubah di container yang udah jadi — dan ganti
 * mode akses berarti ganti pemetaan port.
 *
 * Volume-nya SENGAJA nggak dihapus (`v: false`), jadi data tetap ada walau
 * container-nya diganti.
 */
export async function runDbContainer(
  opts: DbRunOptions,
  docker: Docker = getDocker()
): Promise<string> {
  // Container lama dibuang dulu, tapi volume-nya DIBIARKAN — data user aman.
  await hapusDbContainer(docker, opts.id)

  await docker.createNetwork({ Name: networkName(), Driver: 'bridge' }).catch(() => {
    // network-nya emang udah ada, nggak apa-apa
  })

  const key = `${opts.containerPort}/tcp`

  // Bind port bisa gagal kalau port-nya kepake proses lain, ATAU kalau ada
  // container sisa yang masih nyantolin port yang sama. Kalau kejadian,
  // container-nya udah keburu kebikin dalam keadaan mati — dan itu bikin
  // percobaan berikutnya gagal lagi dengan error yang sama. Jadi kalau
  // start-nya gagal, container-nya dibuang biar nggak nyangkut.
  const container = await docker.createContainer(buildDbContainerConfig(opts))

  try {
    await container.start()
  } catch (err) {
    await container.remove({ force: true, v: false }).catch(() => undefined)

    const pesan = err instanceof Error ? err.message : String(err)
    if (/port is already allocated|address already in use/i.test(pesan)) {
      throw new Error(
        `Port host ${opts.hostPort} udah kepake. Biasanya karena ada database ` +
          `lain yang masih jalan, atau container sisa dari percobaan sebelumnya. ` +
          `Cek: docker ps -a | grep ${opts.hostPort}`
      )
    }
    throw err
  }

  return container.id
}

export async function hapusDbContainer(
  docker: Docker,
  id: string
): Promise<void> {
  try {
    const container = docker.getContainer(dbContainerName(id))
    await container.stop({ t: 5 }).catch(() => undefined)
    // v: false — volume jangan dihapus. Data user aman.
    await container.remove({ force: true, v: false })
  } catch {
    // nggak ada container, nggak apa-apa
  }
}

export async function stopDbContainer(
  docker: Docker,
  id: string
): Promise<void> {
  try {
    await docker.getContainer(dbContainerName(id)).stop({ t: 10 })
  } catch {
    // emang udah mati atau nggak ada
  }
}

export async function inspectDbContainer(
  docker: Docker,
  id: string
): Promise<{ running: boolean; startedAt?: string } | null> {
  try {
    const info = await docker.getContainer(dbContainerName(id)).inspect()
    return { running: info.State.Running, startedAt: info.State.StartedAt }
  } catch {
    return null
  }
}

/** Hapus volume. Dipanggil cuma kalau user minta konfirmasi terpisah. */
export async function hapusVolume(
  docker: Docker,
  volumeName: string
): Promise<boolean> {
  try {
    await docker.getVolume(volumeName).remove()
    return true
  } catch {
    return false
  }
}
