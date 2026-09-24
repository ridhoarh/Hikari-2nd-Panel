import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '../hooks/use-auth'

export const Route = createFileRoute('/_panel')({ component: PanelLayout })

function PanelLayout() {
  const navigate = useNavigate()
  const { username, needsSetup, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (needsSetup) {
      void navigate({ to: '/setup' })
      return
    }
    if (!username) {
      void navigate({ to: '/login' })
    }
  }, [loading, needsSetup, username, navigate])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">
        Memuat...
      </div>
    )
  }

  if (!username) return null

  return <Outlet />
}
