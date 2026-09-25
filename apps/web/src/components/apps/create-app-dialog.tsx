import { useState } from 'react'
import { api } from '../../lib/api'
import type { SourceType } from '../../lib/types'
import { Button } from '../ui/button'

const TABS: { id: SourceType; label: string }[] = [
  { id: 'github', label: 'GitHub' },
  { id: 'giturl', label: 'Git URL' },
  { id: 'image', label: 'Docker Image' },
]

export function CreateAppDialog({
  projectId,
  onCreated,
  onClose,
}: {
  projectId: string
  onCreated: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<SourceType>('github')
  const [name, setName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [imageRef, setImageRef] = useState('')
  const [containerPort, setContainerPort] = useState('3000')
  const [memoryLimitMb, setMemoryLimitMb] = useState('512')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const payload = {
      name,
      sourceType: tab,
      repoUrl: tab === 'image' ? null : repoUrl,
      branch: tab === 'image' ? null : branch,
      imageRef: tab === 'image' ? imageRef : null,
      containerPort: Number(containerPort),
      memoryLimitMb: Number(memoryLimitMb),
    }

    const res = await api.post(`/projects/${projectId}/apps`, payload)
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    onCreated()
    onClose()
  }

  const inputClass =
    'mt-1 w-full rounded-card border border-line px-3 py-2 transition-hikari focus:border-brand'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-dlg"
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-card border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="app-dlg" className="text-base font-semibold">
          App baru
        </h2>

        <div role="tablist" className="mt-4 flex gap-1 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-hikari ${
                tab === t.id
                  ? 'border-brand font-medium text-brand-text'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="aname" className="block text-sm font-medium">
              Nama app
            </label>
            <input
              id="aname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="web"
              className={inputClass}
              required
              autoFocus
            />
          </div>

          {tab !== 'image' && (
            <>
              <div>
                <label htmlFor="repo" className="block text-sm font-medium">
                  Repo URL
                </label>
                <input
                  id="repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder={
                    tab === 'github'
                      ? 'git@github.com:user/repo.git'
                      : 'https://gitlab.com/user/repo.git'
                  }
                  className={`${inputClass} font-mono`}
                  required
                />
              </div>

              <div>
                <label htmlFor="branch" className="block text-sm font-medium">
                  Branch
                </label>
                <input
                  id="branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className={`${inputClass} font-mono`}
                  required
                />
              </div>
            </>
          )}

          {tab === 'image' && (
            <div>
              <label htmlFor="img" className="block text-sm font-medium">
                Image
              </label>
              <input
                id="img"
                value={imageRef}
                onChange={(e) => setImageRef(e.target.value)}
                placeholder="nginx:alpine"
                className={`${inputClass} font-mono`}
                required
              />
              <p className="mt-1 text-xs text-ink-subtle">
                Nggak usah build. Cocok buat app berat yang gagal kalau di-build di VPS.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="port" className="block text-sm font-medium">
                Port container
              </label>
              <input
                id="port"
                type="number"
                min="1"
                max="65535"
                value={containerPort}
                onChange={(e) => setContainerPort(e.target.value)}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor="mem" className="block text-sm font-medium">
                Batas RAM (MB)
              </label>
              <input
                id="mem"
                type="number"
                min="64"
                value={memoryLimitMb}
                onChange={(e) => setMemoryLimitMb(e.target.value)}
                className={inputClass}
                required
              />
            </div>
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
              {busy ? 'Menyimpan...' : 'Bikin app'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
