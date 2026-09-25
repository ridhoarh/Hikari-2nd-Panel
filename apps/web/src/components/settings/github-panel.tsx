import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'

type Installation = { id: number; account: { login: string } }
type Status = {
  connected: boolean
  appId?: string
  installations: Installation[]
  error?: string
}

export function GithubPanel() {
  const [status, setStatus] = useState<Status | null>(null)
  const [appId, setAppId] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<Status>('/github/status')
    if (res.ok) setStatus(res.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function simpan(e: React.FormEvent) {
    e.preventDefault()
    setBusy('simpan')
    setError(null)
    setPesan(null)

    const res = await api.post<{ installations: Installation[] }>('/github/app', {
      appId,
      privateKey,
    })
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }

    setPesan('GitHub App-nya kepasang.')
    setAppId('')
    setPrivateKey('')
    await load()
  }

  async function lepas() {
    setBusy('lepas')
    await api.del('/github/app')
    setBusy(null)
    setPesan('GitHub App-nya dilepas.')
    await load()
  }

  function pilihFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    void file.text().then(setPrivateKey)
  }

  if (!status) return <p className="text-sm text-ink-muted">Memuat...</p>

  return (
    <div className="space-y-3">
      {status.connected ? (
        <>
          <p className="text-sm text-green-700">
            Nyambung sebagai App ID <span className="font-mono">{status.appId}</span>.
          </p>

          {status.installations.length === 0 ? (
            <p className="rounded-card border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
              App-nya belum dipasang di akun mana pun. Buka halaman GitHub App, terus
              klik <strong>Install</strong>.
            </p>
          ) : (
            <div>
              <p className="text-xs font-medium text-ink-muted">Terpasang di</p>
              <ul className="mt-1 space-y-0.5">
                {status.installations.map((i) => (
                  <li key={i.id} className="text-xs">
                    <span className="font-mono">{i.account.login}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button variant="ghost" onClick={lepas} disabled={busy !== null}>
            {busy === 'lepas' ? 'Ngelepas...' : 'Lepas GitHub App'}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            Sambungin GitHub App biar Hikari bisa clone repo private tanpa perlu
            tempel deploy key satu-satu. Bikin App-nya dulu di{' '}
            <span className="font-mono">github.com/settings/apps/new</span>, kasih izin{' '}
            <strong>Contents: Read</strong> dan <strong>Commit statuses: Write</strong>.
          </p>

          <form onSubmit={simpan} className="space-y-2">
            <div>
              <label htmlFor="ghappid" className="block text-sm font-medium">
                App ID
              </label>
              <input
                id="ghappid"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full rounded-card border border-line px-3 py-2 font-mono text-sm transition-hikari focus:border-brand"
                required
              />
            </div>

            <div>
              <label htmlFor="ghkey" className="block text-sm font-medium">
                Private key (.pem)
              </label>
              <input
                id="ghkey"
                type="file"
                accept=".pem"
                onChange={pilihFile}
                className="mt-1 block w-full text-xs"
              />
              {privateKey && (
                <p className="mt-1 text-xs text-green-700">
                  File-nya kebaca ({privateKey.length} karakter).
                </p>
              )}
              <p className="mt-1 text-xs text-ink-subtle">
                Private key-nya disimpen terenkripsi di database.
              </p>
            </div>

            <Button type="submit" disabled={busy !== null || !privateKey}>
              {busy === 'simpan' ? 'Ngecek...' : 'Simpan'}
            </Button>
          </form>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {pesan && <p className="text-xs text-ink-muted">{pesan}</p>}

      <p className="text-xs text-ink-subtle">
        Kalau GitHub App-nya kepasang, repo GitHub dikloning pakai token instalasi —
        nggak perlu deploy key. Repo dari Git URL tetap pakai deploy key.
      </p>
    </div>
  )
}
