import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'
import { CodeBlock } from '../ui/card'

type Info = { url: string; secret: string; events: string[] }

/**
 * Info webhook GitHub.
 *
 * Tanpa ini, auto-deploy nggak bisa dipakai sama sekali: URL dan secret-nya
 * cuma ada di server, dan nggak ada cara buat nyalin ke dashboard GitHub.
 * Endpoint-nya udah lama ada, tapi halamannya kelupaan dibikin.
 */
export function AppWebhook({ appId }: { appId: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [bukaSecret, setBukaSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<Info>(`/apps/${appId}/webhook`)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setInfo(res.data ?? null)
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  /** URL relatif di server, tapi GitHub butuh yang absolut. */
  function urlLengkap(path: string): string {
    return `${window.location.origin}${path}`
  }

  async function salin(teks: string, label: string) {
    try {
      await navigator.clipboard.writeText(teks)
      setError(null)
    } catch {
      setError(`Nggak bisa nyalin ${label} otomatis — salin manual dari kotak di bawah.`)
    }
  }

  if (error && !info) {
    return (
      <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
        {error}
      </p>
    )
  }

  if (!info) return <p className="text-sm text-ink-muted">Memuat...</p>

  const url = urlLengkap(info.url)

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-ink-muted">
          Tempel di GitHub → repo → Settings → Webhooks → Add webhook. Pilih
          event <span className="font-mono">push</span> aja.
        </p>
      </div>

      <div>
        <p className="text-xs text-ink-subtle">Payload URL</p>
        <CodeBlock className="mt-1 break-all">{url}</CodeBlock>
        <Button variant="ghost" className="mt-2" onClick={() => salin(url, 'URL')}>
          Salin URL
        </Button>
      </div>

      <div>
        <p className="text-xs text-ink-subtle">Secret</p>
        <CodeBlock className="mt-1 break-all">
          {bukaSecret ? info.secret : '•'.repeat(32)}
        </CodeBlock>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setBukaSecret(!bukaSecret)}>
            {bukaSecret ? 'Sembunyiin' : 'Tampilkan'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => salin(info.secret, 'secret')}
            disabled={!bukaSecret}
          >
            Salin secret
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          Secret-nya disensor sampai kamu klik Tampilkan — biar nggak kebaca
          orang lewat kalau layarnya lagi kebuka.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-card bg-warn/10 px-3 py-2 text-xs text-warn">
          {error}
        </p>
      )}
    </div>
  )
}
