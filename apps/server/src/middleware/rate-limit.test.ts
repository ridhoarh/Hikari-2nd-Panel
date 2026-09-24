import { describe, expect, test } from 'bun:test'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  test('ngizinin sampai batasnya', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 1000 })
    expect(limiter('ip-1')).toBe(true)
    expect(limiter('ip-1')).toBe(true)
    expect(limiter('ip-1')).toBe(true)
  })

  test('nolak setelah lewat batas', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 })
    limiter('ip-1')
    limiter('ip-1')
    expect(limiter('ip-1')).toBe(false)
  })

  test('kunci beda punya hitungan sendiri', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 })
    expect(limiter('ip-1')).toBe(true)
    expect(limiter('ip-2')).toBe(true)
    expect(limiter('ip-1')).toBe(false)
  })

  test('hitungan reset setelah jendela waktunya lewat', async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 50 })
    expect(limiter('ip-1')).toBe(true)
    expect(limiter('ip-1')).toBe(false)
    await new Promise((r) => setTimeout(r, 60))
    expect(limiter('ip-1')).toBe(true)
  })
})
