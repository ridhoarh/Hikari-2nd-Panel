import { describe, expect, test } from 'bun:test'
import { HIKARI_VERSION } from './version'

describe('HIKARI_VERSION', () => {
  test('formatnya semver, tanpa awalan v', () => {
    // Tag git-nya `v0.1.2`, tapi yang ditampilin panel harus `0.1.2`.
    // Kegagalan nyata: tag udah v0.1.1 tapi panel masih lapor 0.1.0, karena
    // file ini lupa ikut dinaikin.
    expect(HIKARI_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(HIKARI_VERSION).not.toStartWith('v')
  })

  test('bukan versi placeholder', () => {
    // Jangan sampai ada yang nulis 'x.y.z' atau 'latest' pas buru-buru.
    expect(HIKARI_VERSION).not.toMatch(/x|latest|dev|placeholder/i)
  })
})
