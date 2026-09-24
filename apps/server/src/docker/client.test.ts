import { describe, expect, test } from 'bun:test'
import { containerName, imageTag, networkName } from './client'

describe('penamaan Docker', () => {
  test('nama container pakai prefix hikari-app-', () => {
    expect(containerName('blog')).toBe('hikari-app-blog')
  })

  test('tag image pakai prefix hikari-', () => {
    expect(imageTag('blog', '01HXYZ')).toBe('hikari-blog:01HXYZ')
  })

  test('nama network konsisten', () => {
    expect(networkName()).toBe('hikari')
  })
})
