import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button } from '../ui/button'

type Schedule = {
  intervalHours: number
  lastRunAt: string | null
  aktif: boolean
}

const PILIHAN = [
  { jam: 0, label: 'Mati' },
  { jam: 24, label: 'Tiap hari' },
  { jam: 72, label: 'Tiap 3 hari' },
  { jam: 168, label: 'Tiap minggu' },
]

function waktuRelatif(iso: string | null): string {
  if (!iso) return 'belum pernah'
  const selisih = Date.now() - Date.parse(iso)
  if (Number.isNaN(selisih)) return iso
  const jam = Math.floor(selisih / 3_600_000)
  if (jam < 1) return 'barusan'
  if (jam < 24) return `${jam} jam lalu`
  return `${Math.floor(jam / 24)} hari lalu`
}

export function BackupSchedulePanel() {
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<Schedule>('/backup-schedule')
    if (res.ok) setSchedule(res.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function ubah(jam: number) {
    setBusy('ubah')
    setPesan(null)
    const res = await api.post<Schedule>('/backup-schedule', { intervalHours: jam })
    setBusy(null)
    if (res.ok) {
      setPesan('Jadwalnya disimpen.')
      await load()
    }
  }

  async function jalaninSekarang() {
    setBusy('run')
    setPesan(null)
    const res = await api.post<{ berhasil: number; gagal: unknown[] }>(
      '/backup-schedule/run'
    )
    setBusy(null)

    if (!res.ok) {
      setPesan(res.error)
      return
    }
    const g = res.data?.gagal.length ?? 0
    setPesan(
      `Backup jalan: ${res.data?.berhasil} berhasil${g > 0 ? `, ${g} gagal` : ''}.`
    )
    await load()
  }

  if (!schedule) return <p className="text-sm text-ink-muted">Memuat...</p>

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {PILIHAN.map((p) => (
          <label key={p.jam} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="backup-interval"
              checked={schedule.intervalHours === p.jam}
              onChange={() => ubah(p.jam)}
              disabled={busy !== null}
            />
            {p.label}
          </label>
        ))}
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Backup terakhir</dt>
          <dd className="font-mono text-xs">{waktuRelatif(schedule.lastRunAt)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={jalaninSekarang} disabled={busy !== null}>
          {busy === 'run' ? 'Nge-dump...' : 'Jalanin sekarang'}
        </Button>
      </div>

      {pesan && <p className="text-xs text-ink-muted">{pesan}</p>}

      <p className="text-xs text-ink-subtle">
        Backup nggak jalan pakai timer. Jadwalnya dicek tiap abis deploy sukses —
        jadi kalau nggak ada aktivitas, nggak ada backup. Ini sesuai prinsip
        &quot;nggak ada proses yang nyala terus&quot;.
      </p>
    </div>
  )
}
