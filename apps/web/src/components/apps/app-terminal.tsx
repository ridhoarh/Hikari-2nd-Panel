import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui/button'

/**
 * Terminal container lewat WebSocket → `docker exec`.
 *
 * Sengaja nggak pakai xterm.js: itu nambah ~300KB ke bundle panel yang
 * cuma dipakai satu orang. Yang dipakai cuma `<pre>` + keydown handler.
 * Konsekuensinya nggak ada warna ANSI dan nggak ada layout kursor —
 * buat ngintip log atau jalanin satu-dua perintah, itu cukup.
 */
export function AppTerminal({ appId }: { appId: string }) {
  const [output, setOutput] = useState('')
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const outRef = useRef<HTMLPreElement | null>(null)

  const connect = useCallback(() => {
    setError(null)
    setOutput('')

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/api/apps/${appId}/terminal`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      const cols = Math.max(40, Math.floor((outRef.current?.clientWidth ?? 600) / 8))
      ws.send(JSON.stringify({ type: 'resize', cols, rows: 30 }))
    }

    ws.onmessage = (e) => {
      setOutput((prev) => {
        // Batasi biar tab yang kebuka lama nggak ngabisin memori.
        const next = prev + (typeof e.data === 'string' ? e.data : '')
        return next.length > 200_000 ? next.slice(-150_000) : next
      })
    }

    ws.onerror = () => setError('Nggak bisa nyambung ke terminal.')
    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
    }
  }, [appId])

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  useEffect(() => {
    if (outRef.current) {
      outRef.current.scrollTop = outRef.current.scrollHeight
    }
  }, [output])

  function onKeyDown(e: React.KeyboardEvent) {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    // Biar browser nggak nge-scroll halaman pas spasi dipencet.
    if (e.key === ' ' || e.key === 'Tab') e.preventDefault()

    let data: string | null = null

    if (e.key === 'Enter') data = '\r'
    else if (e.key === 'Backspace') data = '\x7f'
    else if (e.key === 'Tab') data = '\t'
    else if (e.key === 'Escape') data = '\x1b'
    else if (e.key === 'ArrowUp') data = '\x1b[A'
    else if (e.key === 'ArrowDown') data = '\x1b[B'
    else if (e.key === 'ArrowRight') data = '\x1b[C'
    else if (e.key === 'ArrowLeft') data = '\x1b[D'
    else if (e.key === 'c' && e.ctrlKey) data = '\x03'
    else if (e.key === 'd' && e.ctrlKey) data = '\x04'
    else if (e.key === 'l' && e.ctrlKey) data = '\x0c'
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) data = e.key

    if (data) {
      e.preventDefault()
      ws.send(data)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={connect} disabled={connected}>
          {connected ? 'Udah nyambung' : 'Buka terminal'}
        </Button>
        {connected && (
          <Button
            variant="ghost"
            onClick={() => {
              wsRef.current?.close()
            }}
          >
            Tutup
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <pre
        ref={outRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        // Tingginya ikut layar: `55vh` di HP biar tombol di bawahnya tetap
        // kelihatan, `24rem` di layar besar. `h-96` tetap dulu bikin
        // terminalnya kepanjangan di HP — halaman jadi harus digeser.
        className="h-[55vh] overflow-auto rounded-card border border-line bg-bg p-3 font-mono text-xs leading-relaxed text-ink-muted outline-none focus:border-brand sm:h-[24rem]"
      >
        {output || (connected ? '' : 'Klik "Buka terminal" dulu.')}
      </pre>

      <p className="text-xs text-ink-subtle">
        Ini shell di <strong>dalam container</strong>, bukan di VPS. Yang bisa
        dilakuin cuma sebanyak yang ada di image-nya.
      </p>
    </div>
  )
}
