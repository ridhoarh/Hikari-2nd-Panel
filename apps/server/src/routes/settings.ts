import { Hono } from 'hono'
import { totalmem, freemem } from 'node:os'
import type { Database } from '../db/client'
import { HIKARI_VERSION } from '../lib/version'
import { getDocker, pingDocker } from '../docker/client'

const MB = 1024 * 1024

export type SettingsDeps = {
  db: Database
  dataDir: string
  onSyncCaddy: () => void
}

export function createSettingsRoutes(deps: SettingsDeps): Hono {
  const router = new Hono()

  router.get('/settings', async (c) => {
    const dockerAvailable = await pingDocker(getDocker())
    return c.json({
      version: HIKARI_VERSION,
      dataDir: deps.dataDir,
      dockerAvailable,
      ramUsedMb: Math.round((totalmem() - freemem()) / MB),
      ramTotalMb: Math.round(totalmem() / MB),
    })
  })

  router.post('/settings/sync-caddy', (c) => {
    deps.onSyncCaddy()
    return c.json({ ok: true })
  })

  return router
}
