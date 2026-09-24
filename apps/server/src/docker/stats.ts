import type Docker from 'dockerode'
import { containerName } from './client'

export type ContainerStats = {
  cpuPercent: number
  memoryUsedMb: number
  memoryLimitMb: number
  memoryPercent: number
}

type RawStats = {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number }
    system_cpu_usage?: number
    online_cpus?: number
  }
  precpu_stats?: {
    cpu_usage?: { total_usage?: number }
    system_cpu_usage?: number
  }
  memory_stats?: { usage?: number; limit?: number }
}

const MB = 1024 * 1024

export function parseStats(raw: RawStats): ContainerStats {
  const cpuDelta =
    (raw.cpu_stats?.cpu_usage?.total_usage ?? 0) -
    (raw.precpu_stats?.cpu_usage?.total_usage ?? 0)
  const systemDelta =
    (raw.cpu_stats?.system_cpu_usage ?? 0) - (raw.precpu_stats?.system_cpu_usage ?? 0)
  const cores = raw.cpu_stats?.online_cpus ?? 1

  const cpuPercent =
    systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * cores * 100 : 0

  const usage = raw.memory_stats?.usage ?? 0
  const limit = raw.memory_stats?.limit ?? 0

  return {
    cpuPercent: Math.round(cpuPercent * 100) / 100,
    memoryUsedMb: Math.round((usage / MB) * 100) / 100,
    memoryLimitMb: Math.round((limit / MB) * 100) / 100,
    memoryPercent: limit > 0 ? Math.round((usage / limit) * 10000) / 100 : 0,
  }
}

export async function getContainerStats(
  docker: Docker,
  appSlug: string
): Promise<ContainerStats | null> {
  try {
    const container = docker.getContainer(containerName(appSlug))
    const info = await container.inspect()
    if (!info.State.Running) return null

    const raw = (await container.stats({ stream: false })) as RawStats
    return parseStats(raw)
  } catch {
    return null
  }
}
