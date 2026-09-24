import type { Database } from '../db/client'
import { decrypt, encrypt } from '../lib/crypto'
import { newId } from '../lib/id'

export type EnvVar = {
  id: string
  app_id: string
  key: string
  value: string
  is_secret: number
}

export function listEnvVars(db: Database, appId: string): EnvVar[] {
  return db
    .query('SELECT * FROM env_vars WHERE app_id = ? ORDER BY key')
    .all(appId) as EnvVar[]
}

export function setEnvVar(
  db: Database,
  appId: string,
  key: string,
  value: string,
  isSecret: boolean,
  keyBuf: Buffer
): void {
  const encrypted = encrypt(value, keyBuf)
  db.query(
    `INSERT INTO env_vars (id, app_id, key, value, is_secret)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(app_id, key) DO UPDATE SET value = excluded.value, is_secret = excluded.is_secret`
  ).run(newId(), appId, key, encrypted, isSecret ? 1 : 0)
}

export function deleteEnvVar(db: Database, appId: string, key: string): boolean {
  const result = db
    .query('DELETE FROM env_vars WHERE app_id = ? AND key = ?')
    .run(appId, key)
  return result.changes > 0
}

export function resolveEnvVars(
  db: Database,
  appId: string,
  keyBuf: Buffer
): Record<string, string> {
  const rows = listEnvVars(db, appId)
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = decrypt(row.value, keyBuf)
  }
  return result
}
