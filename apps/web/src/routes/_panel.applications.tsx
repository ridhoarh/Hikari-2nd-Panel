import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { useList } from '../hooks/use-list'
import type { AppWithProject } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody } from '../components/ui/card'
import { CardGrid, EmptyState, Field, Tag } from '../components/ui/list'
import { StatusDot } from '../components/ui/status-dot'

export const Route = createFileRoute('/_panel/applications')({ component: ApplicationsPage })

/** Semua app di semua project — biar nggak perlu buka project satu-satu. */
function ApplicationsPage() {
  const { username } = useAuth()
  const { items: apps, loading, error } = useList<AppWithProject>('/applications', 'applications')

  return (
    <AppShell username={username ?? 'admin'} title="Applications">
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && apps.length === 0 && (
        <EmptyState>
          Belum ada app. Bikin project dulu, terus tambahin app di dalamnya.
        </EmptyState>
      )}

      {!loading && !error && apps.length > 0 && (
        <CardGrid>
          {apps.map((app) => (
            <Link key={app.id} to="/apps/$appId" params={{ appId: app.id }}>
              <Card className="transition-hikari hover:border-brand">
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{app.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-ink-subtle">{app.slug}</p>
                    </div>
                    <StatusDot status={app.status} />
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm">
                    <Field label="Project" value={app.project_name ?? '—'} />
                    <Field label="Sumber" value={app.source_type} mono />
                    <Field label="Port" value={String(app.container_port)} mono />
                    <Field label="RAM" value={`${app.memory_limit_mb} MB`} mono />
                  </div>

                  {app.project_name && (
                    <div className="mt-3">
                      <Tag>{app.project_name}</Tag>
                    </div>
                  )}
                </CardBody>
              </Card>
            </Link>
          ))}
        </CardGrid>
      )}
    </AppShell>
  )
}
