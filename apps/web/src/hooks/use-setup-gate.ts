import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { api } from '../lib/api'

/**
 * Kemana halaman auth harus nglempar, berdasarkan status setup.
 *
 * Dipisah dari hook-nya biar bisa dites tanpa DOM — bug aslinya (halaman
 * `/login` nampil form padahal belum ada user) cuma kelihatan di browser,
 * jadi keputusannya dijadikan fungsi murni supaya bisa dikunci pakai tes.
 *
 * `needsSetup` null artinya statusnya nggak kebaca; di situ kita diam aja,
 * lebih baik nampilin halamannya daripada ngunci user di layer "Memuat...".
 */
export function resolveAuthRedirect(
  expected: 'setup' | 'login',
  needsSetup: boolean | null
): '/setup' | '/login' | null {
  if (needsSetup === true && expected !== 'setup') return '/setup'
  if (needsSetup === false && expected === 'setup') return '/login'
  return null
}

/**
 * Penjaga buat halaman `/login` dan `/setup`.
 *
 * Tanpa ini, halaman `/login` nampilin form kosong walau akunnya belum ada —
 * login-nya nggak bakal pernah berhasil, dan user nggak dikasih tau kenapa.
 * Sebaliknya, `/setup` masih bisa dibuka (dan diisi) walau setup-nya udah
 * selesai; servernya nolak dengan 409, tapi mestinya user nggak sampai ke situ.
 *
 * Logika redirect yang sama sebenernya ada di `_panel`, tapi itu cuma jalan
 * buat halaman berproteksi — halaman auth-nya nggak pernah dicek.
 */
export function useSetupGate(expected: 'setup' | 'login'): boolean {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const status = await api.get<{ needsSetup: boolean }>('/setup/status')
      if (cancelled) return

      const needsSetup = status.ok ? (status.data?.needsSetup ?? false) : null
      const tujuan = resolveAuthRedirect(expected, needsSetup)

      if (tujuan) {
        void navigate({ to: tujuan })
        return
      }

      setChecking(false)
    })()

    return () => {
      cancelled = true
    }
  }, [expected, navigate])

  return checking
}
