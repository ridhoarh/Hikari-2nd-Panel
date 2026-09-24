import type Docker from 'dockerode'
import { containerName, getDocker } from './client'

export const DEFAULT_MEMORY_MB = 512

export type RunOptions = {
  appSlug: string
  image: string
  containerPort: number
  env: Record<string, string>
  memoryLimitMb: number
  cpuLimit: number
  network: string
  labels?: Record<string, string>
}

export function buildContainerConfig(opts: RunOptions): Docker.ContainerCreateOptions {
  const memoryMb =
    Number.isFinite(opts.memoryLimitMb) && opts.memoryLimitMb > 0
      ? opts.memoryLimitMb
      : DEFAULT_MEMORY_MB

  const cpuNano = Math.round(
    (Number.isFinite(opts.cpuLimit) && opts.cpuLimit > 0 ? opts.cpuLimit : 1) * 1_000_000_000
  )

  return {
    name: containerName(opts.appSlug),
    Image: opts.image,
    Env: Object.entries(opts.env).map(([k, v]) => `${k}=${v}`),
    Labels: { 'hikari.managed': 'true', 'hikari.app': opts.appSlug, ...opts.labels },
    ExposedPorts: { [`${opts.containerPort}/tcp`]: {} },
    HostConfig: {
      Memory: memoryMb * 1024 * 1024,
      MemorySwap: memoryMb * 1024 * 1024,
      NanoCpus: cpuNano,
      NetworkMode: opts.network,
      AutoRemove: false,
      RestartPolicy: { Name: 'unless-stopped' },
      PortBindings: {
        [`${opts.containerPort}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: '' }],
      },
    },
  }
}

export async function runContainer(
  opts: RunOptions,
  docker: Docker = getDocker()
): Promise<string> {
  await removeContainer(docker, opts.appSlug).catch(() => undefined)
  const container = await docker.createContainer(buildContainerConfig(opts))
  await container.start()
  return container.id
}

export async function stopContainer(
  docker: Docker,
  appSlug: string
): Promise<void> {
  try {
    await docker.getContainer(containerName(appSlug)).stop({ t: 10 })
  } catch {
    // container emang udah mati atau nggak ada
  }
}

export async function removeContainer(
  docker: Docker,
  appSlug: string
): Promise<void> {
  try {
    const container = docker.getContainer(containerName(appSlug))
    await container.stop({ t: 5 }).catch(() => undefined)
    await container.remove({ force: true, v: false })
  } catch {
    // nggak ada container, nggak apa-apa
  }
}

export async function inspectContainer(
  docker: Docker,
  appSlug: string
): Promise<{ running: boolean; startedAt?: string } | null> {
  try {
    const info = await docker.getContainer(containerName(appSlug)).inspect()
    return { running: info.State.Running, startedAt: info.State.StartedAt }
  } catch {
    return null
  }
}
