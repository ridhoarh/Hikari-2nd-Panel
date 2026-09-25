import { describe, expect, test } from 'bun:test'
import { resolveAuthRedirect } from './use-setup-gate'

describe('resolveAuthRedirect', () => {
  test('belum ada user: halaman login nglempar ke setup', () => {
    // Ini kasus yang ketemu di VPS: buka /login pas instalasi masih baru,
    // dapetnya form kosong padahal login-nya nggak bakal pernah berhasil.
    expect(resolveAuthRedirect('login', true)).toBe('/setup')
  })

  test('belum ada user: halaman setup dibiarin', () => {
    expect(resolveAuthRedirect('setup', true)).toBeNull()
  })

  test('udah ada user: halaman setup nglempar ke login', () => {
    expect(resolveAuthRedirect('setup', false)).toBe('/login')
  })

  test('udah ada user: halaman login dibiarin', () => {
    expect(resolveAuthRedirect('login', false)).toBeNull()
  })

  test('status nggak kebaca: dua-duanya dibiarin', () => {
    // Jaringan lagi bermasalah — jangan ngunci user di layer "Memuat...".
    expect(resolveAuthRedirect('login', null)).toBeNull()
    expect(resolveAuthRedirect('setup', null)).toBeNull()
  })
})
