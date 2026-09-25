import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { useVisibleInterval } from '../hooks/use-visible-interval'
import { api } from '../lib/api'
import type { AppRecord, ContainerStats, Deployment, Project } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody, CardHeader } from '../components/ui/card'
import { EmptyState, Field } from '../components/ui/list'
import { StatusDot } from '../components/ui/status-dot'
import { AppActions } from '../components/apps/app-actions'
import { AppStats } from '../components/apps/app-stats'
import { AppLogs } from '../components/apps/app-logs'
import { AppTerminal } from '../components/apps/app-terminal'
import { AppEnv } from '../components/apps/app-env'
import { AppDomains } from '../components/apps/app-domains'
import { AppGit } from '../components/apps/app-git'
import { AppWebhook } from '../components/apps/app-webhook'
import { AppDeployKey } from '../components/apps/app-deploy-key'

export const Route = createFileRoute('/_panel/apps/$appId')({ component: AppDetailPage })

/**
 * Detail app.
 *
 * Dulu isinya dipecah jadi 7 tab, yang bikin fitur kayak Domains dan Git
 * susah ketemu — dan satu layar cuma nampilin sepotong informasi. Sekarang
 * semua panelnya kebuka bareng dalam grid, jadi cukup scroll buat lihat
 * semuanya. Yang paling sering dipantau (status, aksi, statistik) di atas.
 */
function AppDetailPage() {
  const { appId } = Route.useParams()
  const { username } = useAuth()

  const [app, setApp] = useState<AppRecord | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [stats, setStats] = useState<ContainerStats | null>(null)
  const [running, setRunning] = useState(false)
  const [dockerAvailable, setDockerAvailable] = useState(true)
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const detail = await api.get<{ app: AppRecord }>(`/apps/${appId}`)
    if (!detail.ok) {
      setError(detail.error)
      setLoading(false)
      return
    }

    const record = detail.data!.app
    setApp(record)

    const [p, s, d] = await Promise.all([
      api.get<{ project: Project }>(`/projects/${record.project_id}`),
      api.get<{
        status: string
        dockerAvailable: boolean
        container: { running: boolean } | null
        stats: ContainerStats | null
      }>(`/apps/${appId}/status`),
      api.get<{ deployments: Deployment[] }>(`/apps/${appId}/deployments`),
    ])

    if (p.ok) setProject(p.data?.project ?? null)
    if (s.ok) {
      setDockerAvailable(s.data?.dockerAvailable ?? true)
      setRunning(s.data?.container?.running ?? false)
      setStats(s.data?.stats ?? null)
    }
    if (d.ok) setDeployments(d.data?.deployments ?? [])

    setLoading(false)
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  // Polling cuma pas tab browser-nya kelihatan — nggak ada proses yang nyala
  // terus buat hal yang nggak dilihat.
  useVisibleInterval(() => void load(), 15_000, true)

  return (
    <AppShell
      username={username ?? 'admin'}
      title={app?.name ?? 'App'}
      subtitle={
        app ? (
          <span className="flex items-center gap-2">
            <Link
              to="/projects/$projectId"
              params={{ projectId: app.project_id }}
              className="transition-hikari hover:text-brand-text"
            >
              {project?.name ?? 'Project'}
            </Link>
            <span>·</span>
            <span className="font-mono">{app.slug}</span>
            <StatusDot status={app.status} />
          </span>
        ) : null
      }
    >
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {app && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <h2 className="text-sm font-medium">Kontrol</h2>
              </CardHeader>
              <CardBody>
                <AppActions appId={appId} onChanged={load} />
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <h2 className="text-sm font-medium">Statistik</h2>
              </CardHeader>
              <CardBody>
                <AppStats stats={stats} dockerAvailable={dockerAvailable} running={running} />
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="text-sm font-medium">Konfigurasi</h2>
              </CardHeader>
              <CardBody>
                <dl className="space-y-1.5 text-sm">
                  <Field label="Sumber" value={app.source_type} mono />
                  {app.repo_url && <Field label="Repo" value={app.repo_url} mono />}
                  {app.branch && <Field label="Branch" value={app.branch} mono />}
                  {app.image_ref && <Field label="Image" value={app.image_ref} mono />}
                  <Field label="Port" value={String(app.container_port)} mono />
                  <Field label="Batas RAM" value={`${app.memory_limit_mb} MB`} mono />
                  <Field label="Batas CPU" value={String(app.cpu_limit)} mono />
                </dl>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-sm font-medium">Deployment</h2>
              </CardHeader>
              <CardBody>
                {deployments.length === 0 ? (
                  <EmptyState>Belum ada deployment.</EmptyState>
                ) : (
                  <ul className="space-y-2">
                    {deployments.slice(0, 8).map((d) => (
                      <li key={d.id} className="border-b border-line pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-xs text-ink-subtle">
                            {d.id.slice(0, 10)}
                          </span>
                          <span className="text-xs">{d.status}</span>
                        </div>
                        {d.commit_message && (
                          <p className="mt-0.5 truncate text-sm text-ink-muted">
                            {d.commit_message}
                          </p>
                        )}
                        {d.error && (
                          <p className="mt-0.5 font-mono text-xs text-danger">{d.error}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="text-sm font-medium">Domains</h2>
              </CardHeader>
              <CardBody>
                <AppDomains appId={appId} containerPort={app.container_port} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-sm font-medium">Environment</h2>
              </CardHeader>
              <CardBody>
                <AppEnv appId={appId} />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-medium">Log</h2>
            </CardHeader>
            <CardBody>
              <AppLogs appId={appId} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-medium">Terminal</h2>
            </CardHeader>
            <CardBody>
              <AppTerminal appId={appId} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-medium">Git</h2>
            </CardHeader>
            <CardBody>
              <AppGit appId={appId} />
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="text-sm font-medium">Webhook GitHub</h2>
              </CardHeader>
              <CardBody>
                <AppWebhook appId={appId} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-sm font-medium">Deploy key</h2>
              </CardHeader>
              <CardBody>
                <AppDeployKey appId={appId} />
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  )
}
