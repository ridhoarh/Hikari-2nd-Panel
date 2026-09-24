import type { App } from '../repositories/apps'
import { deployApp, type DeployDeps } from './pipeline'
import { createBuildQueue } from './queue'

export type DeployQueueDeps = {
  db: DeployDeps['db']
  docker: DeployDeps['docker']
  cryptoKey: Buffer
  logDir: string
  workDir: string
  buildFn: (app: App, deploymentId: string) => Promise<{ imageTag: string }>
  onDeploySuccess?: () => void
}

/**
 * Antrean deploy: cuma satu build jalan sekaligus, sisanya nunggu FIFO.
 * Bungkus tipis di atas createBuildQueue yang udah dites.
 */
export function createDeployQueue(deps: DeployQueueDeps) {
  return createBuildQueue<string>(async (appId) => {
    const hasil = await deployApp(
      {
        db: deps.db,
        docker: deps.docker,
        cryptoKey: deps.cryptoKey,
        logDir: deps.logDir,
        workDir: deps.workDir,
        buildFn: deps.buildFn,
        onDeploySuccess: deps.onDeploySuccess,
      },
      appId
    )

    // Kegagalan deploy itu data, bukan exception — tandain di log aja.
    // deployApp udah nyatet statusnya di database.
    if (!hasil.ok) {
      console.error(`[hikari] deploy ${appId} gagal: ${hasil.error}`)
    }
  })
}
