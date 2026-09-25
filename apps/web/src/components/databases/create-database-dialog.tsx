import { useState } from 'react'
import { api } from '../../lib/api'
import type { DbEngine } from '../../lib/types'
import { Button } from '../ui/button'

const ENGINES: { id: DbEngine; label: string }[] = [
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'redis', label: 'Redis' },
]

export function CreateDatabaseDialog({
  projectId,
  onCreated,
  onClose,
}: {
  projectId: string
  onCreated: () => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [engine, setEngine] = useState<DbEngine>('postgres')
  const [memoryLimitMb, setMemoryLimitMb] = useState('512')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const res = await api.post<{ database: { password: string } }>(
      `/projects/${projectId}/databases`,
      { name, engine, memoryLimitMb: Number(memoryLimitMb) }
    )
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    setPassword(res.data!.database.password)
    onCreated()
  }

  const inputClass =
    'mt-1 w-full rounded-card border border-line px-3 py-2 transition-hikari focus:border-brand'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="db-dlg"
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-card border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="db-dlg" className="text-base font-semibold">
          Database baru
        </h2>

        {password ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ink-muted">
              Database-nya jadi. Password ini <strong>cuma muncul sekali</strong> —
              simpen dulu sebelum tutup.
            </p>
            <pre className="overflow-x-auto rounded-card bg-bg px-3 py-2 font-mono text-xs text-ink-muted">
              {password}
            </pre>
            <div className="flex justify-end pt-2">
              <Button onClick={onClose}>Udah, tutup</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div>
              <label htmlFor="dbname" className="block text-sm font-medium">
                Nama
              </label>
              <input
                id="dbname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Produksi"
                className={inputClass}
                required
                autoFocus
              />
            </div>

            <div>
              <span className="block text-sm font-medium">Engine</span>
              <div role="tablist" className="mt-1 flex gap-1 border-b border-line">
                {ENGINES.map((e) => (
                  <button
                    key={e.id}
                    role="tab"
                    aria-selected={engine === e.id}
                    type="button"
                    onClick={() => setEngine(e.id)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm transition-hikari ${
                      engine === e.id
                        ? 'border-brand font-medium text-brand-text'
                        : 'border-transparent text-ink-muted hover:text-ink'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="dbmem" className="block text-sm font-medium">
                Batas RAM (MB)
              </label>
              <input
                id="dbmem"
                type="number"
                min="64"
                value={memoryLimitMb}
                onChange={(e) => setMemoryLimitMb(e.target.value)}
                className={inputClass}
                required
              />
            </div>

            <p className="text-xs text-ink-subtle">
              Password 32 karakter dibikin otomatis. Volumenya juga otomatis,
              jadi data tetap ada walau container-nya diganti.
            </p>

            {error && (
              <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Batal
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Membikin...' : 'Bikin database'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
