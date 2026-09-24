import { describe, expect, test } from 'bun:test'
import { formatPublicKey } from './ssh-key'

describe('formatPublicKey', () => {
  test('tambahin komentar hikari', () => {
    const key = 'ssh-ed25519 AAAAC3Nz admin@host'
    expect(formatPublicKey(key, 'blog')).toContain('hikari-blog')
  })

  test('buang komentar bawaan', () => {
    const key = 'ssh-ed25519 AAAAC3Nz admin@laptop'
    expect(formatPublicKey(key, 'blog')).not.toContain('admin@laptop')
  })

  test('hasil akhir satu baris', () => {
    const key = 'ssh-ed25519 AAAAC3Nz admin@host\n'
    expect(formatPublicKey(key, 'blog').split('\n')).toHaveLength(1)
  })
})
