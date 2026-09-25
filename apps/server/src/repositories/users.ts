import type { Database } from '../db/client'
import { newId, nowIso } from '../lib/id'

export type User = {
  id: string
  username: string
  password_hash: string
  created_at: string
}

export function countUsers(db: Database): number {
  const row = db.query('SELECT COUNT(*) as n FROM users').get() as { n: number }
  return row.n
}

export function findUserByUsername(db: Database, username: string): User | null {
  return db.query('SELECT * FROM users WHERE username = ?').get(username) as User | null
}

export function findUserById(db: Database, id: string): User | null {
  return db.query('SELECT * FROM users WHERE id = ?').get(id) as User | null
}

export function createUser(db: Database, username: string, passwordHash: string): User {
  const user: User = {
    id: newId(),
    username,
    password_hash: passwordHash,
    created_at: nowIso(),
  }
  db.query(
    'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).run(user.id, user.username, user.password_hash, user.created_at)
  return user
}

/**
 * Ganti password user yang udah ada.
 *
 * Hash-nya dibikin di route (butuh async), jadi di sini cuma nyimpen — biar
 * repository ini tetap sinkron dan nggak perlu nunggu argon2.
 */
export function setUserPassword(db: Database, id: string, passwordHash: string): void {
  db.query('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id)
}
