import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '../hooks/use-auth'

export const Route = createFileRoute('/_panel')({ component: PanelLayout })

/**
 * Kerangka halaman berproteksi.
 *
 * Bagian yang paling penting di sini: apa yang kelihatan waktu sesinya
 * bermasalah.
 *
 * Dulu, kalau `username` kosong, komponennya balikin `null` — layar jadi
 * KOSONG TOTAL tanpa penjelasan apa pun. Gejalanya bikin bingung: URL-nya
 * udah berubah (misal abis klik project), tapi halamannya nggak muncul, dan
 * nggak ada pesan error sama sekali. Kelihatannya kayak "klik nggak ngaruh",
 * padahal sebenernya sesinya nggak kebaca.
 *
 * Sekarang: kalau sesinya nggak ada, user dikasih tau terus dikasih tombol
 * buat masuk lagi. Redirect otomatis tetap jalan, tapi bukan satu-satunya
 * jalan keluar.
 */
function PanelLayout() {
  const navigate = useNavigate()
  const { username, needsSetup, loading, adaSesi, refetch } = useAuth()

  useEffect(() => {
    if (loading) return
    if (needsSetup) {
      void navigate({ to: '/setup' })
      return
    }
  }, [loading, needsSetup, navigate])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        Memuat...
      </div>
    )
  }

  // Sesi bermasalah: kasih tau apa yang terjadi, jangan diamin.
  //
  // `adaSesi` dipisah dari `username` biar bisa bedain dua hal yang beda:
  // "belum login" (memang belum masuk) sama "sesi nggak kebaca" (harusnya
  // masih login, tapi servernya nolak). Yang kedua itu yang bikin bingung,
  // jadi pesannya juga harus beda.
  if (!username) {
    return (
      <main className="flex h-full items-center justify-center px-5">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-lg font-semibold">Sesi kamu udah nggak berlaku</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {adaSesi
              ? 'Cookie sesinya ada, tapi servernya nolak. Biasanya karena panelnya baru di-update.'
              : 'Kamu keluar atau sesinya keburu habis.'}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <Link
              to="/login"
              className="min-h-touch rounded-card bg-brand px-4 py-2.5 font-medium text-white transition-hikari hover:bg-brand-hover"
            >
              Masuk lagi
            </Link>
            <button
              type="button"
              onClick={() => void refetch()}
              className="min-h-touch rounded-card border border-line px-4 py-2.5 text-sm text-ink-muted transition-hikari hover:bg-muted"
            >
              Coba lagi
            </button>
          </div>

          <p className="mt-6 text-xs text-ink-subtle">
            Kalau tombol &ldquo;Coba lagi&rdquo; nggak ngefek, buka{' '}
            <span className="font-mono">/diagnostik.html</span> buat cek
            detailnya.
          </p>
        </div>
      </main>
    )
  }

  return <Outlet />
}
