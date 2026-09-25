import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { useList } from '../hooks/use-list'
import type { DbWithProject } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody } from '../components/ui/card'
import { CardGrid, EmptyState, Field } from '../components/ui/list'

export const Route = createFileRoute('/_panel/databases')({ component: DatabasesPage })

const MODE_LABEL: Record<string, string> = {
  internal: 'Internal',
  tunnel: 'Tunnel',
  public: 'Public (IP)',
  domain: 'Public (domain)',
}

/** Semua database di semua project. */
function DatabasesPage() {
  const { username } = useAuth()
  const { items: databases, loading, error } = useList<DbWithProject>('/databases', 'databases')

  return (
    <AppShell username={username ?? 'admin'} title="Databases">
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && databases.length === 0 && (
        <EmptyState>
          Belum ada database. Bikin lewat tab Databases di dalam project.
        </EmptyState>
      )}

      {!loading && !error && databases.length > 0 && (
        <CardGrid>
          {databases.map((db) => (
            <Card key={db.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{db.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-ink-subtle">{db.engine}</p>
                  </div>
                  <span className={`text-xs ${db.status === 'running' ? 'text-ok' : 'text-idle'}`}>
                    {db.status}
                  </span>
                </div>

                {/* Password sengaja nggak ada di sini — cuma kekirim pas mode
                    aksesnya dibuka dari detail project. */}
                <div className="mt-3 space-y-1.5 text-sm">
                  <Field label="Project" value={db.project_name ?? '—'} />
                  <Field label="Versi" value={db.version} mono />
                  <Field label="Akses" value={MODE_LABEL[db.access_mode] ?? db.access_mode} />
                  <Field label="Port host" value={String(db.host_port)} mono />
                </div>

                {db.project_id && (
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: db.project_id }}
                    className="mt-3 inline-block text-xs text-brand-text transition-hikari hover:underline"
                  >
                    Buka di project →
                  </Link>
                )}
              </CardBody>
            </Card>
          ))}
        </CardGrid>
      )}
    </AppShell>
  )
}
