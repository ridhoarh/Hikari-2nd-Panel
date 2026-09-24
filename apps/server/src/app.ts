import { Hono } from 'hono'
import { openDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { HIKARI_VERSION } from './lib/version'

export type AppConfig = {
  dbPath: string
  keyPath: string
  port: number
}

export function createApp(config: AppConfig): Hono {
  const db = openDatabase(config.dbPath)
  runMigrations(db)

  const app = new Hono()

  app.get('/api/health', (c) => c.json({ status: 'ok', version: HIKARI_VERSION }))

  app.notFound((c) => c.json({ error: 'Nggak ketemu' }, 404))

  app.onError((err, c) => {
    console.error('[hikari] error:', err)
    return c.json({ error: 'Ada yang salah di server' }, 500)
  })

  return app
}
