import type { ReactNode } from 'react'
import { Sidebar } from './sidebar'

export function AppShell({
  username,
  title,
  actions,
  children,
}: {
  username: string
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar username={username} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h1 className="text-lg font-semibold">{title}</h1>
          {actions}
        </header>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  )
}
