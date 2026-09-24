import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useAuth() {
  const [username, setUsername] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)

    const status = await api.get<{ needsSetup: boolean }>('/setup/status')
    if (status.ok) {
      setNeedsSetup(status.data?.needsSetup ?? false)
      if (status.data?.needsSetup) {
        setUsername(null)
        setLoading(false)
        return
      }
    }

    const me = await api.get<{ username: string }>('/auth/me')
    setUsername(me.ok ? (me.data?.username ?? null) : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { username, needsSetup, loading, refetch }
}
