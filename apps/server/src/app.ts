import { Hono } from 'hono'
import { openDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { loadOrCreateKey } from './lib/crypto'
import { HIKARI_VERSION } from './lib/version'
import { createAuthRoutes } from './routes/auth'
import { createProjectRoutes } from './routes/projects'
import { createAppRoutes } from './routes/apps'
import { requireAuth } from './middleware/auth'

export type AppConfig = {
  dbPath: string
  keyPath: string
  port: number
  deployKeyDir?: string
  onDeploy?: (appId: string) => void
  onDomainChange?: () => void
}

export function createApp(config: AppConfig): Hono {
  const db = openDatabase(config.dbPath)
  runMigrations(db)
  const cryptoKey = loadOrCreateKey(config.keyPath)

  const app = new Hono()

  app.get('/api/health', (c) => c.json({ status: 'ok', version: HIKARI_VERSION }))
  app.route('/api', createAuthRoutes(db, cryptoKey))

  const auth = requireAuth(db, cryptoKey)
  app.use('/api/projects', auth)
  app.use('/api/projects/*', auth)
  app.use('/api/apps/*', auth)

  app.route('/api', createProjectRoutes(db))
  app.route(
    '/api',
    createAppRoutes({
      db,
      cryptoKey,
      deployKeyDir: config.deployKeyDir ?? '/var/lib/hikari/keys',
      onDeploy: config.onDeploy ?? (() => undefined),
      onDomainChange: config.onDomainChange ?? (() => undefined),
    })
  )

  app.notFound((c) => c.json({ error: 'Nggak ketemu' }, 404))

  app.onError((err, c) => {
    console.error('[hikari] error:', err)
    return c.json({ error: 'Ada yang salah di server' }, 500)
  })

  return app
}
