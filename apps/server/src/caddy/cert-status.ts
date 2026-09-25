import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { TlsStatus } from '../repositories/domains'

/**
 * Caddy nggak punya endpoint "daftar sertifikat" di admin API-nya. Yang bisa
 * dibaca cuma file-nya di disk, dan itu justru sumber kebenaran yang lebih
 * bagus: kalau file-nya ada dan belum kedaluwarsa, sertifikatnya emang aktif.
 *
 * Struktur di disk:
 *   <caddyData>/certificates/<ca-id>/<hostname>/<hostname>.crt
 *   <caddyData>/certificates/<ca-id>/<hostname>/<hostname>.key
 *
 * `<ca-id>` biasanya `local` buat ACME lokal, tapi bisa beda (`acme-v02...`),
 * jadi kita cari di semua subfolder.
 */
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

export function certDirForHostname(
  caddyDataDir: string,
  hostname: string
): string | null {
  const host = hostname.toLowerCase()
  // Hostname dipakai buat nama folder, jadi harus dipastikan nggak ada
  // `..` atau `/` yang bisa keluar dari folder sertifikat.
  if (!host || !HOSTNAME_RE.test(host) || host.includes('..')) return null
  return join(caddyDataDir, 'certificates', 'local', host)
}

export function parseCertExpiry(opensslOutput: string): number | null {
  const m = /^notAfter=(.+)$/m.exec(opensslOutput)
  if (!m) return null
  const t = Date.parse(m[1].trim())
  return Number.isNaN(t) ? null : t
}

/**
 * Sertifikat yang tinggal < 24 jam dianggap belum valid. Sertifikat yang
 * hampir habis itu tanda ada masalah renewal, dan melaporinnya "aktif"
 * bikin user nggak sadar sampai situsnya error.
 */
export function isCertValid(opts: { expiry: string | number; now: Date }): boolean {
  const t =
    typeof opts.expiry === 'number' ? opts.expiry : Date.parse(opts.expiry)
  if (Number.isNaN(t)) return false
  const sisa = t - opts.now.getTime()
  return sisa > 24 * 60 * 60 * 1000
}

export function readCertStatus(opts: {
  certExists: boolean
  keyExists: boolean
  expiryOutput: string
  now: Date
}): TlsStatus {
  if (!opts.certExists || !opts.keyExists) return 'pending'

  const expiry = parseCertExpiry(opts.expiryOutput)
  if (expiry === null) return 'failed'

  return isCertValid({ expiry, now: opts.now }) ? 'active' : 'failed'
}

/** Cari folder sertifikat buat hostname, di semua CA yang ada. */
export function findCertDir(
  caddyDataDir: string,
  hostname: string
): string | null {
  const certsRoot = join(caddyDataDir, 'certificates')
  if (!existsSync(certsRoot)) return null

  const host = hostname.toLowerCase()
  if (!HOSTNAME_RE.test(host) || host.includes('..')) return null

  try {
    for (const ca of readdirSync(certsRoot)) {
      const kandidat = join(certsRoot, ca, host)
      if (existsSync(kandidat)) return kandidat
    }
  } catch {
    return null
  }

  return null
}

export type CertProbeDeps = {
  caddyDataDir: string
  /** Dipanggil buat baca tanggal kedaluwarsa dari file cert. */
  readExpiry: (certPath: string) => Promise<string>
  now?: Date
}

/**
 * Baca status TLS beneran buat satu hostname. Kalau folder sertifikatnya
 * nggak ketemu, hasilnya `pending` — artinya Caddy belum sempet nerbitin.
 */
export async function probeCertStatus(
  deps: CertProbeDeps,
  hostname: string
): Promise<TlsStatus> {
  const now = deps.now ?? new Date()
  const dir = findCertDir(deps.caddyDataDir, hostname)

  if (!dir) {
    return readCertStatus({
      certExists: false,
      keyExists: false,
      expiryOutput: '',
      now,
    })
  }

  const certPath = join(dir, `${hostname.toLowerCase()}.crt`)
  const keyPath = join(dir, `${hostname.toLowerCase()}.key`)

  const certExists = existsSync(certPath)
  const keyExists = existsSync(keyPath)
  const expiryOutput = certExists ? await deps.readExpiry(certPath).catch(() => '') : ''

  return readCertStatus({ certExists, keyExists, expiryOutput, now })
}
