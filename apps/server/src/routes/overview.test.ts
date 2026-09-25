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
  // Repo git app ditulis ke disk, jadi tesnya nggak boleh nyentuh /var/lib —
  // di mesin tanpa izin root itu bakal gagal karena alasan yang salah.
  dataDir = mkdtempSync(join(tmpdir(), 'hikari-overview-'))

  app = createApp({
    dbPath: ':memory:',
    keyPath: join(dataDir, 'secret.key'),
    port: 2508,
    dataDir,
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
    body: JSON.stringify({ name: 'Produksi' }),
  })
  projectId = (await json<{ project: { id: string } }>(project)).project.id
})

const auth = () => ({ Cookie: cookie, 'Content-Type': 'application/json' })

/** `res.json()` bertipe unknown di TypeScript — bantu dengan cast eksplisit. */
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

async function bikinApp(nama: string) {
  const res = await app.request(`/api/projects/${projectId}/apps`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({
      name: nama,
      sourceType: 'image',
      imageRef: 'nginx:alpine',
      containerPort: 80,
      memoryLimitMb: 512,
      cpuLimit: 1,
    }),
  })
  return (await json<{ app: { id: string } }>(res)).app.id
}

describe('proteksi login', () => {
  // Daftar lintas project nampilin semua yang ada di VPS, jadi jangan sampai
  // kebuka tanpa sesi. `/api/settings` ikut di sini karena pernah kelewat
  // didaftarin — dia bocorin versi, path data, dan pemakaian disk.
  //
  // `/api/backups` di bawah ini SENGAJA cuma ngecek GET daftarnya; route
  // `/api/backups/:id/download` juga kecover sama middleware yang sama.
  for (const path of [
    '/api/applications',
    '/api/databases',
    '/api/storage',
    '/api/domains',
    '/api/backups',
    '/api/activity',
    '/api/settings',
    '/api/backup-schedule',
  ]) {
    test(`GET ${path} tanpa login 401`, async () => {
      const res = await app.request(path)
      expect(res.status).toBe(401)
    })
  }
})

describe('GET /api/applications', () => {
  test('kosong di awal', async () => {
    const res = await app.request('/api/applications', { headers: auth() })
    expect(res.status).toBe(200)
    expect((await json<{ applications: unknown[] }>(res)).applications).toEqual([])
  })

  test('nampilin app dari project apa pun, plus nama project-nya', async () => {
    await bikinApp('Web')
    const res = await app.request('/api/applications', { headers: auth() })
    const { applications } = await json<{ applications: { name: string; project_name: string }[] }>(res)

    expect(applications).toHaveLength(1)
    expect(applications[0].name).toBe('Web')
    expect(applications[0].project_name).toBe('Produksi')
  })
})

describe('GET /api/databases', () => {
  test('password nggak pernah ikut kekirim', async () => {
    await app.request(`/api/projects/${projectId}/databases`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'db-utama', engine: 'postgres' }),
    })

    const res = await app.request('/api/databases', { headers: auth() })
    const { databases } = await json<{
      databases: { name: string; project_name: string; password?: string }[]
    }>(res)

    expect(databases).toHaveLength(1)
    expect(databases[0].name).toBe('db-utama')
    expect(databases[0].project_name).toBe('Produksi')
    // Ini yang paling penting: daftar gabungan juga nggak boleh bocorin hash.
    expect(databases[0].password).toBeUndefined()
  })
})

describe('GET /api/domains', () => {
  test('nempelin nama app dan project', async () => {
    const appId = await bikinApp('Web')
    await app.request(`/api/apps/${appId}/domains`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ hostname: 'contoh.com' }),
    })

    const res = await app.request('/api/domains', { headers: auth() })
    const { domains } = await json<{
      domains: { hostname: string; app_name: string; project_name: string }[]
    }>(res)

    expect(domains).toHaveLength(1)
    expect(domains[0].hostname).toBe('contoh.com')
    expect(domains[0].app_name).toBe('Web')
    expect(domains[0].project_name).toBe('Produksi')
  })
})

describe('GET /api/storage', () => {
  test('kosong di awal', async () => {
    const res = await app.request('/api/storage', { headers: auth() })
    expect(res.status).toBe(200)
    expect((await json<{ buckets: unknown[] }>(res)).buckets).toEqual([])
  })
})

describe('GET /api/backups', () => {
  test('kosong kalau belum ada backup', async () => {
    const res = await app.request('/api/backups', { headers: auth() })
    expect(res.status).toBe(200)
    expect((await json<{ backups: unknown[] }>(res)).backups).toEqual([])
  })
})

describe('GET /api/activity', () => {
  test('deployment terbaru semua app, terbaru di atas', async () => {
    const appId = await bikinApp('Web')
    await app.request(`/api/apps/${appId}/deploy`, {
      method: 'POST',
      headers: auth(),
    })

    const res = await app.request('/api/activity', { headers: auth() })
    const { activity } = await json<{
      activity: { app_name: string; project_name: string }[]
    }>(res)

    expect(activity.length).toBeGreaterThan(0)
    expect(activity[0].app_name).toBe('Web')
    expect(activity[0].project_name).toBe('Produksi')
  })
})
