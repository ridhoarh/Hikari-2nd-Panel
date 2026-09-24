import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import type { Project } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { ProjectList } from '../components/projects/project-list'
import { CreateProjectDialog } from '../components/projects/create-project-dialog'

export const Route = createFileRoute('/_panel/')({ component: ProjectsPage })

function ProjectsPage() {
  const { username } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.get<{ projects: Project[] }>('/projects')
    setLoading(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setProjects(res.data?.projects ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell
      username={username ?? 'admin'}
      title="Projects"
      actions={<Button onClick={() => setDialogOpen(true)}>Project baru</Button>}
    >
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && <ProjectList projects={projects} />}

      {dialogOpen && (
        <CreateProjectDialog onCreated={load} onClose={() => setDialogOpen(false)} />
      )}
    </AppShell>
  )
}
