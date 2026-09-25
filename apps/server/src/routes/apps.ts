import { Hono } from 'hono'
import { z } from 'zod'
import { join } from 'node:path'
import {
  createApp as createAppRecord,
  deleteApp,
  getApp,
  listApps,
  setAppStatus,
  updateApp,
} from '../repositories/apps'
import { getProject } from '../repositories/projects'
import {
  deleteEnvVar,
  listEnvVars,
  resolveEnvVars,
  setEnvVar,
} from '../repositories/env-vars'
import { listDeployments } from '../repositories/deployments'
import { getDocker, networkName, pingDocker } from '../docker/client'
import { decrypt } from '../lib/crypto'
import { getContainerStats } from '../docker/stats'
import { getLogs } from '../docker/logs'
import {
  inspectContainer,
  removeContainer,
  runContainer,
  stopContainer,
} from '../docker/containers'
import { formatPublicKey, generateDeployKey } from '../lib/ssh-key'
import {
  addDomain,
  listDomains,
  removeDomain,
  setTlsStatus,
} from '../repositories/domains'
import { validateHostname } from '../caddy/config'
import { probeCertStatus } from '../caddy/cert-status'
import type { Database } from '../db/client'

const MASK = '••••••••'

const createSchema = z.object({
  name: z.string().min(1).max(64),
  sourceType: z.enum(['github', 'giturl', 'image']),
  repoUrl: z.string().min(1).nullable().optional(),
  branch: z.string().min(1).max(128).nullable().optional(),
  buildStrategy: z.enum(['dockerfile', 'railpack']).optional(),
  dockerfilePath: z.string().min(1).optional(),
  rootDir: z.string().optional(),
  imageRef: z.string().min(1).nullable().optional(),
  containerPort: z.number().int().min(1).max(65535),
  memoryLimitMb: z.number().int().min(64).max(32768).optional(),
  cpuLimit: z.number().min(0.1).max(8).optional(),
})

const envSchema = z.object({
  key: z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  value: z.string().max(8192),
  isSecret: z.boolean().optional(),
})

export type AppRoutesDeps = {
  db: Database
  cryptoKey: Buffer
  deployKeyDir: string
  /** Folder data Caddy, dipakai buat baca status sertifikat beneran. */
  caddyDataDir: string
  onDeploy: (appId: string) => void
  onDomainChange: () => void
  /** Dipanggil pas app baru dibikin, biar bare repo git-nya langsung siap. */
  onAppCreated?: (app: { id: string; slug: string }) => void
}

