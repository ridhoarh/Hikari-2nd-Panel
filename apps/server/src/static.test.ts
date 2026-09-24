import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { mountStatic } from './static'

let dir: string
let staticDir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hikari-static-'))
  staticDir = join(dir, 'dist')
  mkdirSync(staticDir, { recursive: true })
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><h1>Hikari</h1>')
  writeFileSync(join(staticDir, 'app.js'), 'console.log("hai")')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** App minimal: mountStatic didaftarin SEBELUM notFound. */
function staticApp() {
  const app = new Hono()
  app.get('/api/health', (c) => c.json({ status: 'ok' }))
  mountStatic(app, staticDir)
  app.notFound((c) => c.json({ error: 'Nggak ketemu' }, 404))
  return app
}

describe('serve frontend', () => {
  test('route root balikin index.html', async () => {
    const res = await staticApp().request('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Hikari')
  })

  test('route SPA yang nggak ada tetep balikin index.html', async () => {
    const res = await staticApp().request('/projects/abc')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Hikari')
  })

  test('file statis bisa diambil', async () => {
    const res = await staticApp().request('/app.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('console.log')
  })

  test('API yang nggak ada tetep 404 JSON, bukan index.html', async () => {
    const res = await staticApp().request('/api/nggak-ada')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  test('health tetep jalan', async () => {
    const res = await staticApp().request('/api/health')
    expect(res.status).toBe(200)
  })

  test('path traversal ditolak, fallback ke index.html', async () => {
    writeFileSync(join(dir, 'secret.txt'), 'JANGAN SAMPE KEBOBOL')
    const res = await staticApp().request('/../secret.txt')
    const text = await res.text()
    expect(text).not.toContain('JANGAN SAMPE KEBOBOL')
    expect(text).toContain('Hikari')
  })

  test('aset ber-hash di-cache lama, index.html nggak', async () => {
    const a = staticApp()
    const js = await a.request('/app.js')
    expect(js.headers.get('cache-control')).toBe('no-cache')

    // Nama file hasil build Vite: index-D6aJq44q.js
    writeFileSync(join(staticDir, 'index-D6aJq44q.js'), 'console.log(1)')
    const hashed = await a.request('/index-D6aJq44q.js')
    expect(hashed.headers.get('cache-control')).toContain('immutable')
  })

  test('index.html nggak di-cache biar deploy kebaca', async () => {
    const res = await staticApp().request('/')
    expect(res.headers.get('cache-control')).toBe('no-cache')
  })
})
