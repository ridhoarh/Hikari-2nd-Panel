import { Hono } from 'hono'
import { join } from 'node:path'
import { createBuildFn } from './build/execute'
import { createDeployQueue } from './build/deploy-queue'
import { syncCaddy } from './caddy/service'
import { openDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { getDocker } from './docker/client'
import { loadOrCreateKey } from './lib/crypto'
import { HIKARI_VERSION } from './lib/version'
import { requireAuth } from './middleware/auth'
import { createAppRoutes } from './routes/apps'
import { createAuthRoutes } from './routes/auth'
import { createProjectRoutes } from './routes/projects'
import { createSettingsRoutes } from './routes/settings'
import { createWebhookInfoRoute, createWebhookRoutes } from './routes/webhooks'
import { mountStatic } from './static'

/**
 * Handler rute dikumpulin di satu objek deps, bukan argumen posisional.
 * Nambah field nggak bikin signature pecah.
 */
export type AppConfig = {
  dbPath: string
  keyPath: string
  port: number
  dataDir?: string
  staticDir?: string
  caddyfilePath?: string
  panelDomain?: string | null
  acmeEmail?: string
}

export function createApp(config: AppConfig): Hono {
  const dataDir = config.dataDir ?? '/var/lib/hikari'

  const db = openDatabase(config.dbPath)
  runMigrations(db)
  const cryptoKey = loadOrCreateKey(config.keyPath)

  const deployKeyDir = join(dataDir, 'keys')
  const logDir = join(dataDir, 'logs')
  const workDir = join(dataDir, 'work')
  const knownHostsPath = join(dataDir, 'known_hosts')

  const docker = getDocker()

  // Satu fungsi sync Caddy dipakai bareng oleh onDomainChange dan tombol di
  // halaman settings, biar argumennya nggak ditulis dua kali.
  const syncCaddySekarang = () => {
    void syncCaddy({
      db,
      caddyfilePath: config.caddyfilePath ?? '/etc/caddy/Caddyfile',
      panelPort: config.port,
      panelDomain: config.panelDomain ?? null,
      adminUrl: 'http://127.0.0.1:2019/load',
      acmeEmail: config.acmeEmail,
    }).catch((err) => console.error('[hikari] sync caddy gagal:', err))
  }

  const queue = createDeployQueue({
    db,
    docker,
    cryptoKey,
    logDir,
    workDir,
    buildFn: createBuildFn({
      db,
      docker,
      logDir,
      workDir,
      deployKeyDir,
      knownHostsPath,
    }),
  })

  const app = new Hono()

  // --- Health ---------------------------------------------------------
  app.get('/api/health', (c) => c.json({ status: 'ok', version: HIKARI_VERSION }))

  // --- Auth (publik) ---------------------------------------------------
  app.route('/api', createAuthRoutes(db, cryptoKey))

  // --- Webhook (publik, dijaga HMAC sendiri) ---------------------------
  // Middleware di Hono match berdasarkan prefix path, jadi /api/webhooks
  // nggak pernah kena requireAuth di bawah ini.
  app.route(
    '/api',
    createWebhookRoutes({ db, onPush: (appId) => void queue.enqueue(appId) })
  )

  // --- Semua sisanya butuh login --------------------------------------
  const auth = requireAuth(db, cryptoKey)
  app.use('/api/projects', auth)
  app.use('/api/projects/*', auth)
  app.use('/api/apps/*', auth)

  app.route('/api', createProjectRoutes(db))
  app.route('/api', createWebhookInfoRoute(db))
  app.route(
    '/api',
    createSettingsRoutes({ db, dataDir, onSyncCaddy: syncCaddySekarang })
  )
  app.route(
    '/api',
    createAppRoutes({
      db,
      cryptoKey,
      deployKeyDir,
      onDeploy: (appId) => void queue.enqueue(appId),
      onDomainChange: syncCaddySekarang,
    })
  )

  // --- Frontend statis -------------------------------------------------
  // Harus SEBELUM notFound. Kalau setelahnya, route SPA bakal ketelen
  // notFound dan browser dapet JSON 404, bukan index.html.
  if (config.staticDir) {
    mountStatic(app, config.staticDir)
  }

  app.notFound((c) => c.json({ error: 'Nggak ketemu' }, 404))

  app.onError((err, c) => {
    console.error('[hikari] error:', err)
    return c.json({ error: 'Ada yang salah di server' }, 500)
  })

  return app
}
