import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import type { AppRecord, DbRecord, Project } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { AppCard } from '../components/apps/app-card'
import { CreateAppDialog } from '../components/apps/create-app-dialog'
import { DatabaseCard } from '../components/databases/database-card'
import { CreateDatabaseDialog } from '../components/databases/create-database-dialog'
import { BucketList } from '../components/storage/bucket-list'
import { EmptyState } from '../components/ui/list'

export const Route = createFileRoute('/_panel/projects/$projectId')({
  component: ProjectDetailPage,
})

/**
 * Detail project: app, database, dan storage-nya.
 *
 * Dulu tiga bagian ini dipecah jadi tab. Sekarang semuanya kebuka sekaligus,
 * karena satu project biasanya nggak punya banyak app/database — dan yang
 * lagi nyari database jadi nggak perlu nebak-nebak ada di tab mana.
 */
function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const { username } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [apps, setApps] = useState<AppRecord[]>([])
  const [databases, setDatabases] = useState<DbRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [appDialog, setAppDialog] = useState(false)
  const [dbDialog, setDbDialog] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    const [p, a, d] = await Promise.all([
      api.get<{ project: Project }>(`/projects/${projectId}`),
      api.get<{ apps: AppRecord[] }>(`/projects/${projectId}/apps`),
      api.get<{ databases: DbRecord[] }>(`/projects/${projectId}/databases`),
    ])

    setLoading(false)

    if (!p.ok) {
      setError(p.error)
      return
    }

    setError(null)
    setProject(p.data?.project ?? null)
    setApps(a.data?.apps ?? [])
    setDatabases(d.data?.databases ?? [])
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell
      username={username ?? 'admin'}
      title={project?.name ?? 'Project'}
      subtitle={
        project ? (
          <Link to="/projects" className="transition-hikari hover:text-brand-text">
            ← Semua project
          </Link>
        ) : null
      }
    >
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">
                Apps <span className="text-ink-subtle">({apps.length})</span>
              </h2>
              <Button onClick={() => setAppDialog(true)}>App baru</Button>
            </div>

            {apps.length === 0 ? (
              <EmptyState>
                Belum ada app di project ini. Bikin app pertama buat mulai deploy.
              </EmptyState>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {apps.map((app) => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">
                Databases <span className="text-ink-subtle">({databases.length})</span>
              </h2>
              <Button variant="ghost" onClick={() => setDbDialog(true)}>
                Database baru
              </Button>
            </div>

            <p className="mb-3 text-xs text-ink-subtle">
              Volume Docker nggak ikut kehapus kalau database-nya dihapus. Data kamu
              aman.
            </p>

            {databases.length === 0 ? (
              <EmptyState>Belum ada database.</EmptyState>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {databases.map((d) => (
                  <DatabaseCard key={d.id} database={d} onChanged={load} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium">Storage</h2>
            <BucketList projectId={projectId} />
          </section>
        </div>
      )}

      {appDialog && (
        <CreateAppDialog
          projectId={projectId}
          onCreated={load}
          onClose={() => setAppDialog(false)}
        />
      )}

      {dbDialog && (
        <CreateDatabaseDialog
          projectId={projectId}
          onCreated={load}
          onClose={() => setDbDialog(false)}
        />
      )}
    </AppShell>
  )
}
