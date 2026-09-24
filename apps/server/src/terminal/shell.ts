/**
 * Shell yang dicoba buat terminal container, urut dari yang paling enak
 * dipakai. `sh` ditaruh terakhir karena semua image hampir pasti punya itu
 * (Alpine nggak punya bash).
 */
export function containerShellCandidates(): string[] {
  return ['/bin/bash', '/bin/ash', '/bin/sh', 'sh']
}

const DIIZINKAN = new Set([
  'bash',
  'sh',
  'ash',
  'zsh',
  '/bin/bash',
  '/bin/sh',
  '/bin/ash',
  '/bin/zsh',
])

/**
 * Cuma shell dari daftar putih yang diterima. Tanpa ini, nilai dari client
 * bisa jadi perintah apa pun yang jalan di dalem container.
 */
export function isValidShell(shell: string): boolean {
  if (!shell) return false
  if (/[\s;&|`$(){}<>]/.test(shell)) return false
  return DIIZINKAN.has(shell)
}
