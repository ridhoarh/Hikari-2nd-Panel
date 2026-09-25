import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { useList } from '../hooks/use-list'
import type { BucketWithProject } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody } from '../components/ui/card'
import { CardGrid, EmptyState, Field } from '../components/ui/list'

export const Route = createFileRoute('/_panel/storage')({ component: StoragePage })

/** Semua bucket MinIO di semua project. */
function StoragePage() {
  const { username } = useAuth()
  const { items: buckets, loading, error } = useList<BucketWithProject>('/storage', 'buckets')

  return (
    <AppShell username={username ?? 'admin'} title="Storage">
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && buckets.length === 0 && (
        <EmptyState>
          Belum ada bucket. Bikin lewat tab Storage di dalam project.
        </EmptyState>
      )}

      {!loading && !error && buckets.length > 0 && (
        <CardGrid>
          {buckets.map((b) => (
            <Card key={b.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate font-medium">{b.name}</p>
                  <span className={`text-xs ${b.is_public ? 'text-warn' : 'text-ink-subtle'}`}>
                    {b.is_public ? 'publik' : 'privat'}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-sm">
                  <Field label="Project" value={b.project_name ?? '—'} />
                  <Field label="Access key" value={b.access_key} mono />
                </div>

                {b.project_id && (
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: b.project_id }}
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
