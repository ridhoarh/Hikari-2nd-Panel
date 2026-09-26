/**
 * Penanda environment.
 *
 * Panel ini nggak punya mode dev/prod yang beda perilakunya — cuma ada satu
 * cara jalan. Yang dibutuhin bukan itu, tapi **kejelasan**: waktu lagi ngoprek
 * di VPS, gampang banget lupa kalau yang lagi dibuka itu instance yang dipakai
 * beneran atau instance uji.
 *
 * Kejadian nyata: berkali-kali data di satu-satunya VPS kehapus gara-gara
 * "cuma mau nguji dari kondisi bersih", padahal di situ ada akun dan project
 * yang lagi dipakai.
 *
 * Jadi ini murni penanda buat manusia:
 *
 * - Muncul di log pas nyala
 * - Muncul di `/api/health` dan sidebar
 * - Muncul di pesan penutup `install.sh`
 *
 * Nilainya dibaca dari `HIKARI_ENV`. Yang dikenali cuma `development` dan
 * `production`; nilai lain (atau kosong) dianggap development — supaya
 * default-nya aman. Anggapannya: kalau nggak ada yang bilang ini produksi,
 * lebih baik diperlakukan sebagai tempat uji.
 */
export type AppEnv = 'development' | 'production'

const NILAI_SAH: AppEnv[] = ['development', 'production']

export const HIKARI_ENV: AppEnv = (() => {
  const raw = (process.env.HIKARI_ENV ?? '').trim().toLowerCase()
  const ketemu = NILAI_SAH.find((v) => v === raw)
  return ketemu ?? 'development'
})()

export function isProduction(): boolean {
  return HIKARI_ENV === 'production'
}

/**
 * Label buat ditampilin. Sengaja dibedain dari nilai mentahnya biar
 * konsisten di UI, log, dan dokumen.
 */
export function envLabel(): string {
  return HIKARI_ENV === 'production' ? 'Production' : 'Development'
}

/**
 * Peringatan buat log pas nyala.
 *
 * Cuma nyala di development. Tujuannya biar nggak ada lagi kejadian "mau
 * nguji di VPS, nggak sadar datanya data beneran".
 */
export function peringatanEnv(): string | null {
  if (isProduction()) return null
  return 'Jalan di mode DEVELOPMENT — data di sini boleh hilang. Jangan dipakai buat hal yang penting.'
}
