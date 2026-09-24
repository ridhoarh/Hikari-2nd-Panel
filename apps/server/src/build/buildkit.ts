import type Docker from 'dockerode'

export const BUILDKIT_CONTAINER = 'hikari-buildkit'
export const BUILDKIT_MEMORY_MB = 768
export const BUILDKIT_VOLUME = 'hikari-buildkit-cache'

export function buildkitHost(): string {
  return `docker-container://${BUILDKIT_CONTAINER}`
}

/**
 * BuildKit cuma nyala pas ada build, terus dimatiin lagi. Container-nya
 * dibikin lewat dockerode (bukan `docker run`) biar batas RAM-nya kepasang
 * di level API, nggak lewat parsing argumen CLI.
 */
export async function ensureBuildKit(docker: Docker): Promise<void> {
  try {
    const info = await docker.getContainer(BUILDKIT_CONTAINER).inspect()
    if (info.State.Running) return
    await docker.getContainer(BUILDKIT_CONTAINER).remove({ force: true })
  } catch {
    // belum ada, lanjut bikin
  }

  await docker.createContainer({
    name: BUILDKIT_CONTAINER,
    Image: 'moby/buildkit:latest',
    HostConfig: {
      Privileged: true,
      AutoRemove: false,
      RestartPolicy: { Name: 'no' },
      Memory: BUILDKIT_MEMORY_MB * 1024 * 1024,
      // Swap = Memory, jadi limit-nya beneran limit, bukan pindah ke disk.
      MemorySwap: BUILDKIT_MEMORY_MB * 1024 * 1024,
      Binds: [`${BUILDKIT_VOLUME}:/var/lib/buildkit`],
    },
  })

  await docker.getContainer(BUILDKIT_CONTAINER).start()
}

export async function stopBuildKit(docker: Docker): Promise<void> {
  try {
    await docker.getContainer(BUILDKIT_CONTAINER).stop({ t: 5 })
  } catch {
    // emang udah mati
  }
}
