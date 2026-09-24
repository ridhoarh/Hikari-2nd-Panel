import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app'

let app: ReturnType<typeof createApp>
let cookie: string
let projectId: string
let dataDir: string

beforeEach(async () => {
  // Deploy key ditulis ke disk, jadi tesnya nggak boleh nyentuh /var/lib —
  // di mesin tanpa izin root itu bakal gagal karena alasan yang salah.
  dataDir = mkdtempSync(join(tmpdir(), 'hikari-apps-'))

  app = createApp({
    dbPath: ':memory:',
    keyPath: join(dataDir, 'secret.key'),
    port: 2508,
    deployKeyDir: join(dataDir, 'keys'),
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

  const project = await app.request('/api/projects', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Blog' }),
  })
  projectId = ((await project.json()) as { project: { id: string } }).project.id
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

const auth = () => ({ Cookie: cookie, 'Content-Type': 'application/json' })

describe('POST /api/projects/:projectId/apps', () => {
  test('bikin app dari github', async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Web',
        sourceType: 'github',
        repoUrl: 'git@github.com:user/repo.git',
        branch: 'main',
        containerPort: 3000,
      }),
    })
    expect(res.status).toBe(201)
    const { app: created } = (await res.json()) as { app: { slug: string } }
    expect(created.slug).toBe('web')
  })

  test('nolak app tanpa port', async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'X', sourceType: 'github', repoUrl: 'x', containerPort: 0 }),
    })
    expect(res.status).toBe(400)
  })

  test('tolak sourceType aneh', async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'X', sourceType: 'ftp', containerPort: 3000 }),
    })
    expect(res.status).toBe(400)
  })

  test('nolak kalau project nggak ada', async () => {
    const res = await app.request('/api/projects/nggak-ada/apps', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'X', sourceType: 'github', repoUrl: 'x', containerPort: 3000 }),
    })
    expect(res.status).toBe(404)
  })

  test('memory limit default 512 kalau nggak diisi', async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Default',
        sourceType: 'image',
        imageRef: 'nginx:alpine',
        containerPort: 80,
      }),
    })
    const { app: created } = (await res.json()) as { app: { memory_limit_mb: number } }
    expect(created.memory_limit_mb).toBe(512)
  })

  test('nolak git tanpa repoUrl', async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'X', sourceType: 'github', containerPort: 3000 }),
    })
    expect(res.status).toBe(400)
  })

  test('nolak image tanpa imageRef', async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'X', sourceType: 'image', containerPort: 3000 }),
    })
    expect(res.status).toBe(400)
  })
})

describe('env var', () => {
  let appId: string

  beforeEach(async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Env',
        sourceType: 'github',
        repoUrl: 'x',
        containerPort: 3000,
      }),
    })
    appId = ((await res.json()) as { app: { id: string } }).app.id
  })

  test('set env var biasa', async () => {
    const res = await app.request(`/api/apps/${appId}/env`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ key: 'NODE_ENV', value: 'production', isSecret: false }),
    })
    expect(res.status).toBe(200)
  })

  test('env var rahasia nggak balikin nilainya di GET', async () => {
    await app.request(`/api/apps/${appId}/env`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ key: 'PASSWORD', value: 'rahasia123', isSecret: true }),
    })

    const res = await app.request(`/api/apps/${appId}/env`, { headers: auth() })
    const { envVars } = (await res.json()) as {
      envVars: { key: string; value: string }[]
    }
    const secret = envVars.find((v) => v.key === 'PASSWORD')!
    expect(secret.value).toBe('••••••••')
  })

  test('env var biasa balikin nilai aslinya, bukan literal terenkripsi', async () => {
    await app.request(`/api/apps/${appId}/env`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ key: 'NODE_ENV', value: 'production', isSecret: false }),
    })

    const res = await app.request(`/api/apps/${appId}/env`, { headers: auth() })
    const { envVars } = (await res.json()) as {
      envVars: { key: string; value: string; isSecret: boolean }[]
    }
    const biasa = envVars.find((v) => v.key === 'NODE_ENV')!
    expect(biasa.value).toBe('production')
    expect(biasa.isSecret).toBe(false)
  })

  test('hapus env var', async () => {
    await app.request(`/api/apps/${appId}/env`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ key: 'FOO', value: 'bar', isSecret: false }),
    })
    const res = await app.request(`/api/apps/${appId}/env/FOO`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(200)
  })

  test('tolak key env var yang nggak valid', async () => {
    const res = await app.request(`/api/apps/${appId}/env`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ key: '1-BAD KEY', value: 'x', isSecret: false }),
    })
    expect(res.status).toBe(400)
  })
})

