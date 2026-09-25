import { describe, expect, test } from 'bun:test'
import {
  generateKeyPairSync,
  createVerify,
} from 'node:crypto'
import {
  buildAppJwt,
  cloneUrlWithToken,
  parseRepoFullName,
  pickInstallation,
} from './github-app'

describe('parseRepoFullName', () => {
  test('baca format ssh', () => {
    expect(parseRepoFullName('git@github.com:user/repo.git')).toBe('user/repo')
  })

  test('baca format https', () => {
    expect(parseRepoFullName('https://github.com/user/repo.git')).toBe('user/repo')
  })

  test('baca https tanpa .git', () => {
    expect(parseRepoFullName('https://github.com/user/repo')).toBe('user/repo')
  })

  test('null kalau bukan repo github', () => {
    expect(parseRepoFullName('git@gitlab.com:user/repo.git')).toBeNull()
  })

  test('null kalau formatnya aneh', () => {
    expect(parseRepoFullName('bukan-url')).toBeNull()
  })
})

describe('buildAppJwt', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()

  test('bikin JWT tiga bagian', () => {
    const jwt = buildAppJwt({ appId: '12345', privateKey: pem })
    expect(jwt.split('.')).toHaveLength(3)
  })

  test('header-nya RS256', () => {
    const jwt = buildAppJwt({ appId: '12345', privateKey: pem })
    const header = JSON.parse(
      Buffer.from(jwt.split('.')[0], 'base64url').toString('utf8')
    )
    expect(header.alg).toBe('RS256')
    expect(header.typ).toBe('JWT')
  })

  test('iss-nya app id', () => {
    const jwt = buildAppJwt({ appId: '12345', privateKey: pem })
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')
    )
    expect(payload.iss).toBe('12345')
  })

  test('exp nggak lebih dari 10 menit (batas GitHub)', () => {
    const now = 1_700_000_000
    const jwt = buildAppJwt({ appId: '1', privateKey: pem, now })
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')
    )
    expect(payload.exp - now).toBeLessThanOrEqual(600)
    expect(payload.exp).toBeGreaterThan(now)
  })

  test('iat dimundurin biar nggak kena clock skew', () => {
    const now = 1_700_000_000
    const jwt = buildAppJwt({ appId: '1', privateKey: pem, now })
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')
    )
    expect(payload.iat).toBeLessThan(now)
  })

  test('signature-nya bisa diverifikasi pakai public key', () => {
    const jwt = buildAppJwt({ appId: '1', privateKey: pem })
    const [h, p, s] = jwt.split('.')

    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${h}.${p}`)
    const valid = verifier.verify(
      publicKey.export({ type: 'spki', format: 'pem' }),
      Buffer.from(s, 'base64url')
    )
    expect(valid).toBe(true)
  })

  test('kunci rusak dilempar, bukan diam-diam gagal', () => {
    expect(() => buildAppJwt({ appId: '1', privateKey: 'bukan-pem' })).toThrow()
  })
})

describe('cloneUrlWithToken', () => {
  test('nyisipin token ke URL https', () => {
    const url = cloneUrlWithToken('user/repo', 'ghs_abc123')
    expect(url).toBe('https://x-access-token:ghs_abc123@github.com/user/repo.git')
  })
})

describe('pickInstallation', () => {
  const installations = [
    { id: 1, account: { login: 'ridhoarh' } },
    { id: 2, account: { login: 'org-lain' } },
  ]

  test('pilih instalasi yang punya repo-nya', () => {
    expect(pickInstallation(installations, new Set([2]))?.id).toBe(2)
  })

  test('null kalau nggak ada yang cocok', () => {
    expect(pickInstallation(installations, new Set([99]))).toBeNull()
  })

  test('pilih yang pertama kalau cuma ada satu instalasi', () => {
    expect(pickInstallation([installations[0]], new Set<number>())?.id).toBe(1)
  })
})
