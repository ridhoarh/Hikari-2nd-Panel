import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type Docker from 'dockerode'
import type { Database } from '../db/client'
import { imageTag } from '../docker/client'
import { appendBuildLog } from '../repositories/deployments'
import type { App } from '../repositories/apps'
import { buildkitHost, ensureBuildKit, stopBuildKit } from './buildkit'
import { cloneRepo } from './git'
import { chooseBuildPlan, dockerBuildArgs, railpackArgs } from './strategy'

/** Build boleh lama, tapi nggak boleh nggantung selamanya. */
export const BATAS_BUILD_MS = 30 * 60 * 1000
export const BATAS_PULL_MS = 10 * 60 * 1000

const BUFFER_MAX = 1024 * 1024
const EKOR_MAX = 16 * 1024

export function shouldTagLatest(kind: 'dockerfile' | 'railpack' | 'image'): boolean {
  return kind !== 'image'
}

export function latestTagFor(appSlug: string): string {
  return `hikari-${appSlug}:latest`
}

export type ExecuteDeps = {
  db: Database
  docker: Docker
  logDir: string
  workDir: string
  deployKeyDir: string
  knownHostsPath: string
}

/**
 * Jalanin proses tanpa nge-block event loop. `execFileSync` bikin seluruh
 * panel freeze selama build, jadi nggak boleh dipakai di jalur ini.
 *
 * Keluaran digabung stdout+stderr, dibatasi biar log raksasa nggak ngabisin
 * RAM, dan dipotong kalau lewat timeout.
 */
export async function run(
  cmd: string,
  args: string[],
  opts: {
    cwd?: string
    env?: Record<string, string>
    timeoutMs?: number
    onLine?: (line: string) => void
  } = {}
): Promise<string> {
  const proc = Bun.spawn([cmd, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  let awal = ''
  let ekor = ''
  let sisaBaris = ''

  function catat(text: string) {
    if (!opts.onLine) return
    sisaBaris += text
    const baris = sisaBaris.split('\n')
    sisaBaris = baris.pop() ?? ''
    for (const b of baris) opts.onLine(b)
  }

  async function baca(stream: ReadableStream<Uint8Array>) {
    const decoder = new TextDecoder()
    for await (const chunk of stream) {
      const text = decoder.decode(chunk, { stream: true })
      catat(text)
      if (awal.length + ekor.length > BUFFER_MAX) {
        awal += text
        awal = awal.slice(0, Math.max(0, BUFFER_MAX - EKOR_MAX))
      } else {
        ekor += text
      }
      if (ekor.length > EKOR_MAX) {
        awal += ekor.slice(0, ekor.length - EKOR_MAX)
        ekor = ekor.slice(-EKOR_MAX)
      }
    }
  }

  const batas = opts.timeoutMs ?? BATAS_BUILD_MS
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`${cmd} kelamaan, dimatiin setelah ${Math.round(batas / 60000)} menit`))
    }, batas)
  })

  try {
    await Promise.race([
      (async () => {
        await Promise.all([baca(proc.stdout), baca(proc.stderr)])
        const code = await proc.exited
        if (code !== 0) {
          throw new Error(`${cmd} gagal (exit ${code})\n${awal}${ekor}`)
        }
      })(),
      timeout,
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }

  return awal + ekor
}

export function createBuildFn(
  deps: ExecuteDeps
): (app: App, deploymentId: string) => Promise<{ imageTag: string }> {
  return async function build(app, deploymentId) {
    const tag = imageTag(app.slug, deploymentId)
    const latest = latestTagFor(app.slug)

    const catatLog = (line: string) => {
      appendBuildLog(deps.logDir, deploymentId, line)
    }

    const jalankan = (cmd: string, args: string[], opts: Parameters<typeof run>[2] = {}) =>
      run(cmd, args, { ...opts, onLine: catatLog })

    // App dari registry: nggak usah build, cukup pull.
    if (app.source_type === 'image') {
      if (!app.image_ref) throw new Error('App dari image nggak punya image_ref')
      catatLog(`Pull image: ${app.image_ref}`)
      await jalankan('docker', ['pull', app.image_ref], { timeoutMs: BATAS_PULL_MS })
      await jalankan('docker', ['tag', app.image_ref, tag])
      await jalankan('docker', ['tag', app.image_ref, latest])
      return { imageTag: tag }
    }

    if (!app.repo_url) throw new Error('App git nggak punya repo_url')

    const privateKeyPath = join(deps.deployKeyDir, app.slug)
    catatLog(`Clone ${app.repo_url} (${app.branch})`)

    const cloned = await cloneRepo({
      repoUrl: app.repo_url,
      branch: app.branch ?? 'main',
      privateKeyPath,
      knownHostsPath: deps.knownHostsPath,
      workDir: deps.workDir,
      appSlug: app.slug,
      deploymentId,
    })

    catatLog(`Commit: ${cloned.commitSha}`)

    const contextDir = join(cloned.repoDir, app.root_dir)
    const dockerfileFull = join(contextDir, app.dockerfile_path)

    const plan = chooseBuildPlan({
      sourceType: app.source_type,
      imageRef: app.image_ref,
      dockerfilePath: app.dockerfile_path,
      dockerfileExists: existsSync(dockerfileFull),
      preferred: app.build_strategy,
    })

    catatLog(`Cara build: ${plan.kind}`)

    // BuildKit cuma nyala pas build, terus dimatiin lagi biar RAM-nya balik.
    await ensureBuildKit(deps.docker)
    try {
      if (plan.kind === 'dockerfile') {
        const args = dockerBuildArgs({
          contextDir,
          dockerfile: app.dockerfile_path,
          tag,
          buildkitHost: buildkitHost(),
        })
        await jalankan('docker', args)
      } else {
        await jalankan('railpack', railpackArgs({ contextDir, tag }), {
          cwd: contextDir,
        })
      }
    } finally {
      await stopBuildKit(deps.docker).catch(() => undefined)
    }

    if (shouldTagLatest(plan.kind)) {
      await jalankan('docker', ['tag', tag, latest])
    }

    catatLog(`Image siap: ${tag}`)
    return { imageTag: tag }
  }
}
