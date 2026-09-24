import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type Docker from 'dockerode'
import type { Database } from '../db/client'
import { imageTag } from '../docker/client'
import { appendBuildLog } from '../repositories/deployments'
import type { App } from '../repositories/apps'
import { builderName, ensureBuildKit, stopBuildKit } from './buildkit'
import { BATAS_PULL_MS, run } from './exec'
import { cloneRepo } from './git'
import { chooseBuildPlan, dockerBuildArgs, railpackArgs } from './strategy'

export { BATAS_BUILD_MS, BATAS_PULL_MS, run } from './exec'

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

export function createBuildFn(
  deps: ExecuteDeps
): (app: App, deploymentId: string) => Promise<{ imageTag: string }> {
  return async function build(app, deploymentId) {
    const tag = imageTag(app.slug, deploymentId)
    const latest = latestTagFor(app.slug)

    const jalankan = (
      cmd: string,
      args: string[],
      opts: Parameters<typeof run>[2] = {}
    ) =>
      run(cmd, args, {
        ...opts,
        onLine: (line) => appendBuildLog(deps.logDir, deploymentId, line),
      })

    // App dari registry: nggak usah build, cukup pull.
    if (app.source_type === 'image') {
      if (!app.image_ref) throw new Error('App dari image nggak punya image_ref')
      await jalankan('docker', ['pull', app.image_ref], { timeoutMs: BATAS_PULL_MS })
      await jalankan('docker', ['tag', app.image_ref, tag])
      await jalankan('docker', ['tag', app.image_ref, latest])
      return { imageTag: tag }
    }

    if (!app.repo_url) throw new Error('App git nggak punya repo_url')

    const privateKeyPath = join(deps.deployKeyDir, app.slug)

    const cloned = await cloneRepo({
      repoUrl: app.repo_url,
      branch: app.branch ?? 'main',
      privateKeyPath,
      knownHostsPath: deps.knownHostsPath,
      workDir: deps.workDir,
      appSlug: app.slug,
      deploymentId,
    })

    appendBuildLog(
      deps.logDir,
      deploymentId,
      `Commit: ${cloned.commitSha} — ${cloned.commitMessage}`
    )

    const contextDir = join(cloned.repoDir, app.root_dir)
    const dockerfileFull = join(contextDir, app.dockerfile_path)

    const plan = chooseBuildPlan({
      sourceType: app.source_type,
      imageRef: app.image_ref,
      dockerfilePath: app.dockerfile_path,
      dockerfileExists: existsSync(dockerfileFull),
      preferred: app.build_strategy,
    })

    appendBuildLog(deps.logDir, deploymentId, `Cara build: ${plan.kind}`)

    // BuildKit cuma nyala pas build, terus dimatiin lagi biar RAM-nya balik.
    await ensureBuildKit()
    try {
      if (plan.kind === 'dockerfile') {
        await jalankan(
          'docker',
          dockerBuildArgs({
            contextDir,
            // Absolut, biar buildx nggak nyari relatif ke cwd proses.
            dockerfile: dockerfileFull,
            tag,
            builder: builderName(),
          })
        )
      } else {
        await jalankan('railpack', railpackArgs({ contextDir, tag }), {
          cwd: contextDir,
        })
      }
    } finally {
      await stopBuildKit()
    }

    if (shouldTagLatest(plan.kind)) {
      await jalankan('docker', ['tag', tag, latest])
    }

    appendBuildLog(deps.logDir, deploymentId, `Image siap: ${tag}`)
    return { imageTag: tag }
  }
}
