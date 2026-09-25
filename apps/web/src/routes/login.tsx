import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useSetupGate } from '../hooks/use-setup-gate'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const navigate = useNavigate()
  const checking = useSetupGate('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Kalau ternyata udah punya sesi yang sah, langsung masuk aja — daripada
  // nampilin form login ke orang yang sebenernya udah login.
  useEffect(() => {
    void (async () => {
      const me = await api.get<{ username: string }>('/auth/me')
      if (me.ok) void navigate({ to: '/' })
    })()
  }, [navigate])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const res = await api.post('/auth/login', { username, password })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    await navigate({ to: '/' })
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-ink-muted">
        Memuat...
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Masuk ke Hikari</h1>

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
            autoComplete="current-password"
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
          {busy ? 'Masuk...' : 'Masuk'}
        </button>
      </form>
    </main>
  )
}
