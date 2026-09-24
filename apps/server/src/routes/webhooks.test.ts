import { beforeEach, describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { createApp } from '../app'

let app: ReturnType<typeof createApp>
let cookie: string
let appId: string
let secret: string

beforeEach(async () => {
  app = createApp({
    dbPath: ':memory:',
    keyPath: '/tmp/hikari-webhook-test.key',
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

  const auth = { Cookie: cookie, 'Content-Type': 'application/json' }

  const project = await app.request('/api/projects', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'Blog' }),
  })
  const projectId = ((await project.json()) as { project: { id: string } }).project.id

  const created = await app.request(`/api/projects/${projectId}/apps`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      name: 'Hook',
      sourceType: 'github',
      repoUrl: 'git@github.com:user/repo.git',
      branch: 'main',
      containerPort: 3000,
    }),
  })
  appId = ((await created.json()) as { app: { id: string } }).app.id

  const info = await app.request(`/api/apps/${appId}/webhook`, { headers: auth })
  secret = ((await info.json()) as { secret: string }).secret
})

function sign(payload: string, withSecret: string): string {
  return `sha256=${createHmac('sha256', withSecret).update(payload).digest('hex')}`
}

const payload = JSON.stringify({ ref: 'refs/heads/main' })

function hook(signature: string, body = payload, targetId = appId) {
  return app.request(`/api/webhooks/github/${targetId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
      'x-github-event': 'push',
      'x-github-delivery': 'abc-123',
    },
    body,
  })
}

describe('POST /api/webhooks/github/:appId', () => {
  test('signature bener diterima', async () => {
    const res = await hook(sign(payload, secret))
    expect(res.status).toBe(202)
  })

  test('signature salah ditolak 401', async () => {
    const res = await hook(sign(payload, 'rahasia-salah'))
    expect(res.status).toBe(401)
  })

  test('signature kosong ditolak 401', async () => {
    const res = await hook('')
    expect(res.status).toBe(401)
  })

  test('signature yang diutak-atik ditolak', async () => {
    const res = await hook(sign(`${payload} `, secret))
    expect(res.status).toBe(401)
  })

  test('app nggak ada balikin 404', async () => {
    const res = await hook(sign(payload, secret), payload, 'nggak-ada')
    expect(res.status).toBe(404)
  })

  test('push ke branch lain tetap diterima webhook (difilter di handler)', async () => {
    const lain = JSON.stringify({ ref: 'refs/heads/feature' })
    const res = await hook(sign(lain, secret), lain)
    expect(res.status).toBe(202)
  })

  test('event yang bukan push diabaikan', async () => {
    const res = await app.request(`/api/webhooks/github/${appId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': sign(payload, secret),
        'x-github-event': 'issues',
        'x-github-delivery': 'xyz',
      },
      body: payload,
    })
    expect(res.status).toBe(202)
  })

  test('nggak butuh cookie, cukup signature', async () => {
    const res = await hook(sign(payload, secret))
    expect(res.status).not.toBe(401)
  })
})

describe('GET /api/apps/:id/webhook', () => {
  test('butuh login', async () => {
    const res = await app.request(`/api/apps/${appId}/webhook`)
    expect(res.status).toBe(401)
  })

  test('balikin secret yang sama tiap kali', async () => {
    const a = await app.request(`/api/apps/${appId}/webhook`, {
      headers: { Cookie: cookie },
    })
    const b = await app.request(`/api/apps/${appId}/webhook`, {
      headers: { Cookie: cookie },
    })
    const sa = ((await a.json()) as { secret: string }).secret
    const sb = ((await b.json()) as { secret: string }).secret
    expect(sa).toBe(sb)
    expect(sa.length).toBeGreaterThan(20)
  })
})
