import { Hono } from 'hono'
import type { Database } from '../db/client'
import { listBackups } from '../db/backup'
import { listApps } from '../repositories/apps'
import { listDatabases } from '../repositories/databases'
import { listRecentDeployments } from '../repositories/deployments'
import { listAllDomains } from '../repositories/domains'
import { listProjects } from '../repositories/projects'
import { listBuckets } from '../repositories/storage-buckets'

/**
 * Daftar lintas project.
 *
 * Sebelumnya semua ini cuma bisa dilihat dari dalem project masing-masing:
 * mau tau ada berapa database atau domain, harus buka satu-satu. Halaman
 * datar di sidebar butuh daftar gabungan, jadi endpoint-nya dikumpulin di
 * satu tempat biar nggak nyebar di banyak file route.
 *
 * Semua repo-nya udah nerima parameter `projectId` yang opsional — kalau
 * nggak diisi, dia balikin semuanya. Jadi di sini tinggal manggil tanpa
 * argumen itu, nggak perlu query baru.
 */
export type OverviewRoutesDeps = {
  db: Database
  dataDir: string
}

export function createOverviewRoutes(deps: OverviewRoutesDeps): Hono {
  const { db } = deps
  const router = new Hono()

  router.get('/applications', (c) => {
    const projects = listProjects(db)
    const namaProject = new Map(projects.map((p) => [p.id, p.name]))

    // Nama project ditempel biar halaman datar bisa nampilin asalnya tanpa
    // harus manggil /projects dulu di klien.
    const applications = listApps(db).map((app) => ({
      ...app,
      project_name: namaProject.get(app.project_id) ?? null,
    }))

    return c.json({ applications })
  })

  router.get('/databases', (c) => {
    const projects = listProjects(db)
    const namaProject = new Map(projects.map((p) => [p.id, p.name]))

    // Password JANGAN pernah ikut kekirim ke list — sama kayak endpoint
    // per-project, buat mode akses user tetep harus lewat /databases/:id/access.
    const databases = listDatabases(db).map((d) => ({
      ...d,
      password: undefined,
      project_name: namaProject.get(d.project_id) ?? null,
    }))

    return c.json({ databases })
  })

  router.get('/storage', (c) => {
    const projects = listProjects(db)
    const namaProject = new Map(projects.map((p) => [p.id, p.name]))

    const buckets = listBuckets(db).map((b) => ({
      ...b,
      project_name: namaProject.get(b.project_id) ?? null,
    }))

    return c.json({ buckets })
  })

  router.get('/domains', (c) => {
    const apps = new Map(listApps(db).map((a) => [a.id, a]))
    const projects = new Map(listProjects(db).map((p) => [p.id, p]))

    const domains = listAllDomains(db).map((d) => {
      const app = apps.get(d.app_id)
      const project = app ? projects.get(app.project_id) : undefined
      return {
        ...d,
        app_name: app?.name ?? null,
        project_id: app?.project_id ?? null,
        project_name: project?.name ?? null,
      }
    })

    return c.json({ domains })
  })

  router.get('/backups', (c) => {
    const databases = new Map(listDatabases(db).map((d) => [d.id, d]))
    const projects = new Map(listProjects(db).map((p) => [p.id, p]))

    // `listBackups` butuh databaseId. Karena di sini kita mau semua, tiap
    // database diiterasi — jumlah database di satu VPS kecil, jadi ini nggak
    // jadi masalah (dan lebih simpel daripada bikin query SQL baru).
    const backups = listDatabases(db).flatMap((d) => {
      const project = projects.get(d.project_id)
      return listBackups(db, d.id).map((b) => ({
        ...b,
        database_name: d.name,
        database_engine: d.engine,
        project_name: project?.name ?? null,
      }))
    })

    // Terbaru di atas.
    backups.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

    return c.json({ backups })
  })

  return router
}

/** Dipakai halaman Aktivitas: deployment terbaru lintas app. */
export function createActivityRoute(deps: OverviewRoutesDeps): Hono {
  const { db } = deps
  const router = new Hono()

  router.get('/activity', (c) => {
    const apps = new Map(listApps(db).map((a) => [a.id, a]))
    const projects = new Map(listProjects(db).map((p) => [p.id, p]))

    const activity = listRecentDeployments(db).map((d) => {
      const app = apps.get(d.app_id)
      const project = app ? projects.get(app.project_id) : undefined
      return {
        ...d,
        app_name: app?.name ?? null,
        project_id: app?.project_id ?? null,
        project_name: project?.name ?? null,
      }
    })

    return c.json({ activity })
  })

  return router
}
