import { Link, useRouter } from '@tanstack/react-router'
import { api } from '../../lib/api'

export function Sidebar({ username }: { username: string }) {
  const router = useRouter()

  async function logout() {
    await api.post('/auth/logout')
    await router.navigate({ to: '/login' })
  }

  const itemClass =
    'block rounded-card px-3 py-2 text-sm text-ink-muted transition-hikari hover:bg-muted hover:text-ink'
  const activeClass = 'bg-brand-soft text-brand-text font-medium'

  return (
    <nav
      aria-label="Navigasi utama"
      className="flex w-56 shrink-0 flex-col border-r border-line bg-muted px-3 py-4"
    >
      <div className="px-3 pb-4">
        <span className="text-base font-semibold">Hikari</span>
      </div>

      <div className="space-y-1">
        <Link
          to="/"
          className={itemClass}
          activeProps={{ className: `${itemClass} ${activeClass}` }}
        >
          Projects
        </Link>
        <Link
          to="/settings"
          className={itemClass}
          activeProps={{ className: `${itemClass} ${activeClass}` }}
        >
          Settings
        </Link>
      </div>

      <div className="mt-auto border-t border-line pt-4">
        <p className="px-3 text-xs text-ink-subtle">Masuk sebagai</p>
        <p className="px-3 pb-2 text-sm font-medium">{username}</p>
        <button
          type="button"
          onClick={logout}
          className={`${itemClass} w-full text-left`}
        >
          Keluar
        </button>
      </div>
    </nav>
  )
}
