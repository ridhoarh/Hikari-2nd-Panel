import { describe, expect, test } from 'bun:test'
import { createApp } from '../app'

function app() {
  return createApp({ dbPath: ':memory:', keyPath: '/tmp/hikari-auth-test.key', port: 2508 })
}

async function setup(app: ReturnType<typeof createApp>, username = 'admin', password = 'passwordkuat123') {
  return app.request('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

describe('GET /api/setup/status', () => {
  test('needsSetup true kalau belum ada user', async () => {
    const res = await app().request('/api/setup/status')
    const body = (await res.json()) as { needsSetup: boolean }
    expect(body.needsSetup).toBe(true)
  })
})

describe('POST /api/setup', () => {
  test('bikin user admin pertama', async () => {
    const a = app()
    const res = await setup(a)
    expect(res.status).toBe(201)

    const status = await a.request('/api/setup/status')
    expect(((await status.json()) as { needsSetup: boolean }).needsSetup).toBe(false)
  })

  test('nolak setup kedua kalinya', async () => {
    const a = app()
    await setup(a)
    const res = await setup(a, 'admin2', 'passwordkuat456')
    expect(res.status).toBe(409)
  })

  test('nolak password yang kekecilan', async () => {
    const res = await setup(app(), 'admin', 'pendek')
    expect(res.status).toBe(400)
  })

  test('nolak username kosong', async () => {
    const a = app()
    const res = await a.request('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '', password: 'passwordkuat123' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  test('login bener ngasih cookie', async () => {
    const a = app()
    await setup(a)
    const res = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('hikari_session')
  })

  test('password salah ditolak', async () => {
    const a = app()
    await setup(a)
    const res = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'salahbgt12345' }),
    })
    expect(res.status).toBe(401)
  })

  test('username nggak ada ditolak', async () => {
    const a = app()
    await setup(a)
    const res = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'hantu', password: 'passwordkuat123' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/auth/me', () => {
  test('401 kalau nggak ada cookie', async () => {
    const res = await app().request('/api/auth/me')
    expect(res.status).toBe(401)
  })

  test('balikin username kalau udah login', async () => {
    const a = app()
    await setup(a)
    const login = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
    })

    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    const res = await a.request('/api/auth/me', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { username: string }).username).toBe('admin')
  })

  test('cookie yang diutak-atik ditolak', async () => {
    const a = app()
    await setup(a)
    const res = await a.request('/api/auth/me', {
      headers: { Cookie: 'hikari_session=nggak.valid' },
    })
    expect(res.status).toBe(401)
  })
})

describe('batas percobaan login', () => {
  test('nolak setelah 5 percobaan gagal', async () => {
    const a = app()
    await setup(a)

    for (let i = 0; i < 5; i++) {
      await a.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({ username: 'admin', password: 'salahbanget123' }),
      })
    }

    const res = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
    })
    expect(res.status).toBe(429)
  })

  test('IP lain nggak kena batas', async () => {
    const a = app()
    await setup(a)

    for (let i = 0; i < 6; i++) {
      await a.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({ username: 'admin', password: 'salahbanget123' }),
      })
    }

    const res = await a.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
      body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
    })
    expect(res.status).toBe(200)
  })
})
