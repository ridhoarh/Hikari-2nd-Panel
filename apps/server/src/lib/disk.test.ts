import { describe, expect, test } from 'bun:test'
import { formatBytes, diskPercent, isDiskWarning } from './disk'

describe('formatBytes', () => {
  test('byte kecil', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  test('kilobyte', () => {
    expect(formatBytes(2048)).toBe('2 KB')
  })

  test('megabyte', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
  })

  test('gigabyte', () => {
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3 GB')
  })

  test('desimal cuma kalau perlu', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024)).toBe('1 KB')
  })
})

describe('diskPercent', () => {
  test('hitung persen terpakai', () => {
    expect(diskPercent({ total: 100, free: 25 })).toBe(75)
  })

  test('nol kalau total nol', () => {
    expect(diskPercent({ total: 0, free: 0 })).toBe(0)
  })

  test('dibulatkan satu desimal', () => {
    expect(diskPercent({ total: 3, free: 1 })).toBe(66.7)
  })
})

describe('isDiskWarning', () => {
  test('aman kalau masih banyak', () => {
    expect(isDiskWarning(50)).toBe(false)
  })

  test('warning di 80%', () => {
    expect(isDiskWarning(80)).toBe(true)
  })

  test('warning kalau lebih', () => {
    expect(isDiskWarning(95)).toBe(true)
  })

  test('belum warning di 79.9%', () => {
    expect(isDiskWarning(79.9)).toBe(false)
  })
})
