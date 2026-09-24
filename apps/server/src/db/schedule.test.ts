import { describe, expect, test } from 'bun:test'
import { alreadyRanToday, isDue, msUntilDue } from './schedule'

describe('isDue', () => {
  test('due kalau belum pernah jalan', () => {
    expect(isDue({ lastRunAt: null, intervalHours: 24, now: new Date() })).toBe(true)
  })

  test('belum due kalau baru jalan', () => {
    const now = new Date('2026-01-01T12:00:00Z')
    const baru = '2026-01-01T11:00:00Z'
    expect(isDue({ lastRunAt: baru, intervalHours: 24, now })).toBe(false)
  })

  test('due kalau udah lewat intervalnya', () => {
    const now = new Date('2026-01-02T13:00:00Z')
    const lama = '2026-01-01T12:00:00Z'
    expect(isDue({ lastRunAt: lama, intervalHours: 24, now })).toBe(true)
  })

  test('tepat di batas dianggap due', () => {
    const now = new Date('2026-01-02T12:00:00Z')
    const lama = '2026-01-01T12:00:00Z'
    expect(isDue({ lastRunAt: lama, intervalHours: 24, now })).toBe(true)
  })

  test('timestamp rusak dianggap due (lebih baik backup daripada nggak)', () => {
    expect(
      isDue({ lastRunAt: 'nggak-valid', intervalHours: 24, now: new Date() })
    ).toBe(true)
  })

  test('interval 0 dimatiin', () => {
    expect(isDue({ lastRunAt: null, intervalHours: 0, now: new Date() })).toBe(false)
  })

  test('interval negatif dimatiin', () => {
    expect(isDue({ lastRunAt: null, intervalHours: -1, now: new Date() })).toBe(false)
  })
})

describe('msUntilDue', () => {
  test('nol kalau udah due', () => {
    expect(msUntilDue({ lastRunAt: null, intervalHours: 24, now: new Date() })).toBe(0)
  })

  test('sisa waktunya bener', () => {
    const now = new Date('2026-01-01T12:00:00Z')
    const baru = '2026-01-01T10:00:00Z'
    const sisa = msUntilDue({ lastRunAt: baru, intervalHours: 4, now })
    expect(sisa).toBe(2 * 60 * 60 * 1000)
  })
})

describe('alreadyRanToday', () => {
  test('true kalau jalan di hari yang sama (UTC)', () => {
    expect(
      alreadyRanToday({
        lastRunAt: '2026-01-01T01:00:00Z',
        now: new Date('2026-01-01T23:00:00Z'),
      })
    ).toBe(true)
  })

  test('false kalau beda hari', () => {
    expect(
      alreadyRanToday({
        lastRunAt: '2026-01-01T23:00:00Z',
        now: new Date('2026-01-02T01:00:00Z'),
      })
    ).toBe(false)
  })

  test('false kalau belum pernah jalan', () => {
    expect(alreadyRanToday({ lastRunAt: null, now: new Date() })).toBe(false)
  })
})
