const SATUAN = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes === 0) return '0 B'

  let nilai = bytes
  let i = 0
  while (nilai >= 1024 && i < SATUAN.length - 1) {
    nilai /= 1024
    i += 1
  }

  // Desimal cuma kalau perlu: "1 GB" lebih enak dibaca daripada "1.0 GB".
  const bulat = Math.round(nilai * 10) / 10
  const tampil = Number.isInteger(bulat) ? String(bulat) : bulat.toFixed(1)
  return `${tampil} ${SATUAN[i]}`
}

export function diskPercent(opts: { total: number; free: number }): number {
  if (!opts.total || opts.total <= 0) return 0
  const terpakai = opts.total - opts.free
  return Math.round((terpakai / opts.total) * 1000) / 10
}

/**
 * Disk penuh itu penyebab VPS mati yang paling sering dan paling susah
 * ketahuan. 80% dipilih biar masih ada waktu buat bersihin sebelum beneran
 * bermasalah. 90% udah kelamaan.
 */
export function isDiskWarning(percent: number): boolean {
  return percent >= 80
}
