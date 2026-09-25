import { Link, useRouter } from '@tanstack/react-router'
import { api } from '../../lib/api'

/**
 * Navigasi utama.
 *
 * Dikelompokkan biar fitur yang dulu cuma bisa dijangkau lewat tab di dalam
 * halaman project/app punya tempat yang kelihatan. Urutannya sengaja dibuat
 * alur pakai: ngeliat keadaan dulu (Overview), baru kerja (Deploy, Data),
 * baru yang jarang disentuh (Networking, Sources).
 *
 * Tiap entri HARUS punya halaman yang beneran ada isinya — nggak ada menu
 * yang cuma ngarah ke halaman kosong.
 */
type NavItem = { to: string; label: string }
type NavGroup = { label: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Ringkasan' },
      { to: '/activity', label: 'Aktivitas' },
    ],
  },
  {
    label: 'Deploy',
    items: [
      { to: '/applications', label: 'Applications' },
      { to: '/projects', label: 'Projects' },
    ],
  },
  {
    label: 'Data',
    items: [
      { to: '/databases', label: 'Databases' },
      { to: '/storage', label: 'Storage' },
      { to: '/backups', label: 'Backups' },
    ],
  },
  {
    label: 'Networking',
    items: [
      { to: '/domains', label: 'Domains' },
      { to: '/proxy', label: 'Proxy' },
      { to: '/cloudflare', label: 'Cloudflare' },
    ],
  },
  {
    label: 'Sources',
    items: [
      { to: '/github', label: 'GitHub App' },
      { to: '/git-push', label: 'Git Push' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/panel', label: 'Panel' },
      { to: '/account', label: 'Akun' },
    ],
  },
]

export function Sidebar({ username }: { username: string }) {
  const router = useRouter()

  async function logout() {
    await api.post('/auth/logout')
    await router.navigate({ to: '/login' })
  }

  const itemClass =
    'flex min-h-touch items-center rounded-card px-3 text-sm text-ink-muted transition-hikari hover:bg-surface hover:text-ink md:min-h-0 md:py-1.5'
  const activeClass = 'bg-brand-soft text-brand-text font-medium'

  return (
    <nav
      aria-label="Navigasi utama"
      // Sidebar punya scroll sendiri; tingginya penuh dan nggak ikut tinggi
      // konten. `overscroll-contain` biar scroll di sini nggak nyeret halaman.
      className="flex h-full w-60 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-line bg-muted px-3 py-4"
    >
      <div className="shrink-0 px-3 pb-5">
        <span className="text-base font-semibold">Hikari</span>
      </div>

      <div className="flex-1 space-y-5">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={itemClass}
                  activeProps={{ className: `${itemClass} ${activeClass}` }}
                  activeOptions={{ exact: item.to === '/' }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 shrink-0 border-t border-line pt-4">
        <p className="px-3 text-xs text-ink-subtle">Masuk sebagai</p>
        <p className="truncate px-3 pb-2 text-sm font-medium">{username}</p>
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
