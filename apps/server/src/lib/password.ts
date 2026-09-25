// Panel ini dipakai buat diri sendiri, jadi batasnya sengaja rendah — cuma
// pagar biar password kayak "123" atau "admin" nggak kepake. Batas tinggi
// kaya 12 karakter malah bikin orang nulis password di catatan.
//
// Yang jaga akun ini dari brute-force bukan panjangnya, tapi rate limit login
// (5 percobaan per menit per IP) di routes/auth.ts.
const MIN_LENGTH = 6

export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 })
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(plain, hash)
  } catch {
    return false
  }
}

export function checkPasswordStrength(plain: string): { ok: boolean; reason?: string } {
  if (plain.length < MIN_LENGTH) {
    return { ok: false, reason: `Password minimal ${MIN_LENGTH} karakter` }
  }
  return { ok: true }
}
