import { describe, expect, test } from 'bun:test'
import {
  BUILDKIT_CONTAINER,
  BUILDKIT_MEMORY_MB,
  BUILDKIT_VOLUME,
  buildkitHost,
} from './buildkit'

describe('konfigurasi BuildKit', () => {
  test('nama container buildkit bener', () => {
    expect(BUILDKIT_CONTAINER).toBe('hikari-buildkit')
  })

  test('batas memory 768MB', () => {
    expect(BUILDKIT_MEMORY_MB).toBe(768)
  })

  test('volume cache punya nama tetap', () => {
    expect(BUILDKIT_VOLUME).toBe('hikari-buildkit-cache')
  })

  test('host buildkit nunjuk ke container-nya', () => {
    expect(buildkitHost()).toBe(`docker-container://${BUILDKIT_CONTAINER}`)
  })
})
