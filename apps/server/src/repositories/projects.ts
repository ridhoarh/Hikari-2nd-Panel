import type { Database } from '../db/client'
import { newId, nowIso, slugify } from '../lib/id'

export type Project = {
  id: string
  name: string
  slug: string
  description: string | null
  created_at: string
}

function uniqueSlug(db: Database, name: string): string {
  const base = slugify(name)
  let candidate = base
  let n = 2

  while (db.query('SELECT 1 FROM projects WHERE slug = ?').get(candidate)) {
    candidate = `${base}-${n}`
    n += 1
  }

  return candidate
}

export function listProjects(db: Database): Project[] {
  // `created_at` bisa identik kalau dua project dibikin dalam milidetik yang
  // sama, jadi PK ULID dipakai sebagai tie-breaker. Karena ULID-nya monotonik,
  // ini beneran ngasih urutan "terbaru duluan".
  return db
    .query('SELECT * FROM projects ORDER BY created_at DESC, id DESC')
    .all() as Project[]
}

export function getProject(db: Database, id: string): Project | null {
  return db.query('SELECT * FROM projects WHERE id = ?').get(id) as Project | null
}

export function createProject(
  db: Database,
  input: { name: string; description?: string | null }
): Project {
  const project: Project = {
    id: newId(),
    name: input.name,
    slug: uniqueSlug(db, input.name),
    description: input.description ?? null,
    created_at: nowIso(),
  }

  db.query(
    'INSERT INTO projects (id, name, slug, description, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(
    project.id,
    project.name,
    project.slug,
    project.description,
    project.created_at
  )

  return project
}

export function updateProject(
  db: Database,
  id: string,
  input: { name?: string; description?: string | null }
): Project | null {
  const existing = getProject(db, id)
  if (!existing) return null

  const name = input.name ?? existing.name
  const description =
    input.description === undefined ? existing.description : input.description

  db.query('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(
    name,
    description,
    id
  )

  return getProject(db, id)
}

export function deleteProject(db: Database, id: string): boolean {
  const result = db.query('DELETE FROM projects WHERE id = ?').run(id)
  return result.changes > 0
}
