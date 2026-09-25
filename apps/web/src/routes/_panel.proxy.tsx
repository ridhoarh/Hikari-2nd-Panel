import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { Card, CardBody, CardHeader } from '../components/ui/card'

export const Route = createFileRoute('/_panel/proxy')({ component: ProxyPage })

/** Caddy: baca ulang Caddyfile kalau domain nggak kebaca. */
function ProxyPage() {
  const { username } = useAuth()
  const [pesan, setPesan] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function syncCaddy() {
    setBusy(true)
    const res = await api.post('/settings/sync-caddy')
    setBusy(false)
    setPesan(res.ok ? 'Config Caddy disinkron ulang.' : res.error)
  }

  return (
    <AppShell username={username ?? 'admin'} title="Proxy">
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Caddy</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-ink-muted">
              Caddy yang ngurus domain dan HTTPS otomatis. Config-nya ditulis
              ulang tiap ada domain baru — tombol di bawah buat maksa baca ulang
              kalau ada yang nggak kebaca.
            </p>

            <div className="mt-3 flex items-center gap-3">
              <Button variant="ghost" onClick={syncCaddy} disabled={busy}>
                {busy ? 'Nyinkron...' : 'Sync Caddy'}
              </Button>
              {pesan && <span className="text-xs text-ink-muted">{pesan}</span>}
            </div>

            <p className="mt-4 text-xs text-ink-subtle">
              Kalau Caddy-nya sendiri nggak jalan, cek lewat SSH:{' '}
              <code className="font-mono">systemctl status caddy</code>
            </p>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  )
}