describe('kontrol app', () => {
  let appId: string

  beforeEach(async () => {
    const res = await app.request(`/api/projects/${projectId}/apps`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Ctrl',
        sourceType: 'image',
        imageRef: 'nginx:alpine',
        containerPort: 80,
      }),
    })
    appId = ((await res.json()) as { app: { id: string } }).app.id
  })

  test('GET status balikin struktur yang bener', async () => {
    const res = await app.request(`/api/apps/${appId}/status`, { headers: auth() })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; dockerAvailable: boolean }
    expect(typeof body.status).toBe('string')
    expect(typeof body.dockerAvailable).toBe('boolean')
  })

  test('GET logs nggak error walau container belum ada', async () => {
    const res = await app.request(`/api/apps/${appId}/logs`, { headers: auth() })
    expect(res.status).toBe(200)
  })

  test('GET deployments kosong di awal', async () => {
    const res = await app.request(`/api/apps/${appId}/deployments`, { headers: auth() })
    const { deployments } = (await res.json()) as { deployments: unknown[] }
    expect(deployments).toEqual([])
  })

  test('GIT deploy key bisa diambil', async () => {
    const res = await app.request(`/api/apps/${appId}/deploy-key`, { headers: auth() })
    expect(res.status).toBe(200)
    const { publicKey } = (await res.json()) as { publicKey: string }
    expect(publicKey).toContain('ssh-ed25519')
    expect(publicKey).toContain('hikari-ctrl')
  })

  test('hapus app', async () => {
    const res = await app.request(`/api/apps/${appId}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(200)
  })

  test('deploy balikin 202 tanpa nunggu build', async () => {
    const res = await app.request(`/api/apps/${appId}/deploy`, {
      method: 'POST',
      headers: auth(),
    })
    expect(res.status).toBe(202)
  })

  test('restart nggak 500 dan env var tetep utuh', async () => {
    await app.request(`/api/apps/${appId}/env`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ key: 'DATABASE_URL', value: 'postgres://x', isSecret: false }),
    })

    const res = await app.request(`/api/apps/${appId}/restart`, {
      method: 'POST',
      headers: auth(),
    })
    // Tanpa Docker, container belum ada -> 409. Yang penting bukan 500.
    expect([200, 409]).toContain(res.status)

    const env = await app.request(`/api/apps/${appId}/env`, { headers: auth() })
    const { envVars } = (await env.json()) as {
      envVars: { key: string; value: string }[]
    }
    expect(envVars.find((v) => v.key === 'DATABASE_URL')?.value).toBe('postgres://x')
  })
})

describe('proteksi login', () => {
  test('semua endpoint app butuh login', async () => {
    const paths = [
      ['GET', `/api/projects/${projectId}/apps`],
      ['GET', '/api/apps/apa-saja'],
      ['POST', '/api/apps/apa-saja/deploy'],
      ['GET', '/api/apps/apa-saja/logs'],
      ['GET', '/api/apps/apa-saja/deploy-key'],
    ] as const

    for (const [method, path] of paths) {
      const res = await app.request(path, { method })
      expect(res.status).toBe(401)
    }
  })
})
