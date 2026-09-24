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

export const Route = createFileRoute('/_panel/projects/$projectId')({
  component: ProjectDetailPage,
})

type Tab = 'apps' | 'databases' | 'storage'

const TABS: { id: Tab; label: string }[] = [
  { id: 'apps', label: 'Apps' },
  { id: 'databases', label: 'Databases' },
  { id: 'storage', label: 'Storage' },
]

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
  const [tab, setTab] = useState<Tab>('apps')

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
      actions={
        tab === 'apps' ? (
          <Button onClick={() => setAppDialog(true)}>App baru</Button>
        ) : tab === 'databases' ? (
          <Button onClick={() => setDbDialog(true)}>Database baru</Button>
        ) : undefined
      }
    >
      <div className="mb-4">
        <Link to="/" className="text-sm text-brand-text transition-hikari hover:underline">
          ← Semua project
        </Link>
      </div>

      <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-hikari ${
              tab === t.id
                ? 'border-brand font-medium text-brand-text'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && tab === 'apps' && (
        <>
          {apps.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Belum ada app di project ini. Bikin app pertama buat mulai deploy.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {apps.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          )}
        </>
      )}

      {!loading && !error && tab === 'databases' && (
        <div className="space-y-3">
          <p className="text-xs text-ink-subtle">
            Volume Docker nggak ikut kehapus kalau database-nya dihapus. Data kamu
            aman.
          </p>
          {databases.length === 0 ? (
            <p className="text-sm text-ink-muted">Belum ada database.</p>
          ) : (
            databases.map((d) => (
              <DatabaseCard key={d.id} database={d} onChanged={load} />
            ))
          )}
        </div>
      )}

      {!loading && !error && tab === 'storage' && <BucketList projectId={projectId} />}

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
