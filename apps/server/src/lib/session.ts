import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'hikari_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export function generateSessionKey(): Buffer {
  return randomBytes(32)
}

type Payload = { userId: string; exp: number }

function sign(data: string, key: Buffer): string {
  return createHmac('sha256', key).update(data).digest('base64url')
}

export function createSession(userId: string, key: Buffer): string {
  const payload: Payload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, key)}`
}

export function verifySession(token: string, key: Buffer): { userId: string } | null {
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [body, signature] = parts
  const expected = sign(body, key)

  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload
    if (!payload.userId || typeof payload.exp !== 'number') return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return { userId: payload.userId }
  } catch {
    return null
  }
}

export function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  }
}
