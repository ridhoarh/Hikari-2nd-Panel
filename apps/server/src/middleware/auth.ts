import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { Database } from '../db/client'
import { SESSION_COOKIE, verifySession } from '../lib/session'
import { findUserById } from '../repositories/users'

export type AuthVariables = { username: string; userId: string }

export function requireAuth(db: Database, cryptoKey: Buffer) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (!token) return c.json({ error: 'Belum login' }, 401)

    const session = verifySession(token, cryptoKey)
    if (!session) return c.json({ error: 'Session nggak valid' }, 401)

    const user = findUserById(db, session.userId)
    if (!user) return c.json({ error: 'Belum login' }, 401)

    c.set('userId', user.id)
    c.set('username', user.username)
    await next()
  })
}
