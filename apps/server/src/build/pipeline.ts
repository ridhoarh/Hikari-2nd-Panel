import type Docker from 'dockerode'
import type { Database } from '../db/client'
import {
  inspectContainer,
  removeContainer,
  runContainer,
  stopContainer,
} from '../docker/containers'
import {
  ensureNetwork,
  pruneBuildLogs,
  pruneImages,
  pruneOldDeployments,
} from '../docker/maintenance'
import { nowIso } from '../lib/id'
import type { App } from '../repositories/apps'
import { getApp, setAppStatus } from '../repositories/apps'
import {
  createDeployment,
  pruneOldDeploymentsIn,
  setDeploymentStatus,
} from '../repositories/deployments'
import { resolveEnvVars } from '../repositories/env-vars'

const SIMPAN_LOG_DEPLOYMENT = 50
const BATAS_USIA_LOG_HARI = 30

export type DeployDeps = {
  db: Database
  docker: Docker
  cryptoKey: Buffer
  logDir: string
  workDir: string
  buildFn: (app: App, deploymentId: string) => Promise<{ imageTag: string }>
}

export type DeployResult = { deploymentId: string; ok: boolean; error?: string }

export function markDeployResult(
  db: Database,
  deploymentId: string,
  appId: string,
  result: { ok: true; imageTag: string } | { ok: false; error: string }
): void {
  const app = getApp(db, appId)

  if (result.ok) {
    setDeploymentStatus(db, deploymentId, 'success', {
      imageTag: result.imageTag,
      finishedAt: nowIso(),
    })
    setAppStatus(db, appId, 'running')
    return
  }

  setDeploymentStatus(db, deploymentId, 'failed', {
    error: result.error,
    finishedAt: nowIso(),
  })

  // Kalau app-nya sebelumnya JALAN, jangan diubah. Deploy gagal nggak boleh
  // bikin app yang hidup jadi mati. Status lain (stopped/building) berarti
  // app-nya emang belum pernah hidup, jadi failed itu jawaban yang jujur.
  if (app?.status !== 'running') {
    setAppStatus(db, appId, 'failed')
  }
}

export async function deployApp(
  deps: DeployDeps,
  appId: string
): Promise<DeployResult> {
  const { db, docker, cryptoKey, logDir } = deps

  const app = getApp(db, appId)
  if (!app) return { deploymentId: '', ok: false, error: 'App nggak ketemu' }

  const deployment = createDeployment(db, appId)
  setDeploymentStatus(db, deployment.id, 'building', { startedAt: nowIso() })
  setAppStatus(db, appId, 'building')

  try {
    await ensureNetwork(docker)

    const built = await deps.buildFn(app, deployment.id)
    setDeploymentStatus(db, deployment.id, 'deploying', { imageTag: built.imageTag })

    const env = resolveEnvVars(db, appId, cryptoKey)

    // Cek dulu container lamanya ada atau nggak, baru dimatiin. Kalau
    // dibalik, container yang ternyata nggak ada tetap kena `stop` dan
    // kita kehilangan informasi apakah app-nya sebelumnya jalan.
    const wasRunning = (await inspectContainer(docker, app.slug)) !== null

    if (wasRunning) {
      await stopContainer(docker, app.slug)
    }
    await removeContainer(docker, app.slug)

    await runContainer(
      {
        appSlug: app.slug,
        image: built.imageTag,
        containerPort: app.container_port,
        env,
        memoryLimitMb: app.memory_limit_mb,
        cpuLimit: app.cpu_limit,
        network: 'hikari',
      },
      docker
    )

    markDeployResult(db, deployment.id, appId, { ok: true, imageTag: built.imageTag })

    await pruneImages(docker).catch(() => undefined)
    pruneOldDeploymentsIn(db, appId, SIMPAN_LOG_DEPLOYMENT)

    // Pembersihan disk nempel di jalur deploy, bukan cron — sesuai prinsip
    // nggak ada proses yang nyala terus.
    pruneBuildLogs(logDir, BATAS_USIA_LOG_HARI)

    return { deploymentId: deployment.id, ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    markDeployResult(db, deployment.id, appId, { ok: false, error: message })
    return { deploymentId: deployment.id, ok: false, error: message }
  }
}
