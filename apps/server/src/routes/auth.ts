import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import type { Database } from '../db/client'
import { checkPasswordStrength, hashPassword, verifyPassword } from '../lib/password'
import { cookieOptions, createSession, SESSION_COOKIE, verifySession } from '../lib/session'
import { createRateLimiter } from '../middleware/rate-limit'
import {
  countUsers,
  createUser,
  findUserById,
  findUserByUsername,
  setUserPassword,
} from '../repositories/users'

const setupSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1),
})

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

const gantiPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
})

export function createAuthRoutes(
  db: Database,
  cryptoKey: Buffer,
  loginLimiter = createRateLimiter({ max: 5, windowMs: 60_000 })
): Hono {
  const router = new Hono()

  router.get('/setup/status', (c) => {
    return c.json({ needsSetup: countUsers(db) === 0 })
  })

  router.post('/setup', async (c) => {
    if (countUsers(db) > 0) {
      return c.json({ error: 'Setup udah pernah dilakuin' }, 409)
    }

    const parsed = setupSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Username dan password wajib diisi' }, 400)
    }

    const strength = checkPasswordStrength(parsed.data.password)
    if (!strength.ok) {
      return c.json({ error: strength.reason }, 400)
    }

    const hash = await hashPassword(parsed.data.password)
    createUser(db, parsed.data.username, hash)
    return c.json({ ok: true }, 201)
  })

  router.post('/auth/login', async (c) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown'

    if (!loginLimiter(ip)) {
      return c.json({ error: 'Kebanyakan percobaan login. Coba lagi nanti.' }, 429)
    }

    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Username dan password wajib diisi' }, 400)
    }

    const user = findUserByUsername(db, parsed.data.username)
    if (!user) {
      return c.json({ error: 'Username atau password salah' }, 401)
    }

    const cocok = await verifyPassword(parsed.data.password, user.password_hash)
    if (!cocok) {
      return c.json({ error: 'Username atau password salah' }, 401)
    }

    const token = createSession(user.id, cryptoKey)
    setCookie(c, SESSION_COOKIE, token, cookieOptions(false))
    return c.json({ ok: true })
  })

  router.post('/auth/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  /**
   * Ganti password sendiri.
   *
   * Password lama WAJIB diketik ulang. Tanpa itu, sesi yang kecolongan
   * (misal cookie-nya ketinggalan di komputer warnet) bisa dipakai buat
   * ngunci pemilik aslinya keluar dari akunnya sendiri.
   */
  router.post('/auth/password', async (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (!token) return c.json({ error: 'Belum login' }, 401)

    const session = verifySession(token, cryptoKey)
    if (!session) return c.json({ error: 'Session nggak valid' }, 401)

    const user = findUserById(db, session.userId)
    if (!user) return c.json({ error: 'Belum login' }, 401)

    const parsed = gantiPasswordSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'Password lama dan baru wajib diisi' }, 400)
    }

    const cocok = await verifyPassword(parsed.data.currentPassword, user.password_hash)
    if (!cocok) {
      return c.json({ error: 'Password lama salah' }, 401)
    }

    const strength = checkPasswordStrength(parsed.data.newPassword)
    if (!strength.ok) {
      return c.json({ error: strength.reason }, 400)
    }

    setUserPassword(db, user.id, await hashPassword(parsed.data.newPassword))
    return c.json({ ok: true })
  })

  router.get('/auth/me', (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (!token) return c.json({ error: 'Belum login' }, 401)

    const session = verifySession(token, cryptoKey)
    if (!session) return c.json({ error: 'Session nggak valid' }, 401)

    const user = findUserById(db, session.userId)
    if (!user) return c.json({ error: 'Belum login' }, 401)

    return c.json({ username: user.username })
  })

  return router
}
