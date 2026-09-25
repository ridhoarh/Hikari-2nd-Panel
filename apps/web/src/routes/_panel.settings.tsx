import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { Card, CardBody, CardHeader } from '../components/ui/card'
import { CloudflarePanel } from '../components/settings/cloudflare-panel'
import { BackupSchedulePanel } from '../components/settings/backup-schedule-panel'
import { GithubPanel } from '../components/settings/github-panel'

export const Route = createFileRoute('/_panel/settings')({ component: SettingsPage })

type Settings = {
  version: string
  dataDir: string
  dockerAvailable: boolean
  ramUsedMb: number
  ramTotalMb: number
}

function SettingsPage() {
  const { username } = useAuth()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<Settings>('/settings')
    if (res.ok) setSettings(res.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function syncCaddy() {
    const res = await api.post('/settings/sync-caddy')
    setPesan(res.ok ? 'Config Caddy disinkron ulang.' : res.error)
  }

  return (
    <AppShell username={username ?? 'admin'} title="Settings">
      <div className="max-w-xl space-y-4">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Panel</h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Versi Hikari</dt>
                <dd className="font-mono text-xs">{settings?.version ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Folder data</dt>
                <dd className="font-mono text-xs">{settings?.dataDir ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Port panel</dt>
                <dd className="font-mono text-xs">2508</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-subtle">
              Nama, domain, dan port panel diatur lewat file systemd
              (<span className="font-mono">/etc/systemd/system/hikari.service</span>),
              bukan dari halaman ini.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Status</h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Docker</dt>
                <dd className="font-mono text-xs">
                  {settings
                    ? settings.dockerAvailable
                      ? 'nyambung'
                      : 'nggak nyambung'
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">RAM VPS</dt>
                <dd className="font-mono text-xs">
                  {settings ? `${settings.ramUsedMb} / ${settings.ramTotalMb} MB` : '—'}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Backup otomatis</h2>
          </CardHeader>
          <CardBody>
            <BackupSchedulePanel />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">GitHub App</h2>
          </CardHeader>
          <CardBody>
            <GithubPanel />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Cloudflare</h2>
          </CardHeader>
          <CardBody>
            <CloudflarePanel />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Proxy</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-ink-muted">
              Kalau domain nggak kebaca sama Caddy, coba sinkron ulang.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Button variant="ghost" onClick={syncCaddy}>
                Sync Caddy
              </Button>
              {pesan && <span className="text-xs text-ink-muted">{pesan}</span>}
            </div>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  )
}
