import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

/**
 * Sesi login yang lagi dipakai.
 *
 * `adaSesi` sengaja dipisah dari `username`. Dua-duanya kelihatan sama
 * (`username` kosong), tapi artinya beda dan penanganannya beda:
 *
 * - `adaSesi: false` → memang belum login. Redirect ke /login itu cukup.
 * - `adaSesi: true`  → cookie-nya ada, tapi /auth/me nolak. Ini yang bikin
 *   bingung; biasanya karena panelnya baru di-update sementara cookie lama
 *   masih nempel. User perlu dikasih tau, bukan dibiarkan nebak-nebak.
 *
 * Bedanya diambil dari status respons, bukan dari ada-nggaknya cookie —
 * cookie `HttpOnly`, jadi JavaScript memang nggak bisa liat isinya.
 */
export function useAuth() {
  const [username, setUsername] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [adaSesi, setAdaSesi] = useState(false)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)

    const status = await api.get<{ needsSetup: boolean }>('/setup/status')
    if (status.ok) {
      setNeedsSetup(status.data?.needsSetup ?? false)
      if (status.data?.needsSetup) {
        setUsername(null)
        setAdaSesi(false)
        setLoading(false)
        return
      }
    }

    const me = await api.get<{ username: string }>('/auth/me')
    if (me.ok) {
      setUsername(me.data?.username ?? null)
      setAdaSesi(false)
    } else {
      setUsername(null)
      // 401 artinya servernya nolak sesi. Cookie-nya mungkin masih ada di
      // browser, cuma nggak dianggap sah — itu kasus yang perlu dibedain.
      setAdaSesi(me.status === 401)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { username, needsSetup, adaSesi, loading, refetch }
}
