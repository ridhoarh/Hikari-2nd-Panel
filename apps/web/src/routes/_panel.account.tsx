import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { Card, CardBody, CardHeader } from '../components/ui/card'
import { Field } from '../components/ui/list'

export const Route = createFileRoute('/_panel/account')({ component: AccountPage })

function AccountPage() {
  const { username } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [konfirmasi, setKonfirmasi] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPesan(null)

    if (newPassword !== konfirmasi) {
      setError('Password baru sama konfirmasinya beda')
      return
    }

    setBusy(true)
    const res = await api.post('/auth/password', { currentPassword, newPassword })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setKonfirmasi('')
    setPesan('Password diganti.')
  }

  return (
    <AppShell username={username ?? 'admin'} title="Akun">
      <div className="max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Akun</h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-1.5 text-sm">
              <Field label="Username" value={username ?? '—'} mono />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Ganti password</h2>
          </CardHeader>
          <CardBody>
            <form onSubmit={submit} className="max-w-sm space-y-3">
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium">
                  Password sekarang
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 transition-hikari focus:border-brand"
                  required
                />
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium">
                  Password baru
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 transition-hikari focus:border-brand"
                  required
                />
                <p className="mt-1 text-xs text-ink-subtle">Minimal 6 karakter.</p>
              </div>

              <div>
                <label htmlFor="konfirmasiPassword" className="block text-sm font-medium">
                  Ulangi password baru
                </label>
                <input
                  id="konfirmasiPassword"
                  type="password"
                  value={konfirmasi}
                  onChange={(e) => setKonfirmasi(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 transition-hikari focus:border-brand"
                  required
                />
              </div>

              {error && (
                <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              {pesan && (
                <p className="rounded-card bg-ok/10 px-3 py-2 text-sm text-ok">{pesan}</p>
              )}

              <Button type="submit" disabled={busy}>
                {busy ? 'Nyimpen...' : 'Ganti password'}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  )
}
