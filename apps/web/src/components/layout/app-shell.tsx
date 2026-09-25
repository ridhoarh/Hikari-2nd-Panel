import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'
import { Sidebar } from './sidebar'

/**
 * Kerangka halaman panel.
 *
 * Tingginya dikunci ke layar; cuma bagian isinya yang di-scroll. Lihat
 * `styles.css` buat alasan lengkapnya (dulu `min-h-screen` dobel bikin
 * scrollbar hantu).
 *
 * Di HP, navigasinya jadi drawer: sidebar disembunyiin dan dibuka lewat
 * tombol di header. Sidebar yang mengecil jadi ikon nggak dipakai karena
 * proyek ini nggak punya ikon — label teksnya bakal ilang.
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
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  // Tutup drawer tiap pindah halaman — kalau nggak, di HP drawer-nya
  // nyangkut kebuka di atas halaman baru.
  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  // Kunci scroll latar selama drawer kebuka, biar nggak ikut kegeser.
  useEffect(() => {
    if (!navOpen) return
    const sebelumnya = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = sebelumnya
    }
  }, [navOpen])

  // Tutup pakai Escape — kebiasaan keyboard yang wajar.
  useEffect(() => {
    if (!navOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  return (
    <div className="flex h-full">
      {/* Sidebar tetap: cuma muncul di md ke atas */}
      <div className="hidden md:flex">
        <Sidebar username={username} />
      </div>

      {/* Drawer di HP */}
      {navOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Tutup navigasi"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-y-0 left-0 flex max-w-[80%] shadow-xl">
            <Sidebar username={username} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3 md:px-6 md:py-4">
          <button
            type="button"
            aria-label="Buka navigasi"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-card border border-line text-ink-muted transition-hikari hover:bg-muted hover:text-ink md:hidden"
          >
            {/* Tiga garis dibuat pakai CSS, bukan ikon — proyek ini nggak
                pakai library ikon. */}
            <span className="flex flex-col gap-[3px]">
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold md:text-lg">{title}</h1>
            {subtitle && (
              <div className="mt-0.5 truncate text-xs text-ink-subtle">{subtitle}</div>
            )}
          </div>

          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
