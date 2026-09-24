import type { Database } from '../db/client'
import { newId, nowIso, slugify } from '../lib/id'

export type AppStatus = 'stopped' | 'building' | 'running' | 'failed'
export type SourceType = 'github' | 'giturl' | 'image'
export type BuildStrategy = 'dockerfile' | 'railpack'

export type App = {
  id: string
  project_id: string
  name: string
  slug: string
  source_type: SourceType
  repo_url: string | null
  branch: string | null
  build_strategy: BuildStrategy
  dockerfile_path: string
  root_dir: string
  image_ref: string | null
  container_port: number
  memory_limit_mb: number
  cpu_limit: number
  status: AppStatus
  created_at: string
}

export type CreateAppInput = {
  projectId: string
  name: string
  sourceType: SourceType
  repoUrl?: string | null
  branch?: string | null
  buildStrategy?: BuildStrategy
  dockerfilePath?: string
  rootDir?: string
  imageRef?: string | null
  containerPort: number
  memoryLimitMb?: number
  cpuLimit?: number
}

function uniqueSlug(db: Database, name: string): string {
  const base = slugify(name)
  let candidate = base
  let n = 2
  while (db.query('SELECT 1 FROM apps WHERE slug = ?').get(candidate)) {
    candidate = `${base}-${n}`
    n += 1
  }
  return candidate
}

export function listApps(db: Database, projectId?: string): App[] {
  if (projectId) {
    return db
      .query('SELECT * FROM apps WHERE project_id = ? ORDER BY created_at DESC, id DESC')
      .all(projectId) as App[]
  }
  return db.query('SELECT * FROM apps ORDER BY created_at DESC, id DESC').all() as App[]
}

export function getApp(db: Database, id: string): App | null {
  return db.query('SELECT * FROM apps WHERE id = ?').get(id) as App | null
}

export function getAppBySlug(db: Database, slug: string): App | null {
  return db.query('SELECT * FROM apps WHERE slug = ?').get(slug) as App | null
}

export function createApp(db: Database, input: CreateAppInput): App {
  const app: App = {
    id: newId(),
    project_id: input.projectId,
    name: input.name,
    slug: uniqueSlug(db, input.name),
    source_type: input.sourceType,
    repo_url: input.repoUrl ?? null,
    branch: input.branch ?? (input.sourceType === 'image' ? null : 'main'),
    build_strategy: input.buildStrategy ?? 'dockerfile',
    dockerfile_path: input.dockerfilePath ?? 'Dockerfile',
    root_dir: input.rootDir ?? '.',
    image_ref: input.imageRef ?? null,
    container_port: input.containerPort,
    memory_limit_mb: input.memoryLimitMb ?? 512,
    cpu_limit: input.cpuLimit ?? 1.0,
    status: 'stopped',
    created_at: nowIso(),
  }

  db.query(
    `INSERT INTO apps (
      id, project_id, name, slug, source_type, repo_url, branch,
      build_strategy, dockerfile_path, root_dir, image_ref,
      container_port, memory_limit_mb, cpu_limit, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    app.id,
    app.project_id,
    app.name,
    app.slug,
    app.source_type,
    app.repo_url,
    app.branch,
    app.build_strategy,
    app.dockerfile_path,
    app.root_dir,
    app.image_ref,
    app.container_port,
    app.memory_limit_mb,
    app.cpu_limit,
    app.status,
    app.created_at
  )

  return app
}

export function updateApp(
  db: Database,
  id: string,
  input: Partial<Omit<CreateAppInput, 'projectId' | 'sourceType'>>
): App | null {
  const existing = getApp(db, id)
  if (!existing) return null

  db.query(
    `UPDATE apps SET
      name = ?, repo_url = ?, branch = ?, build_strategy = ?,
      dockerfile_path = ?, root_dir = ?, image_ref = ?,
      container_port = ?, memory_limit_mb = ?, cpu_limit = ?
     WHERE id = ?`
  ).run(
    input.name ?? existing.name,
    input.repoUrl === undefined ? existing.repo_url : input.repoUrl,
    input.branch === undefined ? existing.branch : input.branch,
    input.buildStrategy ?? existing.build_strategy,
    input.dockerfilePath ?? existing.dockerfile_path,
    input.rootDir ?? existing.root_dir,
    input.imageRef === undefined ? existing.image_ref : input.imageRef,
    input.containerPort ?? existing.container_port,
    input.memoryLimitMb ?? existing.memory_limit_mb,
    input.cpuLimit ?? existing.cpu_limit,
    id
  )

  return getApp(db, id)
}

export function setAppStatus(db: Database, id: string, status: AppStatus): void {
  db.query('UPDATE apps SET status = ? WHERE id = ?').run(status, id)
}

export function deleteApp(db: Database, id: string): boolean {
  const result = db.query('DELETE FROM apps WHERE id = ?').run(id)
  return result.changes > 0
}
