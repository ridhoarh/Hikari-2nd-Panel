/** Batas atas ukuran terminal. Nggak ada batas = server bisa kehabisan memori. */
export const MAX_COLS = 500
export const MAX_ROWS = 300

export function validResize(
  cols: number,
  rows: number
): { ok: boolean; reason?: string } {
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
    return { ok: false, reason: 'Ukuran harus angka' }
  }
  if (cols <= 0 || rows <= 0) {
    return { ok: false, reason: 'Ukuran harus lebih dari nol' }
  }
  if (cols > MAX_COLS || rows > MAX_ROWS) {
    return { ok: false, reason: 'Ukuran kegedean' }
  }
  return { ok: true }
}

/**
 * Pesan kontrol dikirim sebagai JSON. Ketikan biasa dikirim apa adanya —
 * itu yang bikin terminal-nya responsif tanpa perlu bikin protokol sendiri.
 */
export function isKontrolPesan(text: string): boolean {
  return text.length > 0 && text.startsWith('{')
}
