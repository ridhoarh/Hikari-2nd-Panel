import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '../lib/api'
import { useSetupGate } from '../hooks/use-setup-gate'

export const Route = createFileRoute('/setup')({ component: SetupPage })

function SetupPage() {
  const navigate = useNavigate()
  const checking = useSetupGate('setup')
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [konfirmasi, setKonfirmasi] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== konfirmasi) {
      setError('Password sama konfirmasinya beda')
      return
    }

    setBusy(true)
    const res = await api.post<{ ok: boolean }>('/setup', { username, password })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    const login = await api.post('/auth/login', { username, password })
    if (login.ok) {
      await navigate({ to: '/' })
    } else {
      await navigate({ to: '/login' })
    }
  }

  // Setup-nya udah pernah dilakuin: jangan sempetin nampilin form-nya.
  if (checking) {
    return (
      <main className="flex h-full items-center justify-center text-sm text-ink-muted">
        Memuat...
      </main>
    )
  }

  return (
    <main className="mx-auto flex h-full max-w-md flex-col justify-center overflow-y-auto px-6">
      <h1 className="text-2xl font-semibold">Selamat datang di Hikari</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Bikin akun admin dulu. Password minimal 6 karakter.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 transition-hikari focus:border-brand"
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 transition-hikari focus:border-brand"
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label htmlFor="konfirmasi" className="block text-sm font-medium">
            Ulangi password
          </label>
          <input
            id="konfirmasi"
            type="password"
            value={konfirmasi}
            onChange={(e) => setKonfirmasi(e.target.value)}
            className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 transition-hikari focus:border-brand"
            autoComplete="new-password"
            required
          />
        </div>

        {error && (
          <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-card bg-brand px-4 py-2.5 font-medium text-white transition-hikari hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? 'Menyimpan...' : 'Bikin akun admin'}
        </button>
      </form>
    </main>
  )
}
