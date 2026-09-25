import { describe, expect, test } from 'bun:test'
import { isKontrolPesan, validResize } from './protocol'

describe('validResize', () => {
  test('terima ukuran yang wajar', () => {
    expect(validResize(80, 24)).toEqual({ ok: true })
  })

  test('tolak nol', () => {
    expect(validResize(0, 24).ok).toBe(false)
    expect(validResize(80, 0).ok).toBe(false)
  })

  test('tolak negatif', () => {
    expect(validResize(-1, 24).ok).toBe(false)
  })

  test('tolak yang kegedean', () => {
    // Tanpa batas atas, client bisa minta terminal 100 juta kolom dan
    // bikin server kehabisan memori.
    expect(validResize(100_000, 24).ok).toBe(false)
    expect(validResize(80, 100_000).ok).toBe(false)
  })

  test('tolak NaN', () => {
    expect(validResize(Number.NaN, 24).ok).toBe(false)
  })

  test('terima tepat di batas', () => {
    expect(validResize(500, 300).ok).toBe(true)
  })
})

describe('isKontrolPesan', () => {
  test('JSON dianggap pesan kontrol', () => {
    expect(isKontrolPesan('{"type":"resize"}')).toBe(true)
  })

  test('ketikan biasa bukan kontrol', () => {
    expect(isKontrolPesan('ls -la\n')).toBe(false)
  })

  test('ketikan yang kebetulan mulai dengan { tetep dicek', () => {
    expect(isKontrolPesan('{ ini bukan json')).toBe(true)
  })

  test('string kosong bukan kontrol', () => {
    expect(isKontrolPesan('')).toBe(false)
  })
})