export function createAppRoutes(deps: AppRoutesDeps): Hono {
  const { db, cryptoKey, deployKeyDir } = deps
  const router = new Hono()

  router.get('/projects/:projectId/apps', (c) => {
    const { projectId } = c.req.param()
    if (!getProject(db, projectId)) {
      return c.json({ error: 'Project nggak ketemu' }, 404)
    }
    return c.json({ apps: listApps(db, projectId) })
  })

  router.post('/projects/:projectId/apps', async (c) => {
    const { projectId } = c.req.param()
    if (!getProject(db, projectId)) {
      return c.json({ error: 'Project nggak ketemu' }, 404)
    }

    const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Data app nggak valid. Port wajib 1-65535.' }, 400)
    }

    if (parsed.data.sourceType !== 'image' && !parsed.data.repoUrl) {
      return c.json({ error: 'Repo URL wajib buat sumber git' }, 400)
    }
    if (parsed.data.sourceType === 'image' && !parsed.data.imageRef) {
      return c.json({ error: 'Image wajib buat sumber image' }, 400)
    }

    const app = createAppRecord(db, { ...parsed.data, projectId })
    deps.onAppCreated?.({ id: app.id, slug: app.slug })
    return c.json({ app }, 201)
  })

  router.get('/apps/:id', (c) => {
    const app = getApp(db, c.req.param('id'))
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)
    return c.json({ app })
  })

  router.patch('/apps/:id', async (c) => {
    const parsed = createSchema
      .omit({ sourceType: true })
      .partial()
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Data nggak valid' }, 400)

    const app = updateApp(db, c.req.param('id'), parsed.data)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)
    return c.json({ app })
  })

  router.delete('/apps/:id', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    await removeContainer(getDocker(), app.slug).catch(() => undefined)
    deleteApp(db, id)
    return c.json({ ok: true })
  })

  router.post('/apps/:id/deploy', (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    deps.onDeploy(id)
    return c.json({ ok: true, queued: true }, 202)
  })

  router.post('/apps/:id/stop', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    await stopContainer(getDocker(), app.slug)
    setAppStatus(db, id, 'stopped')
    return c.json({ ok: true })
  })

  router.post('/apps/:id/restart', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const docker = getDocker()
    const info = await inspectContainer(docker, app.slug)
    if (!info) {
      return c.json({ error: 'Container belum pernah dibuat. Deploy dulu.' }, 409)
    }

    // Restart = matiin terus nyalain pakai image terakhir yang sukses.
    // Env var HARUS diresolve ulang — kalau dikosongin, app-nya jalan tanpa
    // konfigurasi dan gagal dengan gejala yang nggak nunjuk ke Hikari.
    const env = resolveEnvVars(db, id, cryptoKey)

    await stopContainer(docker, app.slug)
    await runContainer(
      {
        appSlug: app.slug,
        image: `hikari-${app.slug}:latest`,
        containerPort: app.container_port,
        env,
        memoryLimitMb: app.memory_limit_mb,
        cpuLimit: app.cpu_limit,
        network: networkName(),
      },
      docker
    )

    setAppStatus(db, id, 'running')
    return c.json({ ok: true })
  })

  router.get('/apps/:id/status', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const docker = getDocker()
    const available = await pingDocker(docker)
    if (!available) {
      return c.json({
        status: app.status,
        dockerAvailable: false,
        container: null,
        stats: null,
      })
    }

    const container = await inspectContainer(docker, app.slug)
    const stats = container?.running ? await getContainerStats(docker, app.slug) : null

    return c.json({
      status: app.status,
      dockerAvailable: true,
      container,
      stats,
    })
  })

  router.get('/apps/:id/logs', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const tail = Number(c.req.query('tail') ?? 200)
    const lines = await getLogs(getDocker(), app.slug, Number.isFinite(tail) ? tail : 200)
    return c.json({ lines })
  })

  router.get('/apps/:id/deployments', (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)
    return c.json({ deployments: listDeployments(db, id, 20) })
  })

  router.get('/apps/:id/env', (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const envVars = listEnvVars(db, id).map((v) => ({
      key: v.key,
      isSecret: v.is_secret === 1,
      // Yang rahasia ditutup total. Yang bukan rahasia didekripsi biar
      // nilainya keliatan di panel — dia bukan rahasia, jadi nggak ada
      // alasan nyembunyiin.
      value: v.is_secret === 1 ? MASK : decrypt(v.value, cryptoKey),
    }))

    return c.json({ envVars })
  })

  router.post('/apps/:id/env', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const parsed = envSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Key env var harus huruf/angka/underscore' }, 400)
    }

    setEnvVar(db, id, parsed.data.key, parsed.data.value, parsed.data.isSecret ?? false, cryptoKey)
    return c.json({ ok: true })
  })

  router.delete('/apps/:id/env/:key', (c) => {
    const id = c.req.param('id')
    if (!getApp(db, id)) return c.json({ error: 'App nggak ketemu' }, 404)

    const ok = deleteEnvVar(db, id, c.req.param('key'))
    if (!ok) return c.json({ error: 'Env var nggak ketemu' }, 404)
    return c.json({ ok: true })
  })

  router.get('/apps/:id/deploy-key', async (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const keyPath = join(deployKeyDir, app.slug)
    const { publicKey } = generateDeployKey(keyPath)
    return c.json({ publicKey: formatPublicKey(publicKey, app.slug) })
  })

  router.get('/apps/:id/domains', (c) => {
    const id = c.req.param('id')
    if (!getApp(db, id)) return c.json({ error: 'App nggak ketemu' }, 404)
    return c.json({ domains: listDomains(db, id) })
  })

  router.post('/apps/:id/domains', async (c) => {
    const id = c.req.param('id')
    if (!getApp(db, id)) return c.json({ error: 'App nggak ketemu' }, 404)

    const body = (await c.req.json().catch(() => null)) as { hostname?: string } | null
    const check = validateHostname(body?.hostname ?? '')
    if (!check.ok) return c.json({ error: check.reason }, 400)

    const hostname = (body!.hostname as string).toLowerCase()

    try {
      const domain = addDomain(db, id, hostname)
      deps.onDomainChange()
      return c.json({ domain }, 201)
    } catch {
      return c.json({ error: 'Domain itu udah dipakai app lain' }, 409)
    }
  })

  router.delete('/apps/:id/domains/:domainId', (c) => {
    const id = c.req.param('id')
    if (!getApp(db, id)) return c.json({ error: 'App nggak ketemu' }, 404)

    const ok = removeDomain(db, c.req.param('domainId'))
    if (!ok) return c.json({ error: 'Domain nggak ketemu' }, 404)

    deps.onDomainChange()
    return c.json({ ok: true })
  })

  /**
   * Cek ulang status sertifikat TLS buat satu domain.
   *
   * Sebelumnya endpoint ini cuma nge-set 'pending' tanpa baca apa-apa,
   * jadi statusnya selamanya "Nunggu sertifikat" walau sertifikatnya udah
   * terbit. Sekarang beneran dibaca dari file sertifikat Caddy.
   */
  router.post('/apps/:id/domains/:domainId/check', async (c) => {
    const id = c.req.param('id')
    if (!getApp(db, id)) return c.json({ error: 'App nggak ketemu' }, 404)

    const domainId = c.req.param('domainId')
    const domain = listDomains(db, id).find((d) => d.id === domainId)
    if (!domain) return c.json({ error: 'Domain nggak ketemu' }, 404)

    const status = await probeCertStatus(
      {
        caddyDataDir: deps.caddyDataDir,
        readExpiry: async (certPath) => {
          const proc = Bun.spawn(['openssl', 'x509', '-in', certPath, '-noout', '-enddate'], {
            stdout: 'pipe',
            stderr: 'pipe',
          })
          const out = await new Response(proc.stdout).text()
          const err = await new Response(proc.stderr).text()
          const code = await proc.exited
          if (code !== 0) throw new Error(err.trim() || 'openssl gagal')
          return out
        },
      },
      domain.hostname
    )

    setTlsStatus(db, domainId, status)
    return c.json({ ok: true, tlsStatus: status })
  })

  return router
}
