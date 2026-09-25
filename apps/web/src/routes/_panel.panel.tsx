import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody, CardHeader } from '../components/ui/card'
import { Field } from '../components/ui/list'
import { BackupSchedulePanel } from '../components/settings/backup-schedule-panel'

export const Route = createFileRoute('/_panel/panel')({ component: PanelSettingsPage })

type Settings = {
  version: string
  dataDir: string
  panelPort: number
  dockerAvailable: boolean
  ramUsedMb: number
  ramTotalMb: number
  disk: {
    total: number
    free: number
    used: number
    percent: number
    warning: boolean
    totalLabel: string
    usedLabel: string
    freeLabel: string
  } | null
}

function PanelSettingsPage() {
  const { username } = useAuth()
  const [settings, setSettings] = useState<Settings | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<Settings>('/settings')
    if (res.ok) setSettings(res.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell username={username ?? 'admin'} title="Panel">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Panel</h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-1.5 text-sm">
              <Field label="Versi Hikari" value={settings?.version ?? '—'} mono />
              <Field label="Folder data" value={settings?.dataDir ?? '—'} mono />
              {/* Port dibaca dari server, bukan ditulis tetap — kalau
                  HIKARI_PORT diganti, angka di sini ikut berubah. */}
              <Field label="Port panel" value={settings ? String(settings.panelPort) : '—'} mono />
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
              <Field
                label="Docker"
                value={settings ? (settings.dockerAvailable ? 'nyambung' : 'nggak nyambung') : '—'}
                mono
              />
              <Field
                label="RAM VPS"
                value={settings ? `${settings.ramUsedMb} / ${settings.ramTotalMb} MB` : '—'}
                mono
              />
              <Field
                label="Disk"
                value={
                  settings?.disk
                    ? `${settings.disk.usedLabel} / ${settings.disk.totalLabel} (${settings.disk.percent}%)`
                    : '—'
                }
                mono
              />
            </dl>

            {settings?.disk?.warning && (
              <p className="mt-3 rounded-card border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
                Disk-nya udah kepake {settings.disk.percent}% (sisa{' '}
                {settings.disk.freeLabel}). Disk penuh itu penyebab VPS mati yang
                paling sering. Coba bersihin image Docker yang nggak kepake:
                <code className="ml-1 font-mono">docker system prune -a</code>
              </p>
            )}
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
      </div>
    </AppShell>
  )
}
