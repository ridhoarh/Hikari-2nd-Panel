import { describe, expect, test } from 'bun:test'
import { newId, nowIso, slugify } from './id'

describe('newId', () => {
  test('bikin 26 karakter', () => {
    expect(newId()).toHaveLength(26)
  })

  test('urut naik secara leksikografis (monotonik dalam milidetik yang sama)', () => {
    const ids = Array.from({ length: 50 }, () => newId())
    for (let i = 1; i < ids.length; i++) {
      // ULID punya timestamp 48-bit di depan. Dua ID yang dibikin dalam
      // milidetik yang sama punya prefix sama, dan sisanya nggak dijamin
      // naik — jadi yang dites adalah monotonik: nggak pernah turun.
      expect(ids[i] >= ids[i - 1]).toBe(true)
      expect(ids[i]).not.toBe(ids[i - 1])
    }
  })

  test('yang dibikin belakangan nggak pernah lebih kecil', () => {
    const a = newId()
    const b = newId()
    expect(a <= b).toBe(true)
  })
})

describe('nowIso', () => {
  test('format ISO-8601 UTC dengan Z di akhir', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('slugify', () => {
  test('huruf kecil dan tanda hubung', () => {
    expect(slugify('Blog API')).toBe('blog-api')
  })

  test('buang karakter yang nggak aman buat nama container', () => {
    expect(slugify('my_app!! @2024')).toBe('my-app-2024')
  })

  test('teks panjang dipotong jadi 32 karakter', () => {
    expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(32)
  })

  test('teks kosong setelah dibersihin jadi "app"', () => {
    expect(slugify('!!!')).toBe('app')
  })

  test('nggak mulai atau berakhir dengan tanda hubung', () => {
    expect(slugify('--hello--')).toBe('hello')
  })
})
