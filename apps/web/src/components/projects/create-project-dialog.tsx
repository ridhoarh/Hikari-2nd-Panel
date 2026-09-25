import { useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'

export function CreateProjectDialog({
  onCreated,
  onClose,
}: {
  onCreated: () => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const res = await api.post('/projects', {
      name,
      description: description || null,
    })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    onCreated()
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dlg-title"
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-card border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dlg-title" className="text-base font-semibold">
          Project baru
        </h2>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="pname" className="block text-sm font-medium">
              Nama
            </label>
            <input
              id="pname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Blog"
              className="mt-1 w-full rounded-card border border-line px-3 py-2 transition-hikari focus:border-brand"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="pdesc" className="block text-sm font-medium">
              Deskripsi <span className="text-ink-subtle">(opsional)</span>
            </label>
            <input
              id="pdesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-card border border-line px-3 py-2 transition-hikari focus:border-brand"
            />
          </div>

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
              {busy ? 'Menyimpan...' : 'Bikin'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
