import type { ContainerStats } from '../../lib/types'
import { Card, CardBody } from '../ui/card'

export function AppStats({
  stats,
  dockerAvailable,
  running,
}: {
  stats: ContainerStats | null
  dockerAvailable: boolean
  running: boolean
}) {
  if (!dockerAvailable) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger">
            Nggak bisa nyambung ke Docker. Cek apakah Docker jalan:
            <code className="ml-1 font-mono">systemctl status docker</code>
          </p>
        </CardBody>
      </Card>
    )
  }

  if (!running || !stats) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">Container lagi nggak jalan.</p>
        </CardBody>
      </Card>
    )
  }

  const rows = [
    { label: 'CPU', value: `${stats.cpuPercent}%` },
    { label: 'RAM', value: `${stats.memoryUsedMb} / ${stats.memoryLimitMb} MB` },
    { label: 'Pemakaian', value: `${stats.memoryPercent}%` },
  ]

  return (
    <Card>
      <CardBody>
        {/* Satu kolom di HP — "2048 / 2048 MB" nggak muat di sepertiga layar
            sempit, dan angkanya jadi kepotong. */}
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 sm:block">
              <dt className="text-xs text-ink-subtle">{row.label}</dt>
              <dd className="tabular font-mono text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-subtle">
          Angka ini diambil saat halaman dibuka. Nggak ada riwayat.
        </p>
      </CardBody>
    </Card>
  )
}
