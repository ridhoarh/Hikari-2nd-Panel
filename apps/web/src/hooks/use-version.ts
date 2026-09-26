import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

/**
 * Versi server yang lagi jalan, plus deteksi kalau panelnya baru di-update.
 *
 * Dua masalah nyata yang diselesain ini:
 *
 * 1. **Nggak kelihatan versi mana yang lagi dipakai.** Waktu ada bug, hal
 *    pertama yang perlu dipastiin: yang kebuka ini kode versi berapa? Dulu
 *    cuma ada di halaman Settings → Panel, jadi harus diklik dulu.
 *
 * 2. **Asset di-cache setahun** (`max-age=31536000, immutable`), jadi browser
 *    bisa terus pakai bundle lama walau servernya udah versi baru. Gejalanya
 *    aneh: URL berubah tapi halamannya nggak kebuka — router versi lama nggak
 *    kenal route yang baru. Sekarang versinya dicek berkala; kalau beda sama
 *    yang dilaporin server, halaman dimuat ulang sendiri.
 *
 * Pemeriksaannya cuma pas tab-nya kelihatan, dan tiap beberapa menit — sama
 * kayak polling lain di panel ini.
 */
const JEDA_CEK_MS = 5 * 60 * 1000

export function useVersion(): {
  version: string | null
  env: string | null
  adaVersiBaru: boolean
  muatUlang: () => void
} {
  const [version, setVersion] = useState<string | null>(null)
  const [env, setEnv] = useState<string | null>(null)
  const [adaVersiBaru, setAdaVersiBaru] = useState(false)
  // Versi yang sudah kelihatan di layar. Dipakai buat ngebandingin; disimpen
  // di ref biar efeknya nggak perlu dipasang ulang tiap versinya ganti.
  const versiAwal = useRef<string | null>(null)

  useEffect(() => {
    let dibatalkan = false

    async function cek() {
      // Cuma cek kalau tab-nya lagi kelihatan — nggak ada gunanya nembak API
      // buat halaman yang nggak dilihat.
      if (document.visibilityState !== 'visible') return

      const res = await api.get<{ version: string; env: string }>('/settings')
      if (dibatalkan || !res.ok) return

      const baru = res.data?.version ?? null
      if (!baru) return

      setEnv(res.data?.env ?? null)

      if (versiAwal.current === null) {
        // Pertama kali: ini versi yang lagi dipakai.
        versiAwal.current = baru
        setVersion(baru)
        return
      }

      if (baru !== versiAwal.current) {
        setAdaVersiBaru(true)
        setVersion(baru)
      }
    }

    void cek()

    const interval = window.setInterval(() => void cek(), JEDA_CEK_MS)
    // Sekalian cek pas tab-nya balik dilihat — itu saat paling mungkin
    // user-nya baru balik dan ketemu halamannya udah usang.
    const saatKelihatan = () => {
      if (document.visibilityState === 'visible') void cek()
    }
    document.addEventListener('visibilitychange', saatKelihatan)

    return () => {
      dibatalkan = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', saatKelihatan)
    }
  }, [])

  return {
    version,
    env,
    adaVersiBaru,
    // `location.reload()` biasa bakal pakai cache lagi. `true` bikin browser
    // ngecek ulang ke server, jadi bundle barunya beneran keambil.
    muatUlang: () => window.location.reload(),
  }
}
