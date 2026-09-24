import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import {
  createProject,
  deleteProject,
  getProject,
  listDatabasesForProject,
  listProjects,
  updateProject,
} from '../repositories/projects'

const upsertSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
})

export type ProjectRoutesDeps = {
  db: Database
  /**
   * Dipanggil pas project dihapus. Container database-nya harus dibersihin,
   * TAPI volume-nya dibiarin — data user nggak boleh hilang gara-gara
   * salah klik.
   */
  onProjectDeleted?: (databases: { id: string; volume_name: string }[]) => void
}

export function createProjectRoutes(deps: ProjectRoutesDeps): Hono {
  const { db } = deps
  const router = new Hono()

  router.get('/projects', (c) => {
    return c.json({ projects: listProjects(db) })
  })

  router.post('/projects', async (c) => {
    const parsed = upsertSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Nama project wajib diisi, maksimal 100 karakter' }, 400)
    }
    return c.json({ project: createProject(db, parsed.data) }, 201)
  })

  router.get('/projects/:id', (c) => {
    const project = getProject(db, c.req.param('id'))
    if (!project) return c.json({ error: 'Project nggak ketemu' }, 404)
    return c.json({ project })
  })

  router.patch('/projects/:id', async (c) => {
    const parsed = upsertSchema.partial().safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Data yang dikirim nggak valid' }, 400)
    }

    const project = updateProject(db, c.req.param('id'), parsed.data)
    if (!project) return c.json({ error: 'Project nggak ketemu' }, 404)
    return c.json({ project })
  })

  router.delete('/projects/:id', (c) => {
    const id = c.req.param('id')

    // Kumpulin dulu SEBELUM dihapus: abis barisnya hilang, relasi
    // cascade-nya bikin datanya nggak bisa di-query lagi.
    const databases = listDatabasesForProject(db, id)

    const ok = deleteProject(db, id)
    if (!ok) return c.json({ error: 'Project nggak ketemu' }, 404)

    deps.onProjectDeleted?.(databases)

    return c.json({
      ok: true,
      volumeDipertahankan: databases.map((d) => d.volume_name),
    })
  })

  return router
}
