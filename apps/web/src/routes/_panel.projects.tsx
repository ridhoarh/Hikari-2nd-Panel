import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { useList } from '../hooks/use-list'
import type { Project } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { ProjectList } from '../components/projects/project-list'
import { CreateProjectDialog } from '../components/projects/create-project-dialog'
import { useState } from 'react'

export const Route = createFileRoute('/_panel/projects')({ component: ProjectsPage })

function ProjectsPage() {
  const { username } = useAuth()
  const { items: projects, loading, error, reload } = useList<Project>('/projects', 'projects')
  const [dialogOpen, setDialogOpen] = useState(false)

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
        <CreateProjectDialog onCreated={reload} onClose={() => setDialogOpen(false)} />
      )}
    </AppShell>
  )
}
