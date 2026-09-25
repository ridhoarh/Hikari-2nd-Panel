import { describe, expect, test } from 'bun:test'
import {
  backupCommand,
  backupFilename,
  bgsaveMasihJalan,
  bgsaveStatusTerakhir,
  redisBackupCommands,
} from './backup'

describe('backupFilename', () => {
  test('pakai ekstensi sesuai engine', () => {
    expect(backupFilename('postgres', '01HXYZ')).toBe('backup-01HXYZ.sql')
    expect(backupFilename('mysql', '01HXYZ')).toBe('backup-01HXYZ.sql')
  })

  test('redis pakai ekstensi .rdb', () => {
    expect(backupFilename('redis', '01HXYZ')).toBe('backup-01HXYZ.rdb')
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

  test('redis balikin null di backupCommand (pakai jalur sendiri)', () => {
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

describe('redisBackupCommands', () => {
  const cmds = redisBackupCommands({
    containerName: 'hikari-db-x',
    password: 'rahasia123',
  })

  test('BGSAVE jalan di dalam container', () => {
    expect(cmds.bgsave.cmd).toBe('docker')
    expect(cmds.bgsave.args).toContain('BGSAVE')
  })

  test('cek progres BGSAVE lewat INFO persistence, bukan LASTSAVE', () => {
    // Kegagalan nyata: Redis jalan dengan `--appendonly yes`, dan di mode itu
    // RDB periodik dimatikan — `LASTSAVE` bisa nggak pernah berubah walau
    // BGSAVE bikin snapshot baru. Penantian berbasis timestamp jadi selalu
    // timeout. Jadi patokannya `rdb_bgsave_in_progress`.
    expect(cmds.cekBgsave.args).toContain('INFO')
    expect(cmds.cekBgsave.args).toContain('persistence')
    expect(cmds.cekBgsave.cmd).toBe('docker')
  })

  test('baca dump.rdb lewat cat, bukan docker cp', () => {
    expect(cmds.bacaDump.args.join(' ')).toContain('cat')
    expect(cmds.bacaDump.args.join(' ')).toContain('/data/dump.rdb')
    expect(cmds.bacaDump.args).not.toContain('cp')
  })

  test('password dikirim lewat REDISCLI_AUTH di docker exec -e', () => {
    // Kegagalan nyata: `docker exec` nggak nerusin environment host ke dalam
    // container. Kalau `REDISCLI_AUTH` cuma ditempel di env proses `docker`,
    // `redis-cli` di dalam nggak liat apa-apa dan gagal `NOAUTH`. Jadi env-nya
    // HARUS dikirim sebagai argumen `-e KEY=value`.
    expect(cmds.bgsave.args).toContain('REDISCLI_AUTH=rahasia123')
    expect(cmds.bgsave.args).toContain('-e')
    expect(cmds.cekBgsave.args).toContain('REDISCLI_AUTH=rahasia123')
  })

  test('password nggak nyasar ke argumen redis-cli', () => {
    // Yang bahaya itu daftar argumen `redis-cli` di dalam container. Pastikan
    // password cuma muncul sebagai nilai `-e`, bukan argumen lepas. `-e` dan
    // pasangannya emang ada, jadi bandingin lewat indeks redis-cli-nya.
    for (const args of [cmds.bgsave.args, cmds.cekBgsave.args]) {
      const idx = args.indexOf('redis-cli')
      expect(idx).toBeGreaterThan(-1)
      expect(args.slice(idx)).not.toContain('rahasia123')
      expect(args.slice(idx)).not.toContain('-a')
    }
  })

  test('nggak pakai flag -a (password muncul di ps dalam container)', () => {
    // Kegagalan nyata: `-a <password>` kelihatan di daftar argumen proses.
    // `--no-auth-warning` juga jebakan — dia cuma nyembunyiin peringatan,
    // bukan ngirim password, jadi perintahnya gagal NOAUTH.
    expect(cmds.bgsave.args).not.toContain('-a')
    expect(cmds.bgsave.args).not.toContain('--no-auth-warning')
  })
})

describe('bgsaveMasihJalan', () => {
  test('deteksi BGSAVE yang masih jalan', () => {
    expect(bgsaveMasihJalan('rdb_bgsave_in_progress:1')).toBe(true)
    expect(
      bgsaveMasihJalan('# Persistence\nrdb_changes_since_last_save:0\nrdb_bgsave_in_progress:1\n')
    ).toBe(true)
  })

  test('anggap kelar kalau flag-nya 0 atau nggak ada', () => {
    expect(bgsaveMasihJalan('rdb_bgsave_in_progress:0')).toBe(false)
    // Field-nya nggak ada = kita nggak bisa nunggu apa-apa lagi.
    expect(bgsaveMasihJalan('# Persistence\nloading:0\n')).toBe(false)
    expect(bgsaveMasihJalan('')).toBe(false)
  })

  test('nggak kejebak angka yang cuma mirip', () => {
    // `rdb_bgsave_in_progress_duration:1` bukan field yang kita cari.
    expect(bgsaveMasihJalan('rdb_bgsave_in_progress_extra:1')).toBe(false)
  })

  test('tahan sama CRLF dan spasi sesudah titik dua', () => {
    // Kegagalan nyata: keluaran `INFO` dari dalam container pakai `\r\n`,
    // jadi barisnya `rdb_last_bgsave_status:ok\r`. Parser yang cuma cocok
    // sama `\n` polos bakal ngelewatinnya dan nganggep statusnya nggak ada.
    expect(bgsaveMasihJalan('a:0\r\nrdb_bgsave_in_progress:1\r\n')).toBe(true)
    expect(bgsaveMasihJalan('rdb_bgsave_in_progress: 1')).toBe(true)
    expect(bgsaveMasihJalan('rdb_bgsave_in_progress:0\r\n')).toBe(false)
  })
})

describe('bgsaveStatusTerakhir', () => {
  test('baca status terakhir', () => {
    expect(bgsaveStatusTerakhir('rdb_last_bgsave_status:ok')).toBe('ok')
    expect(bgsaveStatusTerakhir('rdb_last_bgsave_status:err')).toBe('err')
  })

  test('balikin penanda netral kalau field-nya nggak ada', () => {
    expect(bgsaveStatusTerakhir('loading:0')).toBe('tidak diketahui')
  })

  test('tahan sama CRLF dan spasi sesudah titik dua', () => {
    expect(bgsaveStatusTerakhir('a:0\r\nrdb_last_bgsave_status:ok\r\n')).toBe('ok')
    expect(bgsaveStatusTerakhir('rdb_last_bgsave_status: err')).toBe('err')
  })
})
