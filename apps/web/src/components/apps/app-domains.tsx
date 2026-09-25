import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { Domain } from '../../lib/types'
import { Button } from '../ui/button'
import { Card, CardBody, CodeBlock } from '../ui/card'

const TLS_LABEL: Record<Domain['tls_status'], string> = {
  pending: 'Nunggu sertifikat',
  active: 'HTTPS aktif',
  failed: 'Gagal',
}

const TLS_CLASS: Record<Domain['tls_status'], string> = {
  pending: 'text-warn',
  active: 'text-ok',
  failed: 'text-danger',
}

export function AppDomains({
  appId,
  containerPort,
}: {
  appId: string
  containerPort: number
}) {
  const [domains, setDomains] = useState<Domain[]>([])
  const [hostname, setHostname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cekId, setCekId] = useState<string | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<{ domains: Domain[] }>(`/apps/${appId}/domains`)
    if (res.ok) setDomains(res.data?.domains ?? [])
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const res = await api.post(`/apps/${appId}/domains`, { hostname })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    setHostname('')
    await load()
  }

  async function remove(id: string) {
    await api.del(`/apps/${appId}/domains/${id}`)
    await load()
  }

  /**
   * Cek status TLS sekarang, jangan nunggu sinkronisasi otomatis.
   *
   * Sertifikat Let's Encrypt bisa keluar beberapa menit setelah domainnya
   * ditambahin. Tombol ini bikin nggak perlu nebak-nebak "udah jadi belum".
   */
  async function cekTls(id: string) {
    setCekId(id)
    setPesan(null)
    const res = await api.post<{ tlsStatus: Domain['tls_status'] }>(
      `/apps/${appId}/domains/${id}/check`
    )
    setCekId(null)

    if (!res.ok) {
      setPesan(res.error)
      return
    }

    setPesan(`Status TLS: ${TLS_LABEL[res.data?.tlsStatus ?? 'pending']}`)
    await load()
  }

  const tunnelCommand = `ssh -L ${containerPort}:localhost:${containerPort} user@ip-vps-kamu`

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <form onSubmit={add} className="space-y-3">
            <div>
              <label htmlFor="host" className="block text-sm font-medium">
                Domain
              </label>
              <input
                id="host"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="app.contoh.com"
                className="mt-1 min-h-touch w-full rounded-card border border-line bg-surface px-3 py-2 font-mono text-sm text-ink transition-hikari focus:border-brand"
                required
              />
              <p className="mt-1 text-xs text-ink-subtle">
                Arahin record A domain ini ke IP VPS dulu. Sertifikat HTTPS-nya
                diterbitin otomatis.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan...' : 'Tambah domain'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {pesan && (
        <p className="rounded-card bg-muted px-3 py-2 text-xs text-ink-muted">{pesan}</p>
      )}

      {domains.length === 0 ? (
        <p className="text-sm text-ink-muted">Belum ada domain.</p>
      ) : (
        <div className="space-y-2">
          {domains.map((d) => (
            <Card key={d.id}>
              <CardBody>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{d.hostname}</p>
                    <p className={`mt-0.5 text-xs ${TLS_CLASS[d.tls_status]}`}>
                      {TLS_LABEL[d.tls_status]}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => cekTls(d.id)}
                      disabled={cekId === d.id}
                    >
                      {cekId === d.id ? 'Ngecek...' : 'Cek TLS'}
                    </Button>
                    <Button variant="ghost" onClick={() => remove(d.id)}>
                      Hapus
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardBody>
          <h3 className="text-sm font-medium">Akses tanpa domain</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Kalau cuma mau ngakses dari laptop sendiri, pakai SSH tunnel aja. Lebih
            aman karena port-nya nggak kebuka ke internet.
          </p>
          <CodeBlock className="mt-3">{tunnelCommand}</CodeBlock>
        </CardBody>
      </Card>
    </div>
  )
}
