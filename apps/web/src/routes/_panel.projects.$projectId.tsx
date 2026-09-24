import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import type { AppRecord, Project } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { AppCard } from '../components/apps/app-card'
import { CreateAppDialog } from '../components/apps/create-app-dialog'

export const Route = createFileRoute('/_panel/projects/$projectId')({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const { username } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [apps, setApps] = useState<AppRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    const [p, a] = await Promise.all([
      api.get<{ project: Project }>(`/projects/${projectId}`),
      api.get<{ apps: AppRecord[] }>(`/projects/${projectId}/apps`),
    ])

    setLoading(false)

    if (!p.ok) {
      setError(p.error)
      return
    }

    setError(null)
    setProject(p.data?.project ?? null)
    setApps(a.data?.apps ?? [])
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell
      username={username ?? 'admin'}
      title={project?.name ?? 'Project'}
      actions={<Button onClick={() => setDialogOpen(true)}>App baru</Button>}
    >
      <div className="mb-4">
        <Link to="/" className="text-sm text-brand-text transition-hikari hover:underline">
          ← Semua project
        </Link>
      </div>

      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && apps.length === 0 && (
        <p className="text-sm text-ink-muted">
          Belum ada app di project ini. Bikin app pertama buat mulai deploy.
        </p>
      )}

      {!loading && !error && apps.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}

      {dialogOpen && (
        <CreateAppDialog
          projectId={projectId}
          onCreated={load}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </AppShell>
  )
}
