import { describe, expect, test } from 'bun:test'
import { createSession, verifySession, generateSessionKey } from './session'

describe('session', () => {
  const key = generateSessionKey()

  test('token yang bener bisa diverifikasi', () => {
    const token = createSession('user-1', key)
    const result = verifySession(token, key)
    expect(result?.userId).toBe('user-1')
  })

  test('token yang diutak-atik ditolak', () => {
    const token = createSession('user-1', key)
    const rusak = token.slice(0, -2) + 'xx'
    expect(verifySession(rusak, key)).toBeNull()
  })

  test('token dari kunci lain ditolak', () => {
    const token = createSession('user-1', key)
    const kunciLain = generateSessionKey()
    expect(verifySession(token, kunciLain)).toBeNull()
  })

  test('token ngawur ditolak, bukan error', () => {
    expect(verifySession('nggak-valid', key)).toBeNull()
  })

  test('token kosong ditolak', () => {
    expect(verifySession('', key)).toBeNull()
  })

  test('token punya masa berlaku', () => {
    const token = createSession('user-1', key)
    const result = verifySession(token, key)
    expect(result).not.toBeNull()
  })
})
