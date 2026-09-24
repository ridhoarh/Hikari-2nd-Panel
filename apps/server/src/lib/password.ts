const MIN_LENGTH = 12

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
