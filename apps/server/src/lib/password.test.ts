import { describe, expect, test } from 'bun:test'
import { checkPasswordStrength, hashPassword, verifyPassword } from './password'

describe('password', () => {
  test('hash beda dari teks aslinya', async () => {
    const hash = await hashPassword('rahasiaBgt123')
    expect(hash).not.toBe('rahasiaBgt123')
    expect(hash.length).toBeGreaterThan(20)
  })

  test('verify true buat password yang bener', async () => {
    const hash = await hashPassword('rahasiaBgt123')
    expect(await verifyPassword('rahasiaBgt123', hash)).toBe(true)
  })

  test('verify false buat password yang salah', async () => {
    const hash = await hashPassword('rahasiaBgt123')
    expect(await verifyPassword('salah', hash)).toBe(false)
  })

  test('hash sama password beda hasil (salt beda)', async () => {
    const a = await hashPassword('sama')
    const b = await hashPassword('sama')
    expect(a).not.toBe(b)
  })
})

describe('checkPasswordStrength', () => {
  test('nolak password di bawah 12 karakter', () => {
    const r = checkPasswordStrength('pendek')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('12')
  })

  test('terima password 12 karakter', () => {
    expect(checkPasswordStrength('duabelaschar').ok).toBe(true)
  })
})
