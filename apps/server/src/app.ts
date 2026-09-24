import { Hono } from 'hono'
import { openDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { loadOrCreateKey } from './lib/crypto'
import { HIKARI_VERSION } from './lib/version'
import { createAuthRoutes } from './routes/auth'
import { createProjectRoutes } from './routes/projects'
import { requireAuth } from './middleware/auth'

export type AppConfig = {
  dbPath: string
  keyPath: string
  port: number
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

  app.route('/api', createProjectRoutes(db))

  app.notFound((c) => c.json({ error: 'Nggak ketemu' }, 404))

  app.onError((err, c) => {
    console.error('[hikari] error:', err)
    return c.json({ error: 'Ada yang salah di server' }, 500)
  })

  return app
}
