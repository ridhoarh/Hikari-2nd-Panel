import type { ReactNode } from 'react'

/**
 * Grid kartu yang mengisi lebar layar.
 *
 * Halaman-halaman lama cuma pakai satu kolom sempit (`max-w-xl`), jadi di
 * monitor lebar separuh layarnya kosong dan scrollbar tetap muncul. Grid ini
 * ngatur sendiri jumlah kolomnya sesuai lebar yang ada.
 */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
  )
}

/** Pesan saat daftarnya kosong — selalu kasih tau langkah berikutnya. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
      {children}
    </div>
  )
}

/** Satu baris label–nilai, dipakai di banyak kartu. */
export function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className={`truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}

/** Label kecil buat nunjukin asal data (nama project). */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-ink-muted">
      {children}
    </span>
  )
}
