import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '../repositories/projects'

const upsertSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
})

export function createProjectRoutes(db: Database): Hono {
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
    const ok = deleteProject(db, c.req.param('id'))
    if (!ok) return c.json({ error: 'Project nggak ketemu' }, 404)
    return c.json({ ok: true })
  })

  return router
}
