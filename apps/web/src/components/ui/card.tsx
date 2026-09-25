import type { ReactNode } from 'react'

/**
 * Wadah standar.
 *
 * Datar, bukan bertumpuk: pemisah antar kartu pakai garis 1px, bukan shadow.
 * Di tema gelap, shadow tebal malah bikin kelihatan kotor.
 */
export function Card({
  children,
  className = '',
  interactive = false,
}: {
  children: ReactNode
  className?: string
  /** Kasih efek hover buat kartu yang seluruhnya bisa diklik. */
  interactive?: boolean
}) {
  return (
    <div
      className={`rounded-card border border-line bg-surface ${
        interactive ? 'transition-hikari hover:border-brand' : ''
      } ${className}`}
    >
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

/**
 * Blok teks monospace yang bisa digeser horizontal — buat connection string,
 * connection command, dan isi file.
 *
 * Dulu tiap tempat nulis sendiri `bg-neutral-950 text-neutral-200`, campur
 * sama warna Tailwind bawaan yang nggak ikut tema. Karena isinya seragam,
 * satu komponen lebih gampang dirawat.
 *
 * `break-all` di HP penting: connection string panjang nggak ada spasi, jadi
 * tanpa itu dia ngedorong lebar halaman.
 */
export function CodeBlock({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <pre
      className={`overflow-x-auto rounded-card border border-line bg-bg px-3 py-2 font-mono text-xs text-ink-muted ${className}`}
    >
      {children}
    </pre>
  )
}
