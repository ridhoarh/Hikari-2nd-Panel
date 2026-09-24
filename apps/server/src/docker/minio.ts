import type Docker from 'dockerode'
import { getDocker, networkName } from './client'

export const MINIO_CONTAINER = 'hikari-minio'
export const MINIO_VOLUME = 'hikari-minio-data'
export const MINIO_API_PORT = 9000
export const MINIO_CONSOLE_PORT = 9001
const DEFAULT_MEMORY_MB = 512

/** Endpoint buat app di VPS yang sama. */
export function minioEndpoint(): string {
  return `http://${MINIO_CONTAINER}:${MINIO_API_PORT}`
}

/** Endpoint buat dari luar VPS. */
export function minioPublicEndpoint(vpsIp?: string): string {
  return `http://${vpsIp ?? 'ip-vps-kamu'}:${MINIO_API_PORT}`
}

export function buildMinioConfig(opts: {
  rootUser: string
  rootPassword: string
  memoryLimitMb?: number
  publicApi?: boolean
}): Docker.ContainerCreateOptions {
  const memoryMb =
    Number.isFinite(opts.memoryLimitMb) && (opts.memoryLimitMb as number) > 0
      ? (opts.memoryLimitMb as number)
      : DEFAULT_MEMORY_MB

  const hostIp = opts.publicApi ? '0.0.0.0' : '127.0.0.1'

  return {
    name: MINIO_CONTAINER,
    Image: 'minio/minio:latest',
    Cmd: ['server', '/data', '--console-address', `:${MINIO_CONSOLE_PORT}`],
    Env: [
      `MINIO_ROOT_USER=${opts.rootUser}`,
      `MINIO_ROOT_PASSWORD=${opts.rootPassword}`,
    ],
    Labels: { 'hikari.managed': 'true', 'hikari.service': 'minio' },
    ExposedPorts: {
      [`${MINIO_API_PORT}/tcp`]: {},
      [`${MINIO_CONSOLE_PORT}/tcp`]: {},
    },
    HostConfig: {
      Memory: memoryMb * 1024 * 1024,
      MemorySwap: memoryMb * 1024 * 1024,
      NetworkMode: networkName(),
      AutoRemove: false,
      RestartPolicy: { Name: 'unless-stopped' },
      // Volume-nya awet: data bucket nggak ilang walau container diganti.
      Binds: [`${MINIO_VOLUME}:/data`],
      PortBindings: {
        [`${MINIO_API_PORT}/tcp`]: [
          { HostIp: hostIp, HostPort: String(MINIO_API_PORT) },
        ],
        [`${MINIO_CONSOLE_PORT}/tcp`]: [
          { HostIp: '127.0.0.1', HostPort: String(MINIO_CONSOLE_PORT) },
        ],
      },
    },
  }
}

export async function ensureMinio(
  docker: Docker = getDocker(),
  opts: { rootUser?: string; rootPassword?: string; publicApi?: boolean } = {}
): Promise<void> {
  try {
    const info = await docker.getContainer(MINIO_CONTAINER).inspect()
    if (info.State.Running) return
    await docker.getContainer(MINIO_CONTAINER).remove({ force: true })
  } catch {
    // belum ada, lanjut bikin
  }

  await docker.createNetwork({ Name: networkName(), Driver: 'bridge' }).catch(() => {
    // network udah ada
  })

  await docker.createContainer(
    buildMinioConfig({
      rootUser: opts.rootUser ?? 'hikari',
      rootPassword: opts.rootPassword ?? 'ganti-password-ini',
      publicApi: opts.publicApi,
    })
  )

  await docker.getContainer(MINIO_CONTAINER).start()
}

export async function stopMinio(docker: Docker = getDocker()): Promise<void> {
  try {
    await docker.getContainer(MINIO_CONTAINER).stop({ t: 10 })
  } catch {
    // emang udah mati
  }
}

export async function inspectMinio(
  docker: Docker = getDocker()
): Promise<{ running: boolean; startedAt?: string } | null> {
  try {
    const info = await docker.getContainer(MINIO_CONTAINER).inspect()
    return { running: info.State.Running, startedAt: info.State.StartedAt }
  } catch {
    return null
  }
}
