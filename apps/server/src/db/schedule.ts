/**
 * Backup terjadwal TANPA cron.
 *
 * Sesuai prinsip proyek ini: nggak ada proses yang nyala terus. Jadwalnya
 * dicek di jalur yang emang udah jalan — pas deploy sukses dan pas panel
 * dibuka. Jadi kalau Hikari-nya nganggur, nggak ada backup jalan, dan itu
 * memang yang diinginkan.
 */

export type ScheduleInput = {
  lastRunAt: string | null
  intervalHours: number
  now: Date
}

/**
 * Interval 0 atau negatif artinya fitur-nya dimatiin.
 *
 * Timestamp yang rusak sengaja dianggap "due" — lebih baik backup sekali
 * kelebihan daripada nggak pernah backup sama sekali.
 */
export function isDue(input: ScheduleInput): boolean {
  if (input.intervalHours <= 0) return false
  if (!input.lastRunAt) return true

  const terakhir = Date.parse(input.lastRunAt)
  if (Number.isNaN(terakhir)) return true

  const batas = terakhir + input.intervalHours * 60 * 60 * 1000
  return input.now.getTime() >= batas
}

export function msUntilDue(input: ScheduleInput): number {
  if (!isDue(input)) {
    const terakhir = Date.parse(input.lastRunAt as string)
    const batas = terakhir + input.intervalHours * 60 * 60 * 1000
    return batas - input.now.getTime()
  }
  return 0
}

/** Buat nampilin di panel: "udah backup hari ini belum?". */
export function alreadyRanToday(opts: {
  lastRunAt: string | null
  now: Date
}): boolean {
  if (!opts.lastRunAt) return false
  const terakhir = Date.parse(opts.lastRunAt)
  if (Number.isNaN(terakhir)) return false

  const a = new Date(terakhir).toISOString().slice(0, 10)
  const b = opts.now.toISOString().slice(0, 10)
  return a === b
}
