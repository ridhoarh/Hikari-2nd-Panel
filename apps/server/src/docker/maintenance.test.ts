import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { selectImagesToKeep, pruneBuildLogs } from './maintenance'

describe('selectImagesToKeep', () => {
  test('pertahankan dua yang terbaru, sisanya dihapus', () => {
    const tags = ['a:3', 'a:2', 'a:1']
    expect(selectImagesToKeep(tags, 2)).toEqual(['a:1'])
  })

  test('nggak hapus apa-apa kalau cuma dua', () => {
    expect(selectImagesToKeep(['a:2', 'a:1'], 2)).toEqual([])
  })

  test('nggak hapus apa-apa kalau cuma satu', () => {
    expect(selectImagesToKeep(['a:1'], 2)).toEqual([])
  })

  test('daftar kosong balikin kosong', () => {
    expect(selectImagesToKeep([], 2)).toEqual([])
  })

  test('keep=1 pertahankan cuma yang terbaru', () => {
    expect(selectImagesToKeep(['a:3', 'a:2', 'a:1'], 1)).toEqual(['a:2', 'a:1'])
  })
})

describe('pruneBuildLogs', () => {
  test('hapus log yang lebih tua dari batas hari', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hikari-logs-'))

    const tua = join(dir, 'tua.log')
    const baru = join(dir, 'baru.log')
    writeFileSync(tua, 'log lama')
    writeFileSync(baru, 'log baru')

    const delapanHariLalu = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000
    utimesSync(tua, delapanHariLalu, delapanHariLalu)

    const dihapus = pruneBuildLogs(dir, 7)
    expect(dihapus).toBe(1)
    expect(readdirSync(dir)).toEqual(['baru.log'])

    rmSync(dir, { recursive: true, force: true })
  })

  test('nggak error kalau folder-nya nggak ada', () => {
    expect(pruneBuildLogs('/folder/nggak/ada', 7)).toBe(0)
  })

  test('nggak hapus apa-apa kalau semua masih baru', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hikari-logs-'))
    writeFileSync(join(dir, 'a.log'), 'x')
    expect(pruneBuildLogs(dir, 7)).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })
})
