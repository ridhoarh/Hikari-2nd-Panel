import { describe, expect, test } from 'bun:test'
import { createApp } from './app'

function testApp() {
  return createApp({ dbPath: ':memory:', keyPath: '/tmp/hikari-test.key', port: 2508 })
}

describe('GET /api/health', () => {
  test('balikin status ok', async () => {
    const app = testApp()
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)

    const body = (await res.json()) as { status: string; version: string }
    expect(body.status).toBe('ok')
    expect(typeof body.version).toBe('string')
  })
})

describe('route yang nggak ada', () => {
  test('balikin 404 dalam bentuk JSON', async () => {
    const app = testApp()
    const res = await app.request('/api/nggak-ada')
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBeDefined()
  })
})
