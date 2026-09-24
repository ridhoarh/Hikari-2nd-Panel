import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decrypt, encrypt, generateKey, loadOrCreateKey } from './crypto'

describe('enkripsi', () => {
  const key = generateKey()

  test('bolak-balik ngasih hasil yang sama', () => {
    const asli = 'postgresql://user:rahasia123@localhost:5432/db'
    expect(decrypt(encrypt(asli, key), key)).toBe(asli)
  })

  test('hasil enkripsi beda tiap kali (IV acak)', () => {
    const a = encrypt('sama', key)
    const b = encrypt('sama', key)
    expect(a).not.toBe(b)
  })

  test('formatnya v1:iv:tag:cipher', () => {
    const parts = encrypt('x', key).split(':')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('v1')
  })

  test('kunci salah bikin gagal, bukan ngasih teks ngawur', () => {
    const payload = encrypt('rahasia', key)
    const kunciLain = generateKey()
    expect(() => decrypt(payload, kunciLain)).toThrow()
  })

  test('payload rusak bikin gagal', () => {
    expect(() => decrypt('nggak-valid', key)).toThrow()
  })

  test('teks kosong tetep bisa dibalikin', () => {
    expect(decrypt(encrypt('', key), key)).toBe('')
  })
})

describe('loadOrCreateKey', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hikari-key-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('bikin file kunci baru kalau belum ada', () => {
    const path = join(dir, 'secret.key')
    const key = loadOrCreateKey(path)
    expect(key).toHaveLength(32)
    expect(existsSync(path)).toBe(true)
  })

  test('file kunci izinnya cuma buat pemilik (0600)', () => {
    const path = join(dir, 'secret.key')
    loadOrCreateKey(path)
    const mode = statSync(path).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test('baca kunci yang udah ada, bukan bikin baru', () => {
    const path = join(dir, 'secret.key')
    const first = loadOrCreateKey(path)
    const second = loadOrCreateKey(path)
    expect(second.equals(first)).toBe(true)
  })
})
