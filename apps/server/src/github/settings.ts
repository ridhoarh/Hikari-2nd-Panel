import type { Database } from '../db/client'
import { decrypt, encrypt } from '../lib/crypto'

const APP_ID_KEY = 'github_app_id'
const APP_KEY_KEY = 'github_app_private_key'

export function getGithubAppId(db: Database): string | null {
  const row = db.query('SELECT value FROM settings WHERE key = ?').get(APP_ID_KEY) as
    | { value: string }
    | null
  return row?.value ?? null
}

export function getGithubAppKey(db: Database, cryptoKey: Buffer): string | null {
  const row = db.query('SELECT value FROM settings WHERE key = ?').get(APP_KEY_KEY) as
    | { value: string }
    | null
  if (!row) return null
  return decrypt(row.value, cryptoKey)
}

/** Private key disimpen terenkripsi — dia bisa dipakai buat apa aja sebagai App. */
export function setGithubApp(
  db: Database,
  cryptoKey: Buffer,
  appId: string,
  privateKey: string
): void {
  const set = (key: string, value: string) =>
    db
      .query(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value)

  set(APP_ID_KEY, appId)
  set(APP_KEY_KEY, encrypt(privateKey, cryptoKey))
}

export function deleteGithubApp(db: Database): void {
  db.query('DELETE FROM settings WHERE key IN (?, ?)').run(APP_ID_KEY, APP_KEY_KEY)
}

/**
 * Cache token instalasi di memori. Token-nya berlaku 1 jam, jadi nggak
 * perlu minta baru tiap deploy.
 *
 * Sengaja TIDAK disimpen di database: kalau Hikari restart, token-nya
 * diambil lagi. Itu lebih baik daripada nyimpen token yang bisa kadaluarsa
 * diam-diam.
 */
const tokenCache = new Map<number, { token: string; expiresAt: number }>()

export function getCachedToken(installationId: number): string | null {
  const entry = tokenCache.get(installationId)
  if (!entry) return null
  // Kasih margin 5 menit biar nggak kepake pas mepet kadaluarsa.
  if (Date.now() > entry.expiresAt - 5 * 60 * 1000) {
    tokenCache.delete(installationId)
    return null
  }
  return entry.token
}

export function setCachedToken(
  installationId: number,
  token: string,
  ttlMs = 60 * 60 * 1000
): void {
  tokenCache.set(installationId, { token, expiresAt: Date.now() + ttlMs })
}

export function clearTokenCache(): void {
  tokenCache.clear()
}
