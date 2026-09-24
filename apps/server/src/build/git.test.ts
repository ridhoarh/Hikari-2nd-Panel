import { describe, expect, test } from 'bun:test'
import { gitEnv, repoDirName } from './git'

describe('gitEnv', () => {
  test('set GIT_SSH_COMMAND ke kunci yang dikasih', () => {
    const env = gitEnv('/tmp/key', '/tmp/known_hosts')
    expect(env.GIT_SSH_COMMAND).toContain('/tmp/key')
  })

  test('pakai file known_hosts, bukan /dev/null', () => {
    const cmd = gitEnv('/tmp/key', '/tmp/known_hosts').GIT_SSH_COMMAND
    expect(cmd).toContain('UserKnownHostsFile=/tmp/known_hosts')
    expect(cmd).not.toContain('/dev/null')
  })

  test('host key diverifikasi, bukan dimatiin', () => {
    const cmd = gitEnv('/tmp/key', '/tmp/known_hosts').GIT_SSH_COMMAND
    expect(cmd).toContain('StrictHostKeyChecking=yes')
  })

  test('matiin prompt password', () => {
    expect(gitEnv('/tmp/key', '/tmp/kh').GIT_SSH_COMMAND).toContain('BatchMode=yes')
  })
})

describe('repoDirName', () => {
  test('gabungin slug dan deployment id', () => {
    expect(repoDirName('blog', '01HXYZ')).toBe('blog-01HXYZ')
  })

  test('aman buat nama folder', () => {
    expect(repoDirName('blog', '01HXYZ')).not.toContain('/')
  })
})
