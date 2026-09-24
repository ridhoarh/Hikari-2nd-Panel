import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { getProject } from '../repositories/projects'
import {
  createBucket,
  deleteBucket,
  listBuckets,
  resolveBucketCredentials,
  setBucketPublic,
} from '../repositories/storage-buckets'
import {
  ensureMinio,
  minioEndpoint,
  minioPublicEndpoint,
  stopMinio,
} from '../docker/minio'
import { getDocker } from '../docker/client'

const createSchema = z.object({
  name: z.string().min(1).max(64),
  isPublic: z.boolean().optional(),
})

export type StorageRoutesDeps = {
  db: Database
  cryptoKey: Buffer
  dataDir: string
  vpsIp?: string
}

export function createStorageRoutes(deps: StorageRoutesDeps): Hono {
  const { db, cryptoKey } = deps
  const router = new Hono()

  router.get('/projects/:projectId/buckets', (c) => {
    const { projectId } = c.req.param()
    if (!getProject(db, projectId)) {
      return c.json({ error: 'Project nggak ketemu' }, 404)
    }

    // Secret key disimpen terenkripsi, jadi yang dikirim ke list adalah
    // versi terenkripsi — nggak ada gunanya buat user. Yang asli cuma
    // dikasih sekali waktu bucket dibikin.
    const buckets = listBuckets(db, projectId).map((b) => ({
      ...b,
      secret_key: '••••••••',
    }))
    return c.json({ buckets })
  })

  router.post('/projects/:projectId/buckets', async (c) => {
    const { projectId } = c.req.param()
    if (!getProject(db, projectId)) {
      return c.json({ error: 'Project nggak ketemu' }, 404)
    }

    const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Data bucket nggak valid' }, 400)

    try {
      const bucket = createBucket(db, {
        projectId,
        name: parsed.data.name,
        cryptoKey,
        isPublic: parsed.data.isPublic,
      })
      return c.json(
        {
          bucket,
          endpoint: parsed.data.isPublic
            ? minioPublicEndpoint(deps.vpsIp)
            : minioEndpoint(),
          pesan:
            'Secret key cuma muncul sekali ini. Simpen di tempat aman — ' +
            'sesudah ini nggak bisa diliat lagi.',
        },
        201
      )
    } catch {
      return c.json({ error: 'Nama bucket itu udah dipakai' }, 409)
    }
  })

  router.get('/buckets/:id', (c) => {
    const id = c.req.param('id')
    const bucket = listBuckets(db).find((b) => b.id === id)
    if (!bucket) return c.json({ error: 'Bucket nggak ketemu' }, 404)

    const creds = resolveBucketCredentials(db, id, cryptoKey)
    if (!creds) return c.json({ error: 'Bucket nggak ketemu' }, 404)

    return c.json({
      bucket: { ...bucket, secret_key: creds.secretKey },
      endpoint: bucket.is_public === 1 ? minioPublicEndpoint(deps.vpsIp) : minioEndpoint(),
    })
  })

  router.patch('/buckets/:id', async (c) => {
    const id = c.req.param('id')
    const bucket = listBuckets(db).find((b) => b.id === id)
    if (!bucket) return c.json({ error: 'Bucket nggak ketemu' }, 404)

    const body = (await c.req.json().catch(() => null)) as { isPublic?: boolean } | null
    setBucketPublic(db, id, body?.isPublic ?? false)

    return c.json({
      ok: true,
      endpoint: body?.isPublic ? minioPublicEndpoint(deps.vpsIp) : minioEndpoint(),
    })
  })

  router.delete('/buckets/:id', (c) => {
    const id = c.req.param('id')
    if (!deleteBucket(db, id)) return c.json({ error: 'Bucket nggak ketemu' }, 404)
    return c.json({ ok: true })
  })

  // --- MinIO sebagai layanan -------------------------------------------

  router.post('/storage/start', async (c) => {
    try {
      await ensureMinio(getDocker())
      return c.json({ ok: true, endpoint: minioEndpoint() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 500)
    }
  })

  router.post('/storage/stop', async (c) => {
    await stopMinio(getDocker())
    return c.json({ ok: true })
  })

  return router
}
