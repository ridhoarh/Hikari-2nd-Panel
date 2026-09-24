import { beforeEach, describe, expect, test } from 'bun:test'
import { createApp } from '../app'

let app: ReturnType<typeof createApp>
let cookie: string

beforeEach(async () => {
  app = createApp({
    dbPath: ':memory:',
    keyPath: '/tmp/hikari-projects-test.key',
    port: 2508,
  })

  await app.request('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
  })

  const login = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'passwordkuat123' }),
  })
  cookie = login.headers.get('set-cookie')!.split(';')[0]
})

const auth = () => ({ Cookie: cookie, 'Content-Type': 'application/json' })

describe('proteksi login', () => {
  test('GET tanpa login 401', async () => {
    const res = await app.request('/api/projects')
    expect(res.status).toBe(401)
  })

  test('POST tanpa login 401', async () => {
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/projects', () => {
  test('kosong di awal', async () => {
    const res = await app.request('/api/projects', { headers: auth() })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { projects: unknown[] }).projects).toEqual([])
  })
})

describe('POST /api/projects', () => {
  test('bikin project', async () => {
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Blog' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { project: { name: string; slug: string } }
    expect(body.project.name).toBe('Blog')
    expect(body.project.slug).toBe('blog')
  })

  test('nolak nama kosong', async () => {
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: '' }),
    })
    expect(res.status).toBe(400)
  })

  test('nama kepanjangan ditolak', async () => {
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'a'.repeat(101) }),
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/projects/:id', () => {
  test('balikin 404 kalau nggak ada', async () => {
    const res = await app.request('/api/projects/nggak-ada', { headers: auth() })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/projects/:id', () => {
  test('hapus project', async () => {
    const created = await app.request('/api/projects', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Hapus' }),
    })
    const { project } = (await created.json()) as { project: { id: string } }

    const res = await app.request(`/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(200)

    const get = await app.request(`/api/projects/${project.id}`, { headers: auth() })
    expect(get.status).toBe(404)
  })
})
