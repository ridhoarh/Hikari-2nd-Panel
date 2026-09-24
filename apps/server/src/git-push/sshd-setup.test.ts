import { describe, expect, test } from 'bun:test'
import {
  authorizedKeyLine,
  normalizePublicKey,
  gitPushInstructions,
} from './sshd-setup'

describe('authorizedKeyLine', () => {
  const line = authorizedKeyLine({
    publicKey: 'ssh-ed25519 AAAAC3Nz hikari-blog',
    dataDir: '/var/lib/hikari',
  })

  test('ngunci command-nya ke git-shell', () => {
    expect(line).toContain('command="git-shell')
  })

  test('matiin port forwarding & pty', () => {
    expect(line).toContain('no-port-forwarding')
    expect(line).toContain('no-pty')
    expect(line).toContain('no-agent-forwarding')
    expect(line).toContain('no-X11-forwarding')
  })

  test('public key-nya ikut', () => {
    expect(line).toContain('ssh-ed25519 AAAAC3Nz')
  })

  test('satu baris aja', () => {
    expect(line.split('\n')).toHaveLength(1)
  })
})

describe('normalizePublicKey', () => {
  test('buang komentar', () => {
    expect(normalizePublicKey('ssh-ed25519 AAAAC3Nz admin@host')).toBe(
      'ssh-ed25519 AAAAC3Nz'
    )
  })

  test('buang newline', () => {
    expect(normalizePublicKey('ssh-ed25519 AAAAC3Nz\n')).toBe('ssh-ed25519 AAAAC3Nz')
  })

  test('tolak yang bukan key', () => {
    expect(normalizePublicKey('halo dunia')).toBeNull()
  })

  test('tolak yang kekurangan bagian', () => {
    expect(normalizePublicKey('ssh-ed25519')).toBeNull()
  })

  test('tolak base64 yang aneh', () => {
    expect(normalizePublicKey('ssh-ed25519 not base64!!')).toBeNull()
  })

  test('terima ecdsa', () => {
    expect(normalizePublicKey('ecdsa-sha2-nistp256 AAAAC3Nz')).toBe(
      'ecdsa-sha2-nistp256 AAAAC3Nz'
    )
  })
})

describe('gitPushInstructions', () => {
  test('nampilin remote add dan push', () => {
    const cmd = gitPushInstructions({
      appSlug: 'blog',
      sshUrl: 'git@contoh.com:blog.git',
    })
    expect(cmd).toHaveLength(2)
    expect(cmd[0]).toContain('git remote add')
    expect(cmd[1]).toContain('git push')
  })
})
