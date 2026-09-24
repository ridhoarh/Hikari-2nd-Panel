/**
 * Hikari nggak jalanin sshd sendiri. Alasannya: nulis SSH server dari nol
 * itu rawan, dan ngejalanin sshd di dalam proses Hono bikin dua sumber
 * kebenaran soal autentikasi.
 *
 * Yang dipakai: sshd yang emang udah ada di VPS (bawaan Ubuntu), dengan satu
 * user khusus `git` yang `authorized_keys`-nya cuma boleh jalanin
 * `git-shell`. `git-shell` cuma bisa ngelayanin git-receive-pack /
 * git-upload-pack — nggak bisa shell interaktif.
 *
 * File ini yang nyiapin semuanya.
 */
export const GIT_SERVICE_USER = 'git'

/** Isi file authorized_keys buat satu app. */
export function authorizedKeyLine(opts: {
  publicKey: string
  dataDir: string
}): string {
  // `command=` ngunci: SSH-nya cuma jalanin ini, apa pun yang diminta client.
  // Tanpa ini, deploy key bisa dipakai buat dapet shell.
  const perintah = `git-shell -c "$SSH_ORIGINAL_COMMAND"`
  return `command="${perintah}",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ${opts.publicKey}`
}

/**
 * Potong public key jadi satu baris. `authorized_keys` nolak baris yang
 * kepotong atau ada newline di tengah.
 */
export function normalizePublicKey(publicKey: string): string | null {
  const bagian = publicKey.trim().split(/\s+/)
  if (bagian.length < 2) return null
  const [algorithm, key] = bagian
  if (!algorithm.startsWith('ssh-') && !algorithm.startsWith('ecdsa-')) return null
  // Base64 yang bener: panjang kelipatan 4, cuma karakter base64, dan
  // padding '=' cuma boleh di akhir. Tanpa cek ini, "not base64!!" lolos
  // karena kekurangan bagian doang yang dicek.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(key)) return null
  if (key.length % 4 !== 0) return null
  return `${algorithm} ${key}`
}

/** Nama remote yang perlu ditambahin user. */
export function gitRemoteName(appSlug: string): string {
  return `hikari-${appSlug}`
}

/** Perintah `git remote add` + `git push` yang tinggal dicopy. */
export function gitPushInstructions(opts: {
  appSlug: string
  sshUrl: string
}): string[] {
  return [
    `git remote add hikari ${opts.sshUrl}`,
    `git push hikari main`,
  ]
}
