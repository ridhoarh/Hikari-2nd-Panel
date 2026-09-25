import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import { api } from '../lib/api'
import { AppShell } from '../components/layout/app-shell'
import { Button } from '../components/ui/button'
import { Card, CardBody, CardHeader, CodeBlock } from '../components/ui/card'

export const Route = createFileRoute('/_panel/git-push')({ component: GitPushPage })

/**
 * Panduan Git Push Deploy.
 *
 * Setup-nya sengaja manual di VPS (butuh sudo), jadi halaman ini cuma
 * nyalin-perintah yang bisa dijalanin — bukan form. Tiap app punya deploy
 * key sendiri, dan panduan lengkapnya ada di README.
 *
 * Dua tombol di bawah nyambung ke endpoint yang dulu kelupaan dibikin UI-nya:
 * bikin ulang bare repo (kalau repo-nya rusak) dan pakai public key sendiri
 * (kalau mau push dari mesin lain tanpa pakai key bawaan Hikari).
 */
function GitPushPage() {
  const { username } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publicKey, setPublicKey] = useState('')

  async function bikinUlangRepo() {
    setBusy('repo')
    setPesan(null)
    setError(null)
    const res = await api.post<{ repos: { slug: string }[] }>('/git/setup')
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setPesan(`${res.data?.repos.length ?? 0} bare repo dipastiin ada.`)
  }

  async function pakaiKeySendiri(e: React.FormEvent) {
    e.preventDefault()
    setBusy('key')
    setPesan(null)
    setError(null)
    const res = await api.post<{ publicKey: string }>('/git/ssh-key', {
      publicKey: publicKey.trim(),
    })
    setBusy(null)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setPublicKey('')
    setPesan('Public key disimpen. Jalanin ulang perintah authorized_keys di atas.')
  }

  return (
    <AppShell username={username ?? 'admin'} title="Git Push">
      <div className="max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Apa ini</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-ink-muted">
              Push ke remote Hikari, langsung build — tanpa lewat webhook
              GitHub. Hikari nggak ngejalanin SSH server sendiri; yang dipakai
              sshd bawaan VPS, dengan <span className="font-mono">authorized_keys</span>{' '}
              yang command-nya dikunci ke{' '}
              <span className="font-mono">git-shell</span>. Jadi deploy key-nya
              cuma bisa buat git, nggak bisa dapet shell.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Setup sekali di VPS</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-ink-muted">
              Jalanin lewat SSH di VPS-nya (butuh sudo):
            </p>

            <pre className="mt-3 overflow-x-auto rounded-card bg-muted px-3 py-2.5 font-mono text-xs">
{`# 1. bikin user git
sudo useradd -m -s /usr/bin/git-shell git
sudo mkdir -p /home/git/.ssh && sudo chmod 700 /home/git/.ssh

# 2. ambil authorized_keys dari Hikari
#    (bikin deploy key dulu di tab Git pada app-nya)
sudo curl -s http://127.0.0.1:2508/api/git/authorized-keys \\
  -H "Cookie: hikari_session=<cookie-kamu>" \\
  > /home/git/.ssh/authorized_keys
sudo chown -R git:git /home/git/.ssh
sudo chmod 600 /home/git/.ssh/authorized_keys`}
            </pre>

            <p className="mt-3 text-xs text-ink-subtle">
              Cookie-nya harus punya <span className="font-mono">git-shell</span>;
              tanpa itu, siapa pun yang punya deploy key bisa dapet shell.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Perawatan</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-ink-muted">
              Bare repo tiap app dibikin otomatis. Kalau ada yang rusak atau
              kehapus, tombol di bawah bakal mastiin semuanya ada lagi — data
              yang udah ada nggak disentuh.
            </p>
            <Button
              variant="ghost"
              className="mt-3"
              onClick={bikinUlangRepo}
              disabled={busy !== null}
            >
              {busy === 'repo' ? 'Nyiapin...' : 'Bikin ulang bare repo'}
            </Button>

            <form onSubmit={pakaiKeySendiri} className="mt-5 space-y-2 border-t border-line pt-4">
              <label htmlFor="pubkey" className="block text-sm font-medium">
                Pakai public key sendiri
              </label>
              <p className="text-xs text-ink-muted">
                Kalau mau push dari mesin lain tanpa pakai key bawaan Hikari,
                tempel public key-mu di sini.
              </p>
              <textarea
                id="pubkey"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="ssh-ed25519 AAAAC3Nza... nama@mesin"
                rows={3}
                className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 font-mono text-xs text-ink transition-hikari focus:border-brand"
                required
              />
              <Button type="submit" variant="ghost" disabled={busy !== null}>
                {busy === 'key' ? 'Nyimpen...' : 'Simpen public key'}
              </Button>
            </form>

            {pesan && (
              <p className="mt-3 rounded-card bg-ok/10 px-3 py-2 text-xs text-ok">{pesan}</p>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-card bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Push dari repo kamu</h2>
          </CardHeader>
          <CardBody>
            <CodeBlock>
{`git remote add hikari git@IP-VPS:<slug-app>.git
git push hikari main`}
            </CodeBlock>
            <p className="mt-3 text-xs text-ink-subtle">
              Bare repo-nya dibikin otomatis tiap app dibuat, di{' '}
              <span className="font-mono">&lt;dataDir&gt;/repos/&lt;slug&gt;.git</span>.
            </p>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  )
}
