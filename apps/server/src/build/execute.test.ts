import { describe, expect, test } from 'bun:test'
import { shouldTagLatest, latestTagFor, BATAS_BUILD_MS, BATAS_PULL_MS } from './execute'

describe('shouldTagLatest', () => {
  test('hasil build dockerfile perlu di-tag latest', () => {
    expect(shouldTagLatest('dockerfile')).toBe(true)
  })

  test('hasil build railpack perlu di-tag latest', () => {
    expect(shouldTagLatest('railpack')).toBe(true)
  })

  test('image dari registry nggak perlu di-tag latest', () => {
    expect(shouldTagLatest('image')).toBe(false)
  })
})

describe('latestTagFor', () => {
  test('bikin tag latest dari slug', () => {
    expect(latestTagFor('blog')).toBe('hikari-blog:latest')
  })
})

describe('batas waktu build', () => {
  test('build ada batasnya, biar nggak nggantung selamanya', () => {
    expect(BATAS_BUILD_MS).toBeGreaterThan(0)
    expect(Number.isFinite(BATAS_BUILD_MS)).toBe(true)
  })

  test('pull image punya batas sendiri', () => {
    expect(BATAS_PULL_MS).toBeGreaterThan(0)
    expect(BATAS_PULL_MS).toBeLessThan(BATAS_BUILD_MS)
  })
})
