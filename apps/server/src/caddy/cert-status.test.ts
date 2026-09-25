import { describe, expect, test } from 'bun:test'
import {
  certDirForHostname,
  isCertValid,
  parseCertExpiry,
  readCertStatus,
} from './cert-status'

describe('certDirForHostname', () => {
  test('bikin path folder sertifikat dari hostname', () => {
    // Caddy nyimpen per-hostname, di dalem folder per-CA.
    expect(certDirForHostname('/data/caddy', 'blog.contoh.com')).toBe(
      '/data/caddy/certificates/local/blog.contoh.com'
    )
  })

  test('hostname dibikin huruf kecil', () => {
    expect(certDirForHostname('/data/caddy', 'Blog.Contoh.COM')).toBe(
      '/data/caddy/certificates/local/blog.contoh.com'
    )
  })

  test('tolak hostname yang ada karakter aneh (path traversal)', () => {
    expect(certDirForHostname('/data/caddy', '../etc/passwd')).toBeNull()
    expect(certDirForHostname('/data/caddy', 'a/b')).toBeNull()
    expect(certDirForHostname('/data/caddy', '')).toBeNull()
  })
})

describe('parseCertExpiry', () => {
  test('baca tanggal notAfter dari output openssl', () => {
    const out = `notBefore=Sep 25 02:00:00 2026 GMT
notAfter=Dec 24 02:00:00 2026 GMT`
    const t = parseCertExpiry(out)
    expect(t).not.toBeNull()
    expect(new Date(t as number).toISOString()).toStartWith('2026-12-24')
  })

  test('null kalau nggak ada notAfter', () => {
    expect(parseCertExpiry('notBefore=Sep 25 02:00:00 2026 GMT')).toBeNull()
  })

  test('null kalau tanggalnya ngawur', () => {
    expect(parseCertExpiry('notAfter=nggak-valid')).toBeNull()
  })
})

describe('isCertValid', () => {
  const now = new Date('2026-09-25T12:00:00Z')

  test('valid kalau masih lama', () => {
    expect(isCertValid({ expiry: '2026-12-24T00:00:00Z', now })).toBe(true)
  })

  test('nggak valid kalau udah lewat', () => {
    expect(isCertValid({ expiry: '2026-01-01T00:00:00Z', now })).toBe(false)
  })

  test('dianggap belum valid kalau tinggal < 24 jam', () => {
    // Sertifikat yang hampir habis jangan dilaporin "aktif" — user perlu
    // tau ada masalah renewal.
    expect(isCertValid({ expiry: '2026-09-26T00:00:00Z', now })).toBe(false)
  })

  test('tepat 24 jam dianggap belum valid', () => {
    expect(isCertValid({ expiry: '2026-09-26T12:00:00Z', now })).toBe(false)
  })

  test('lebih dari 24 jam dianggap valid', () => {
    expect(isCertValid({ expiry: '2026-09-26T12:00:01Z', now })).toBe(true)
  })
})

describe('readCertStatus', () => {
  const now = new Date('2026-09-25T12:00:00Z')

  test('active kalau file cert & key ada dan belum kedaluwarsa', () => {
    const status = readCertStatus({
      certExists: true,
      keyExists: true,
      expiryOutput: 'notAfter=Dec 24 02:00:00 2026 GMT',
      now,
    })
    expect(status).toBe('active')
  })

  test('pending kalau file-nya belum ada', () => {
    expect(
      readCertStatus({ certExists: false, keyExists: false, expiryOutput: '', now })
    ).toBe('pending')
  })

  test('pending kalau cuma ada cert-nya, nggak ada key-nya', () => {
    expect(
      readCertStatus({
        certExists: true,
        keyExists: false,
        expiryOutput: 'notAfter=Dec 24 02:00:00 2026 GMT',
        now,
      })
    ).toBe('pending')
  })

  test('failed kalau sertifikatnya udah kedaluwarsa', () => {
    const status = readCertStatus({
      certExists: true,
      keyExists: true,
      expiryOutput: 'notAfter=Jan 01 00:00:00 2026 GMT',
      now,
    })
    expect(status).toBe('failed')
  })

  test('failed kalau tanggalnya nggak kebaca walau file-nya ada', () => {
    const status = readCertStatus({
      certExists: true,
      keyExists: true,
      expiryOutput: 'bukan output openssl',
      now,
    })
    expect(status).toBe('failed')
  })
})
