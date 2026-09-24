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
  test('postgres pakai pg_dump dengan --clean biar bisa di-restore ulang', () => {
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
    // Tanpa ini, restore ke database yang ada isinya gagal dengan
    // "relation already exists".
    expect(cmd!.args).toContain('--clean')
    expect(cmd!.args).toContain('--if-exists')
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

  test('mysql pakai mysqldump dengan --add-drop-table', () => {
    const cmd = backupCommand({
      engine: 'mysql',
      containerName: 'hikari-db-01hxyz',
      user: 'hikari',
      password: 'rahasia',
      dbName: 'produksi',
    })
    expect(cmd!.args.join(' ')).toContain('mysqldump')
    expect(cmd!.args).toContain('--add-drop-table')
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
