import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'

type CfZone = { id: string; name: string }
type Status = {
  connected: boolean
  zones: CfZone[]
  error?: string
  vpsIp: string | null
}

export function CloudflarePanel() {
  const [status, setStatus] = useState<Status | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasil, setHasil] = useState<
    { hostname: string; ok: boolean; error?: string }[] | null
  >(null)

  const load = useCallback(async () => {
    const res = await api.get<Status>('/cloudflare/status')
    if (res.ok) setStatus(res.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function simpanToken(e: React.FormEvent) {
    e.preventDefault()
    setBusy('token')
    setError(null)
    setHasil(null)

    const res = await api.post<{ zones: CfZone[] }>('/cloudflare/token', { token })
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setToken('')
    await load()
  }

  async function hapusToken() {
    setBusy('hapus')
    await api.del('/cloudflare/token')
    setBusy(null)
    await load()
  }

  async function syncDns() {
    setBusy('dns')
    setError(null)
    setHasil(null)

    const res = await api.post<{
      ok: boolean
      hasil: { hostname: string; ok: boolean; error?: string }[]
    }>('/cloudflare/sync-dns')
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setHasil(res.data!.hasil)
  }

  if (!status) {
    return <p className="text-sm text-ink-muted">Memuat...</p>
  }

  return (
    <div className="space-y-3">
      {status.connected ? (
        <>
          <p className="text-sm text-green-700">Token-nya jalan.</p>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Zone</dt>
              <dd className="font-mono text-xs">
                {status.zones.map((z) => z.name).join(', ') || '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">IP buat record A</dt>
              <dd className="font-mono text-xs">{status.vpsIp ?? 'belum di-set'}</dd>
            </div>
          </dl>

          {!status.vpsIp && (
            <p className="rounded-card border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
              IP VPS belum di-set. Tambahin{' '}
              <span className="font-mono">Environment=HIKARI_VPS_IP=... </span>
              di file systemd, terus restart Hikari.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={syncDns}
              disabled={busy !== null || !status.vpsIp}
            >
              {busy === 'dns' ? 'Nyinkron...' : 'Bikin record DNS'}
            </Button>
            <Button variant="ghost" onClick={hapusToken} disabled={busy !== null}>
              {busy === 'hapus' ? 'Ngehapus...' : 'Hapus token'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            Isi token API Cloudflare biar Hikari bisa bikin record A sendiri pas
            kamu nambah domain. Izin yang dibutuhin cukup <strong>Edit DNS</strong>{' '}
            buat zone-nya.
          </p>
          <form onSubmit={simpanToken} className="space-y-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="token API Cloudflare"
              className="w-full rounded-card border border-line px-3 py-2 font-mono text-sm transition-hikari focus:border-brand"
              required
            />
            <Button type="submit" disabled={busy !== null}>
              {busy === 'token' ? 'Ngecek...' : 'Simpan token'}
            </Button>
          </form>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {hasil && (
        <div className="space-y-1">
          {hasil.map((h) => (
            <p
              key={h.hostname}
              className={`text-xs ${h.ok ? 'text-green-700' : 'text-danger'}`}
            >
              {h.ok ? '✓' : '✗'} <span className="font-mono">{h.hostname}</span>
              {h.error ? ` — ${h.error}` : ''}
            </p>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-subtle">
        Record-nya dibikin DNS-only (nggak lewat proxy Cloudflare). Proxy cuma
        nge-handle HTTP, jadi database TCP nggak bakal jalan kalau di-proxy.
        Sertifikat HTTPS-nya tetap dari Caddy.
      </p>
    </div>
  )
}
