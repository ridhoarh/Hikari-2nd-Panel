import type { ReactNode } from 'react'
import { Sidebar } from './sidebar'

/**
 * Kerangka halaman panel.
 *
 * Tingginya dikunci ke layar (`h-screen`), dan cuma bagian isinya yang
 * di-scroll. Sebelumnya tinggi ikut memanjang bareng konten, jadi scrollbar
 * halaman muncul walau sidebar dan header-nya udah penuh — dan di layar lebar
 * kelihatan kayak ada ruang kosong yang bisa di-scroll padahal nggak ada isinya.
 */
export function AppShell({
  username,
  title,
  subtitle,
  actions,
  children,
}: {
  username: string
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex h-full">
      <Sidebar username={username} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {subtitle && (
              <div className="mt-0.5 truncate text-xs text-ink-subtle">{subtitle}</div>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  )
}
