import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { useList } from '../hooks/use-list'
import type { ActivityItem, AppWithProject, BackupWithContext, DbWithProject, Project } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody, CardHeader } from '../components/ui/card'
import { CardGrid, EmptyState, Field, Tag } from '../components/ui/list'
import { StatusDot } from '../components/ui/status-dot'

export const Route = createFileRoute('/_panel/')({ component: RingkasanPage })

/**
 * Halaman pembuka: keadaan VPS sekilas.
 *
 * Sengaja bukan daftar project — yang dibuka tiap hari biasanya bukan
 * "project apa aja yang ada", tapi "ada yang rusak nggak?". Jadi yang
 * ditonjolin di sini: app yang mati atau gagal, baru ringkasan sisanya.
 */
function RingkasanPage() {
  const { username } = useAuth()
  const apps = useList<AppWithProject>('/applications', 'applications')
  const databases = useList<DbWithProject>('/databases', 'databases')
  const projects = useList<Project>('/projects', 'projects')
  const backups = useList<BackupWithContext>('/backups', 'backups')

  const loading = apps.loading || databases.loading || projects.loading || backups.loading
  const error = apps.error ?? databases.error ?? projects.error ?? backups.error

  // App yang perlu dilihat duluan: mati atau gagal.
  const bermasalah = apps.items.filter((a) => a.status === 'failed' || a.status === 'stopped')
  const jalan = apps.items.filter((a) => a.status === 'running')

  const backupTerakhir = backups.items[0]?.created_at ?? null

  return (
    <AppShell username={username ?? 'admin'} title="Ringkasan">
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          <CardGrid>
            <Stat label="Project" value={projects.items.length} to="/projects" />
            <Stat label="App jalan" value={`${jalan.length} / ${apps.items.length}`} to="/applications" />
            <Stat label="Database" value={databases.items.length} to="/databases" />
          </CardGrid>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Perlu perhatian</h2>
                {bermasalah.length > 0 && (
                  <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[11px] text-warn">
                    {bermasalah.length}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardBody>
              {bermasalah.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Semua app jalan normal. Nggak ada yang perlu dibenerin.
                </p>
              ) : (
                <ul className="space-y-2">
                  {bermasalah.map((app) => (
                    <li key={app.id}>
                      <Link
                        to="/apps/$appId"
                        params={{ appId: app.id }}
                        className="flex items-center justify-between gap-3 rounded-card px-2 py-1.5 transition-hikari hover:bg-muted"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <StatusDot status={app.status} />
                          <span className="truncate text-sm">{app.name}</span>
                          {app.project_name && <Tag>{app.project_name}</Tag>}
                        </span>
                        <span className="shrink-0 text-xs text-ink-subtle">{app.status}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="text-sm font-medium">Registri</h2>
              </CardHeader>
              <CardBody>
                <dl className="space-y-1.5 text-sm">
                  <Field label="Project" value={projects.items.length} />
                  <Field label="App" value={apps.items.length} />
                  <Field label="Database" value={databases.items.length} />
                  <Field
                    label="Backup terakhir"
                    value={backupTerakhir ? new Date(backupTerakhir).toLocaleString('id-ID') : 'belum pernah'}
                  />
                </dl>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-sm font-medium">Database per engine</h2>
              </CardHeader>
              <CardBody>
                {databases.items.length === 0 ? (
                  <p className="text-sm text-ink-muted">Belum ada database.</p>
                ) : (
                  <dl className="space-y-1.5 text-sm">
                    {(['postgres', 'mysql', 'redis'] as const).map((engine) => (
                      <Field
                        key={engine}
                        label={engine}
                        value={databases.items.filter((d) => d.engine === engine).length}
                      />
                    ))}
                  </dl>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  )
}

function Stat({ label, value, to }: { label: string; value: number | string; to: string }) {
  return (
    <Link to={to} className="transition-hikari hover:opacity-80">
      <Card>
        <CardBody>
          <p className="text-xs text-ink-subtle">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </CardBody>
      </Card>
    </Link>
  )
}
