import { describe, expect, test } from 'bun:test'
import { canRestore, restoreCommand, validateBackupContent } from './restore'

describe('restoreCommand', () => {
  test('postgres pakai psql', () => {
    const cmd = restoreCommand({
      engine: 'postgres',
      containerName: 'hikari-db-x',
      user: 'hikari',
      dbName: 'produksi',
    })
    expect(cmd!.cmd).toBe('docker')
    expect(cmd!.args).toContain('psql')
    expect(cmd!.args.join(' ')).toContain('produksi')
  })

  test('mysql pakai mysql client', () => {
    const cmd = restoreCommand({
      engine: 'mysql',
      containerName: 'hikari-db-x',
      user: 'hikari',
      dbName: 'produksi',
    })
    expect(cmd!.args.join(' ')).toContain('mysql')
  })

  test('redis nggak bisa restore', () => {
    expect(
      restoreCommand({
        engine: 'redis',
        containerName: 'hikari-db-x',
        user: 'hikari',
        dbName: 'd',
      })
    ).toBeNull()
  })

  test('password nggak muncul di argumen', () => {
    const cmd = restoreCommand({
      engine: 'postgres',
      containerName: 'hikari-db-x',
      user: 'hikari',
      dbName: 'd',
    })
    expect(cmd!.args.join(' ')).not.toContain('password')
  })
})

describe('validateBackupContent', () => {
  test('terima dump postgres', () => {
    const isi = '--\n-- PostgreSQL database dump\n--\nCREATE TABLE tes (id int);'
    expect(validateBackupContent('postgres', isi).ok).toBe(true)
  })

  test('terima dump mysql', () => {
    const isi = '-- MySQL dump 10.13\nCREATE TABLE `tes` (id int);'
    expect(validateBackupContent('mysql', isi).ok).toBe(true)
  })

  test('tolak file kosong', () => {
    expect(validateBackupContent('postgres', '').ok).toBe(false)
  })

  test('tolak file yang bukan SQL', () => {
    expect(validateBackupContent('postgres', 'halo ini bukan dump').ok).toBe(false)
  })

  test('tolak kalau engine nggak didukung', () => {
    expect(validateBackupContent('redis', 'apa aja').ok).toBe(false)
  })

  test('nggak baca seluruh file, cuma awalnya', () => {
    // Dump asli selalu ada header di awal. Membaca seluruh file cuma buat
    // validasi itu boros, jadi dicek dari awalannya aja.
    const isi = '--\n-- PostgreSQL database dump\n--\n' + 'x'.repeat(5_000_000)
    expect(validateBackupContent('postgres', isi).ok).toBe(true)
  })

  test('file yang tandanya cuma ada di akhir ditolak', () => {
    // Ini yang dikorbankan: validasi cepet, tapi file yang isinya nggak
    // khas dump bakal ketolak. Itu lebih baik daripada baca file 500MB.
    const besar = 'x'.repeat(5_000_000) + '\nCREATE TABLE t (id int);'
    expect(validateBackupContent('postgres', besar).ok).toBe(false)
  })
})

describe('canRestore', () => {
  test('postgres & mysql bisa', () => {
    expect(canRestore('postgres')).toBe(true)
    expect(canRestore('mysql')).toBe(true)
  })

  test('redis nggak bisa', () => {
    expect(canRestore('redis')).toBe(false)
  })
})
