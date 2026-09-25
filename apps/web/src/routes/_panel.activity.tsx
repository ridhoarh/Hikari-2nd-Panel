import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { useList } from '../hooks/use-list'
import type { ActivityItem } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody } from '../components/ui/card'
import { EmptyState, Tag } from '../components/ui/list'

export const Route = createFileRoute('/_panel/activity')({ component: ActivityPage })

const STATUS_CLASS: Record<string, string> = {
  success: 'text-ok',
  failed: 'text-danger',
  building: 'text-warn',
  deploying: 'text-warn',
  queued: 'text-ink-subtle',
}

/** Riwayat deploy terbaru dari semua app, jadi kelihatan siapa ngedeploy apa. */
function ActivityPage() {
  const { username } = useAuth()
  const { items, loading, error } = useList<ActivityItem>('/activity', 'activity')

  return (
    <AppShell username={username ?? 'admin'} title="Aktivitas">
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState>Belum ada deployment. Deploy app pertama kamu dari halaman app.</EmptyState>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="max-w-3xl space-y-2">
          {items.map((d) => (
            <Card key={d.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {d.project_id && (
                        <Link
                          to="/apps/$appId"
                          params={{ appId: d.app_id }}
                          className="truncate text-sm font-medium transition-hikari hover:text-brand-text"
                        >
                          {d.app_name ?? 'App'}
                        </Link>
                      )}
                      {d.project_name && <Tag>{d.project_name}</Tag>}
                    </div>
                    {d.commit_message && (
                      <p className="mt-1 truncate text-sm text-ink-muted">{d.commit_message}</p>
                    )}
                    {d.error && (
                      <p className="mt-1 font-mono text-xs text-danger">{d.error}</p>
                    )}
                  </div>

                  <span
                    className={`shrink-0 text-xs ${STATUS_CLASS[d.status] ?? 'text-ink-subtle'}`}
                  >
                    {d.status}
                  </span>
                </div>

                <p className="mt-2 font-mono text-[11px] text-ink-subtle">
                  {new Date(d.created_at).toLocaleString('id-ID')}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  )
}
