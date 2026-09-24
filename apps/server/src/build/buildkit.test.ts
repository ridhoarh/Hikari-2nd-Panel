import { describe, expect, test } from 'bun:test'
import { BUILDKIT_BUILDER, BUILDKIT_MEMORY_MB, builderName } from './buildkit'

describe('konfigurasi BuildKit', () => {
  test('nama builder tetap', () => {
    expect(BUILDKIT_BUILDER).toBe('hikari-buildkit')
    expect(builderName()).toBe('hikari-buildkit')
  })

  test('batas memory 768MB', () => {
    expect(BUILDKIT_MEMORY_MB).toBe(768)
  })
})
