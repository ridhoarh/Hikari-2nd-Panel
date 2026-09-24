export type StatusKind = 'running' | 'stopped' | 'building' | 'failed'

const WARNA: Record<StatusKind, string> = {
  running: 'bg-ok',
  stopped: 'bg-idle',
  building: 'bg-warn',
  failed: 'bg-danger',
}

const LABEL: Record<StatusKind, string> = {
  running: 'Jalan',
  stopped: 'Mati',
  building: 'Lagi build',
  failed: 'Gagal',
}

export function StatusDot({ status }: { status: StatusKind }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${WARNA[status]}`}
      />
      <span className="text-sm text-ink-muted">{LABEL[status]}</span>
    </span>
  )
}
