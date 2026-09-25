import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { useList } from '../hooks/use-list'
import type { DomainWithApp } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody } from '../components/ui/card'
import { CardGrid, EmptyState, Field } from '../components/ui/list'

export const Route = createFileRoute('/_panel/domains')({ component: DomainsPage })

const TLS_LABEL: Record<string, { text: string; className: string }> = {
  active: { text: 'aktif', className: 'text-ok' },
  pending: { text: 'pending', className: 'text-warn' },
  failed: { text: 'gagal', className: 'text-danger' },
}

/** Semua domain di semua app, plus status TLS-nya. */
function DomainsPage() {
  const { username } = useAuth()
  const { items: domains, loading, error } = useList<DomainWithApp>('/domains', 'domains')

  return (
    <AppShell username={username ?? 'admin'} title="Domains">
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && domains.length === 0 && (
        <EmptyState>
          Belum ada domain. Tambahin lewat tab Domains di dalam app.
        </EmptyState>
      )}

      {!loading && !error && domains.length > 0 && (
        <CardGrid>
          {domains.map((d) => {
            const tls = TLS_LABEL[d.tls_status] ?? { text: d.tls_status, className: 'text-ink-subtle' }
            return (
              <Card key={d.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-mono text-sm">{d.hostname}</p>
                    <span className={`shrink-0 text-xs ${tls.className}`}>{tls.text}</span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm">
                    <Field label="App" value={d.app_name ?? '—'} />
                    <Field label="Project" value={d.project_name ?? '—'} />
                  </div>

                  <a
                    href={`https://${d.hostname}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-xs text-brand-text transition-hikari hover:underline"
                  >
                    Buka di tab baru →
                  </a>

                  {d.project_id && (
                    <>
                      {' · '}
                      <Link
                        to="/apps/$appId"
                        params={{ appId: d.app_id }}
                        className="text-xs text-brand-text transition-hikari hover:underline"
                      >
                        Detail app →
                      </Link>
                    </>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </CardGrid>
      )}
    </AppShell>
  )
}
