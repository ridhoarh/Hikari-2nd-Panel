import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useVisibleInterval } from '../../hooks/use-visible-interval'
import { Button } from '../ui/button'

type LogLine = { stream: 'stdout' | 'stderr'; text: string }

export function AppLogs({ appId }: { appId: string }) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [auto, setAuto] = useState(false)

  const load = useCallback(async () => {
    const res = await api.get<{ lines: LogLine[] }>(`/apps/${appId}/logs?tail=200`)
    setLoading(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setLines(res.data?.lines ?? [])
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  // Cuma polling pas dicentang DAN tab browser-nya kelihatan.
  useVisibleInterval(() => void load(), 10_000, auto)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={load}>
          Muat ulang
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Ikutin otomatis (10 detik)
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="max-h-[32rem] overflow-auto rounded-card border border-line bg-bg p-4">
        {loading && <p className="text-xs text-ink-subtle">Memuat...</p>}

        {!loading && lines.length === 0 && (
          <p className="text-xs text-ink-subtle">Belum ada log.</p>
        )}

        {lines.map((line, i) => (
          <p
            key={i}
            className={`whitespace-pre-wrap font-mono text-xs leading-relaxed ${
              line.stream === 'stderr' ? 'text-danger' : 'text-ink-muted'
            }`}
          >
            {line.text}
          </p>
        ))}
      </div>
    </div>
  )
}
