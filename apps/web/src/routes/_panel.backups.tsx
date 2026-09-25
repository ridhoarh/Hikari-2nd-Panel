import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { useList } from '../hooks/use-list'
import type { BackupWithContext } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody } from '../components/ui/card'
import { CardGrid, EmptyState, Field } from '../components/ui/list'

export const Route = createFileRoute('/_panel/backups')({ component: BackupsPage })

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Semua file backup dari semua database, terbaru di atas. */
function BackupsPage() {
  const { username } = useAuth()
  const { items: backups, loading, error } = useList<BackupWithContext>('/backups', 'backups')

  return (
    <AppShell
      username={username ?? 'admin'}
      title="Backups"
      subtitle="Jadwal backup otomatis diatur di Settings → Panel"
    >
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && backups.length === 0 && (
        <EmptyState>
          Belum ada backup. Bikin manual lewat kartu database di dalam project.
        </EmptyState>
      )}

      {!loading && !error && backups.length > 0 && (
        <CardGrid>
          {backups.map((b) => (
            <Card key={b.id}>
              <CardBody>
                <p className="truncate font-mono text-xs">{b.filename}</p>

                <div className="mt-3 space-y-1.5 text-sm">
                  <Field label="Database" value={b.database_name} />
                  <Field label="Engine" value={b.database_engine} mono />
                  <Field label="Project" value={b.project_name ?? '—'} />
                  <Field label="Ukuran" value={formatBytes(b.size_bytes)} mono />
                  <Field
                    label="Dibuat"
                    value={new Date(b.created_at).toLocaleString('id-ID')}
                  />
                </div>

                <a
                  href={`/api/backups/${b.id}/download`}
                  className="mt-3 inline-block text-xs text-brand-text transition-hikari hover:underline"
                >
                  Unduh →
                </a>
              </CardBody>
            </Card>
          ))}
        </CardGrid>
      )}
    </AppShell>
  )
}
