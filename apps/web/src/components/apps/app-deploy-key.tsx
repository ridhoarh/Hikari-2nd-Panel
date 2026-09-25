import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'
import { CodeBlock } from '../ui/card'

/**
 * Public key deploy buat app ini.
 *
 * Dipakai buat clone repo privat: key-nya ditempel sebagai Deploy key di
 * GitHub. Endpoint-nya udah lama ada, tapi halamannya kelupaan dibikin —
 * jadi repo privat nggak bisa di-clone sama sekali.
 */
export function AppDeployKey({ appId }: { appId: string }) {
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<{ publicKey: string }>(`/apps/${appId}/deploy-key`)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setPublicKey(res.data?.publicKey ?? null)
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  async function salin() {
    if (!publicKey) return
    try {
      await navigator.clipboard.writeText(publicKey)
      setPesan('Public key disalin.')
      setError(null)
    } catch {
      setError('Nggak bisa nyalin otomatis — salin manual dari kotak di bawah.')
    }
  }

  if (error && !publicKey) {
    return (
      <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
        {error}
      </p>
    )
  }

  if (!publicKey) return <p className="text-sm text-ink-muted">Memuat...</p>

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Buat repo privat: tempel key ini di GitHub → repo → Settings → Deploy
        keys → Add deploy key. Centang <em>Allow write access</em> cuma kalau
        Hikari perlu push balik.
      </p>

      <CodeBlock className="break-all">{publicKey}</CodeBlock>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={salin}>
          Salin public key
        </Button>
        {pesan && <span className="text-xs text-ok">{pesan}</span>}
      </div>

      {error && (
        <p role="alert" className="rounded-card bg-warn/10 px-3 py-2 text-xs text-warn">
          {error}
        </p>
      )}
    </div>
  )
}
