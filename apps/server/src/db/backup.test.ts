import { describe, expect, test } from 'bun:test'
import { backupCommand, backupFilename } from './backup'

describe('backupFilename', () => {
  test('pakai ekstensi sesuai engine', () => {
    expect(backupFilename('postgres', '01HXYZ')).toBe('backup-01HXYZ.sql')
    expect(backupFilename('mysql', '01HXYZ')).toBe('backup-01HXYZ.sql')
  })

  test('redis nggak didukung', () => {
    expect(backupFilename('redis', '01HXYZ')).toBeNull()
  })

  test('nama file aman (nggak ada slash)', () => {
    const nama = backupFilename('postgres', '01HXYZ') as string
    expect(nama).not.toContain('/')
    expect(nama).not.toContain('..')
  })
})

describe('backupCommand', () => {
  test('postgres pakai pg_dump ke stdout', () => {
    const cmd = backupCommand({
      engine: 'postgres',
      containerName: 'hikari-db-01hxyz',
      user: 'hikari',
      password: 'rahasia',
      dbName: 'produksi',
    })
    expect(cmd).not.toBeNull()
    expect(cmd!.cmd).toBe('docker')
    expect(cmd!.args).toContain('exec')
    expect(cmd!.args).toContain('hikari-db-01hxyz')
    expect(cmd!.args.join(' ')).toContain('pg_dump')
  })

  test('postgres nggak butuh password di argumen (udah di container)', () => {
    const cmd = backupCommand({
      engine: 'postgres',
      containerName: 'hikari-db-01hxyz',
      user: 'hikari',
      password: 'rahasia123',
      dbName: 'produksi',
    })
    // Password jangan muncul di daftar argumen — kelihatan di `ps`.
    expect(cmd!.args.join(' ')).not.toContain('rahasia123')
  })

  test('mysql pakai mysqldump', () => {
    const cmd = backupCommand({
      engine: 'mysql',
      containerName: 'hikari-db-01hxyz',
      user: 'hikari',
      password: 'rahasia',
      dbName: 'produksi',
    })
    expect(cmd!.args.join(' ')).toContain('mysqldump')
  })

  test('redis balikin null karena nggak didukung', () => {
    expect(
      backupCommand({
        engine: 'redis',
        containerName: 'hikari-db-x',
        user: 'hikari',
        password: 'r',
        dbName: 'd',
      })
    ).toBeNull()
  })
})
