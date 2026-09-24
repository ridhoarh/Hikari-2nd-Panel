import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { useVisibleInterval } from '../hooks/use-visible-interval'
import { api } from '../lib/api'
import type { AppRecord, ContainerStats, Deployment, Project } from '../lib/types'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody, CardHeader } from '../components/ui/card'
import { StatusDot } from '../components/ui/status-dot'
import { AppActions } from '../components/apps/app-actions'
import { AppStats } from '../components/apps/app-stats'
import { AppLogs } from '../components/apps/app-logs'
import { AppEnv } from '../components/apps/app-env'
import { AppDomains } from '../components/apps/app-domains'
import { AppGit } from '../components/apps/app-git'

export const Route = createFileRoute('/_panel/apps/$appId')({ component: AppDetailPage })

type Tab = 'overview' | 'deployments' | 'logs' | 'env' | 'domains' | 'git'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'logs', label: 'Logs' },
  { id: 'env', label: 'Env' },
  { id: 'domains', label: 'Domains' },
  { id: 'git', label: 'Git' },
]

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
  const [tab, setTab] = useState<Tab>('overview')

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

  // Cuma polling pas tab Overview kebuka DAN tab browser-nya kelihatan.
  useVisibleInterval(() => void load(), 15_000, tab === 'overview')

  return (
    <AppShell username={username ?? 'admin'} title={app?.name ?? 'App'}>
      {loading && <p className="text-sm text-ink-muted">Memuat...</p>}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {app && (
        <div className="space-y-4">
          <div>
            <Link
              to="/projects/$projectId"
              params={{ projectId: app.project_id }}
              className="text-sm text-brand-text transition-hikari hover:underline"
            >
              ← {project?.name ?? 'Project'}
            </Link>
            <div className="mt-2 flex items-center gap-3">
              <span className="font-mono text-xs text-ink-subtle">{app.slug}</span>
              <StatusDot status={app.status} />
            </div>
          </div>

          <div role="tablist" className="flex gap-1 border-b border-line">
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

          {tab === 'overview' && (
            <div className="space-y-4">
              <AppActions appId={appId} onChanged={load} />
              <AppStats
                stats={stats}
                dockerAvailable={dockerAvailable}
                running={running}
              />
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-medium">Konfigurasi</h2>
                </CardHeader>
                <CardBody>
                  <dl className="space-y-1.5 text-sm">
                    <Row label="Sumber" value={app.source_type} mono />
                    {app.repo_url && <Row label="Repo" value={app.repo_url} mono />}
                    {app.branch && <Row label="Branch" value={app.branch} mono />}
                    {app.image_ref && <Row label="Image" value={app.image_ref} mono />}
                    <Row label="Port" value={String(app.container_port)} mono />
                    <Row label="Batas RAM" value={`${app.memory_limit_mb} MB`} mono />
                    <Row label="Batas CPU" value={String(app.cpu_limit)} mono />
                  </dl>
                </CardBody>
              </Card>
            </div>
          )}

          {tab === 'deployments' && (
            <div>
              {deployments.length === 0 && (
                <p className="text-sm text-ink-muted">Belum ada deployment.</p>
              )}
              <div className="space-y-2">
                {deployments.map((d) => (
                  <Card key={d.id}>
                    <CardBody>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs text-ink-subtle">
                          {d.id.slice(0, 10)}
                        </span>
                        <span className="text-sm">{d.status}</span>
                      </div>
                      {d.commit_message && (
                        <p className="mt-1.5 text-sm text-ink-muted">{d.commit_message}</p>
                      )}
                      {d.error && (
                        <p className="mt-1.5 font-mono text-xs text-danger">{d.error}</p>
                      )}
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {tab === 'logs' && <AppLogs appId={appId} />}
          {tab === 'env' && <AppEnv appId={appId} />}
          {tab === 'domains' && (
            <AppDomains appId={appId} containerPort={app.container_port} />
          )}
          {tab === 'git' && <AppGit appId={appId} />}
        </div>
      )}
    </AppShell>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
