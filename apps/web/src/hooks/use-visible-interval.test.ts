import { describe, expect, test } from 'bun:test'
import { shouldPoll, MIN_INTERVAL_MS } from './use-visible-interval'

describe('shouldPoll', () => {
  test('jalan kalau tab kelihatan', () => {
    expect(shouldPoll({ visible: true, active: true })).toBe(true)
  })

  test('nggak jalan kalau tab disembunyiin', () => {
    expect(shouldPoll({ visible: false, active: true })).toBe(false)
  })

  test('nggak jalan kalau fitur polling dimatiin', () => {
    expect(shouldPoll({ visible: true, active: false })).toBe(false)
  })

  test('interval minimum nggak boleh kekecilan', () => {
    expect(MIN_INTERVAL_MS).toBeGreaterThanOrEqual(10_000)
  })
})
