import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'
import { Card, CardBody } from '../ui/card'

type GitInfo = {
  sshUrl: string
  repoPath: string
  commands: string[]
  publicKey: string | null
}

export function AppGit({ appId }: { appId: string }) {
  const [info, setInfo] = useState<GitInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pesan, setPesan] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<GitInfo>(`/apps/${appId}/git`)
    if (res.ok) setInfo(res.data)
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  async function bikinDeployKey() {
    setBusy(true)
    setError(null)
    setPesan(null)
    const res = await api.post<{ publicKey: string }>('/git/deploy-key')
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setPesan('Deploy key dibikin. Salin public key-nya ke ~/.ssh/authorized_keys.')
    await load()
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="text-sm font-medium">Push buat deploy</p>
          <p className="mt-1 text-sm text-ink-muted">
            Push ke remote Hikari, dan Hikari otomatis build terus deploy.
            Nggak perlu setting webhook.
          </p>

          {info && (
            <>
              <p className="mt-3 text-xs font-medium text-ink-muted">
                Jalanin di folder repo kamu
              </p>
              <pre className="mt-1 overflow-x-auto rounded-card bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200">
                {info.commands.join('\n')}
              </pre>

              <p className="mt-3 text-xs font-medium text-ink-muted">Remote</p>
              <pre className="mt-1 overflow-x-auto rounded-card bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200">
                {info.sshUrl}
              </pre>
            </>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
          {pesan && (
            <p className="mt-3 rounded-card bg-brand-soft px-3 py-2 text-sm text-brand-text">
              {pesan}
            </p>
          )}

          <div className="mt-3">
            <Button variant="ghost" onClick={bikinDeployKey} disabled={busy}>
              {busy ? 'Membikin...' : 'Bikin deploy key'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {info?.publicKey && (
        <Card>
          <CardBody>
            <p className="text-sm font-medium">Deploy key</p>
            <p className="mt-1 text-xs text-ink-subtle">
              Tempelin baris ini di{' '}
              <span className="font-mono">~/.ssh/authorized_keys</span> di VPS. Baris
              ini udah dikunci ke <span className="font-mono">git-shell</span>, jadi
              cuma bisa dipakai buat git — nggak bisa dapet shell.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-card bg-neutral-950 px-3 py-2 font-mono text-[10px] text-neutral-200">
              {info.publicKey}
            </pre>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <p className="text-sm font-medium">Mau dikunci ke satu app?</p>
          <p className="mt-1 text-xs text-ink-subtle">
            Deploy key di atas berlaku buat semua app. Kalau mau lebih ketat, bikin
            pasangan kunci sendiri terus tempelin di{' '}
            <span className="font-mono">authorized_keys</span> dengan awalan{' '}
            <span className="font-mono">command=&quot;git-shell -c ...&quot;</span>.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
