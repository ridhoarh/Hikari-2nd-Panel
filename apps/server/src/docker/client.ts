import Docker from 'dockerode'

let instance: Docker | null = null

export function getDocker(): Docker {
  if (!instance) {
    instance = new Docker({ socketPath: '/var/run/docker.sock' })
  }
  return instance
}

export async function pingDocker(docker: Docker = getDocker()): Promise<boolean> {
  try {
    await docker.ping()
    return true
  } catch {
    return false
  }
}

export function containerName(appSlug: string): string {
  return `hikari-app-${appSlug}`
}

export function imageTag(appSlug: string, deploymentId: string): string {
  return `hikari-${appSlug}:${deploymentId}`
}

export function networkName(): string {
  return 'hikari'
}
