import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ children }: { children: ReactNode }) {
  return <div className="border-b border-line px-4 py-3">{children}</div>
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3">{children}</div>
}
