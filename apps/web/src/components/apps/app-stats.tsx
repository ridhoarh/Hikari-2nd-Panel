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
    { label: 'Pemakaian RAM', value: `${stats.memoryPercent}%` },
  ]

  return (
    <Card>
      <CardBody>
        <dl className="grid grid-cols-3 gap-4">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs text-ink-subtle">{row.label}</dt>
              <dd className="mt-0.5 font-mono text-sm font-medium">{row.value}</dd>
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
