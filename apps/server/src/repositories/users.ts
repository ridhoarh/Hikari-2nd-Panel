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
