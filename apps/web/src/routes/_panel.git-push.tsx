import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../hooks/use-auth'
import { AppShell } from '../components/layout/app-shell'
import { Card, CardBody, CardHeader } from '../components/ui/card'

export const Route = createFileRoute('/_panel/git-push')({ component: GitPushPage })

/**
 * Panduan Git Push Deploy.
 *
 * Setup-nya sengaja manual di VPS (butuh sudo), jadi halaman ini cuma
 * nyalin-perintah yang bisa dijalanin — bukan form. Tiap app punya deploy
 * key sendiri, dan panduan lengkapnya ada di README.
 */
function GitPushPage() {
  const { username } = useAuth()

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
            <h2 className="text-sm font-medium">Push dari repo kamu</h2>
          </CardHeader>
          <CardBody>
            <pre className="overflow-x-auto rounded-card bg-muted px-3 py-2.5 font-mono text-xs">
{`git remote add hikari git@IP-VPS:<slug-app>.git
git push hikari main`}
            </pre>
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
