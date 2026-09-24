import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-bg text-ink">
      <Outlet />
    </div>
  ),
})
