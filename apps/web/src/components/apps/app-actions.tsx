import { useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'

export function AppActions({
  appId,
  onChanged,
}: {
  appId: string
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(label: string, path: string) {
    setBusy(label)
    setError(null)
    const res = await api.post(`/apps/${appId}${path}`)
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }
    onChanged()
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => act('deploy', '/deploy')} disabled={busy !== null}>
          {busy === 'deploy' ? 'Ngantre...' : 'Deploy'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => act('restart', '/restart')}
          disabled={busy !== null}
        >
          {busy === 'restart' ? 'Restart...' : 'Restart'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => act('stop', '/stop')}
          disabled={busy !== null}
        >
          {busy === 'stop' ? 'Ngasih stop...' : 'Stop'}
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-card bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
