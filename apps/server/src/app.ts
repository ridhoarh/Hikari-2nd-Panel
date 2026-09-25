import { Hono } from 'hono'
import { join } from 'node:path'
import type { Database } from './db/client'
import { runAutoBackup } from './db/auto-backup'
import { createBuildFn } from './build/execute'
import {
  createInstallationToken,
  buildAppJwt,
  listInstallations,
  parseRepoFullName,
  pickInstallation,
} from './github/github-app'
import {
  getCachedToken,
  getGithubAppId,
  getGithubAppKey,
  setCachedToken,
} from './github/settings'
import { createDeployQueue } from './build/deploy-queue'
import { syncCaddy } from './caddy/service'
import { openDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { getDocker } from './docker/client'
import { hapusDbContainer } from './docker/db-containers'
import { loadOrCreateKey } from './lib/crypto'
import { HIKARI_VERSION } from './lib/version'
import { requireAuth } from './middleware/auth'
import { createAppRoutes } from './routes/apps'
import { createAuthRoutes } from './routes/auth'
import { createDatabaseRoutes } from './routes/databases'
import { createProjectRoutes } from './routes/projects'
import { createSettingsRoutes } from './routes/settings'
import { createStorageRoutes } from './routes/storage'
import { createWebhookInfoRoute, createWebhookRoutes } from './routes/webhooks'
import { createGitPushRoutes, setupRepoForApp } from './git-push/routes'
import { createCloudflareRoutes } from './cloudflare/routes'
import { createGithubRoutes } from './github/routes'
import { listApps } from './repositories/apps'
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
  /** Dipakai buat nampilin alamat yang bener di connection string publik. */
  vpsIp?: string
  /** Host & port yang dipakai buat nampilin URL git push ke user. */
  gitHost?: string
  gitPort?: number
}

/** Yang dipakai lagi di luar `createApp` (contoh: terminal WebSocket). */
export type AppInternals = {
  app: Hono
  db: Database
  docker: ReturnType<typeof getDocker>
  cryptoKey: Buffer
}

export function createApp(config: AppConfig): Hono {
  return createAppWithInternals(config).app
}

/**
 * Sama kayak `createApp`, tapi juga balikin handle database & Docker-nya.
 *
 * Dipakai `index.ts` buat nyambungin terminal WebSocket: handler-nya hidup
 * di luar Hono, jadi butuh akses ke database dan Docker yang **sama**
 * dengan yang dipakai HTTP. Buka database dua kali bikin dua sumber
 * kebenaran.
 */
export function createAppWithInternals(config: AppConfig): AppInternals {
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
      resolveGithubToken: async (repoUrl) => {
        const fullName = parseRepoFullName(repoUrl)
        if (!fullName) return null

        const appId = getGithubAppId(db)
        const privateKey = getGithubAppKey(db, cryptoKey)
        if (!appId || !privateKey) return null

        try {
          const jwt = buildAppJwt({ appId, privateKey })
          const list = await listInstallations({ jwt })
          if (!list.ok) return null

          const inst = pickInstallation(list.installations, new Set<number>())
          if (!inst) return null

          const cached = getCachedToken(inst.id)
          if (cached) return cached

          const token = await createInstallationToken({
            jwt,
            installationId: inst.id,
          })
          if (!token.ok || !token.token) return null

          setCachedToken(inst.id, token.token)
          return token.token
        } catch {
          // Token gagal diambil bukan error fatal: clone-nya bakal jatuh ke
          // deploy key. Yang penting errornya kelihatan di log build.
          return null
        }
      },
    }),
    onDeploySuccess: () => {
      // Backup terjadwal dicek di jalur deploy, bukan pakai timer.
      void runAutoBackup({ db, dataDir, cryptoKey }).catch((err) =>
        console.error('[hikari] backup otomatis gagal:', err)
      )
    },
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
  app.use('/api/databases/*', auth)
  app.use('/api/buckets/*', auth)
  app.use('/api/backups/*', auth)
  app.use('/api/storage/*', auth)
  app.use('/api/git/*', auth)
  app.use('/api/cloudflare/*', auth)
  app.use('/api/github/*', auth)
  // CATATAN: /api/git-push/* SENGAJA nggak lewat requireAuth. Yang manggil
  // itu hook post-receive dari shell, dan dia nggak punya cookie. Dijaga
  // pakai push-secret per app.

  app.route(
    '/api',
    createProjectRoutes({
      db,
      onProjectDeleted: (databases) => {
        // Container-nya dibersihin, tapi VOLUME-NYA DIBIARIN. Hapus volume
        // harus tindakan terpisah yang disengaja.
        for (const d of databases) {
          void hapusDbContainer(docker, d.id)
            .then(() =>
              console.log(
                `[hikari] container database dihapus. Volume ${d.volume_name} ` +
                  `dipertahankan — hapus manual: docker volume rm ${d.volume_name}`
              )
            )
            .catch((err) =>
              console.error(`[hikari] gagal bersihin container ${d.id}:`, err)
            )
        }
      },
    })
  )
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
      onAppCreated: (app) => {
        void setupRepoForApp({
          db,
          dataDir,
          apiUrl: gitApiUrl,
          appId: app.id,
          appSlug: app.slug,
        }).catch((err) =>
          console.error(`[hikari] gagal nyiapin repo buat ${app.slug}:`, err)
        )
      },
    })
  )
  app.route(
    '/api',
    createDatabaseRoutes({
      db,
      cryptoKey,
      dataDir,
      vpsIp: config.vpsIp,
      onDomainChange: syncCaddySekarang,
    })
  )
  app.route(
    '/api',
    createStorageRoutes({ db, cryptoKey, dataDir, vpsIp: config.vpsIp })
  )
  app.route(
    '/api',
    createCloudflareRoutes({
      db,
      cryptoKey,
      vpsIp: config.vpsIp,
      onDomainChange: syncCaddySekarang,
    })
  )
  app.route('/api', createGithubRoutes({ db, cryptoKey }))

  const gitApiUrl = `http://127.0.0.1:${config.port}`
  app.route(
    '/api',
    createGitPushRoutes({
      db,
      dataDir,
      apiUrl: gitApiUrl,
      gitHost: config.gitHost ?? 'localhost',
      gitPort: config.gitPort ?? 22,
      onPush: (appId) => void queue.enqueue(appId),
    })
  )

  // Bare repo buat tiap app dibikin pas nyala, karena sshd nunjuk ke folder
  // ini dan hook-nya harus ada sebelum ada yang push.
  for (const app of listApps(db)) {
    void setupRepoForApp({
      db,
      dataDir,
      apiUrl: gitApiUrl,
      appId: app.id,
      appSlug: app.slug,
    }).catch((err) =>
      console.error(`[hikari] gagal nyiapin repo buat ${app.slug}:`, err)
    )
  }

  app.notFound((c) => c.json({ error: 'Nggak ketemu' }, 404))
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

  return { app, db, docker, cryptoKey }
}
