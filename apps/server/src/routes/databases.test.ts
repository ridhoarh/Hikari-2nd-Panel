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
  dataDir = mkdtempSync(join(tmpdir(), 'hikari-db-routes-'))
  app = createApp({
    dbPath: ':memory:',
    keyPath: join(dataDir, 'secret.key'),
    port: 2508,
    dataDir,
    vpsIp: '203.0.113.5',
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

async function bikinDb(engine = 'postgres', name = 'Produksi') {
  const res = await app.request(`/api/projects/${projectId}/databases`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name, engine }),
  })
  return (await res.json()) as { database: { id: string; password: string } }
}

describe('POST /api/projects/:projectId/databases', () => {
  test('bikin database postgres dengan password 32 karakter', async () => {
    const res = await app.request(`/api/projects/${projectId}/databases`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Produksi', engine: 'postgres' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { database: { password: string; engine: string } }
    expect(body.database.password).toHaveLength(32)
    expect(body.database.engine).toBe('postgres')
  })

  test('tolak engine yang nggak didukung', async () => {
    const res = await app.request(`/api/projects/${projectId}/databases`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'X', engine: 'oracle' }),
    })
    expect(res.status).toBe(400)
  })

  test('nolak kalau project nggak ada', async () => {
    const res = await app.request('/api/projects/nggak-ada/databases', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'X', engine: 'postgres' }),
    })
    expect(res.status).toBe(404)
  })

  test('password nggak ikut di daftar database', async () => {
    await bikinDb()
    const res = await app.request(`/api/projects/${projectId}/databases`, {
      headers: auth(),
    })
    const { databases } = (await res.json()) as {
      databases: { password?: string }[]
    }
    expect(databases[0].password).toBeUndefined()
  })
})

describe('GET /api/databases/:id', () => {
  test('balikin connection string internal', async () => {
    const { database } = await bikinDb()
    const res = await app.request(`/api/databases/${database.id}`, { headers: auth() })
    const body = (await res.json()) as { info: { connectionString: string } }
    expect(body.info.connectionString).toStartWith('postgresql://')
    expect(body.info.connectionString).toContain('127.0.0.1')
  })

  test('404 kalau nggak ada', async () => {
    const res = await app.request('/api/databases/nggak-ada', { headers: auth() })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/databases/:id/access', () => {
  test('tolak public tanpa konfirmasi risiko', async () => {
    const { database } = await bikinDb()
    const res = await app.request(`/api/databases/${database.id}/access`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ mode: 'public' }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('risiko')
  })

  test('terima public kalau udah dikonfirmasi', async () => {
    const { database } = await bikinDb()
    const res = await app.request(`/api/databases/${database.id}/access`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ mode: 'public', understandRisk: true }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      info: { endpoint: { host: string }; warnings: string[] }
    }
    expect(body.info.endpoint.host).toBe('203.0.113.5')
    expect(body.info.warnings.length).toBeGreaterThan(0)
  })

  test('mode domain butuh hostname yang valid', async () => {
    const { database } = await bikinDb()
    const res = await app.request(`/api/databases/${database.id}/access`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ mode: 'domain', domain: 'https://salah.com' }),
    })
    expect(res.status).toBe(400)
  })

  test('mode domain nambahin sslmode=require', async () => {
    const { database } = await bikinDb()
    const res = await app.request(`/api/databases/${database.id}/access`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ mode: 'domain', domain: 'db.contoh.com' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { info: { connectionString: string } }
    expect(body.info.connectionString).toContain('sslmode=require')
  })

  test('mode tunnel nampilin perintah ssh', async () => {
    const { database } = await bikinDb()
    const res = await app.request(`/api/databases/${database.id}/access`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ mode: 'tunnel' }),
    })
    const body = (await res.json()) as { info: { tunnelCommand: string } }
    expect(body.info.tunnelCommand).toContain('ssh -L')
  })
})

describe('DELETE /api/databases/:id', () => {
  test('infokan volume-nya dipertahankan', async () => {
    const { database } = await bikinDb()
    const res = await app.request(`/api/databases/${database.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { volumeKept: string; pesan: string }
    expect(body.volumeKept).toContain('hikari-db-')
    expect(body.pesan).toContain('volume')
  })

  test('database-nya emang kehapus', async () => {
    const { database } = await bikinDb()
    await app.request(`/api/databases/${database.id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    const res = await app.request(`/api/databases/${database.id}`, { headers: auth() })
    expect(res.status).toBe(404)
  })
})

describe('backup', () => {
  test('database tanpa container: backup gagal dengan pesan jelas, bukan 500 kosong', async () => {
    const { database } = await bikinDb()
    const res = await app.request(`/api/databases/${database.id}/backups`, {
      method: 'POST',
      headers: auth(),
    })
    // Container-nya belum jalan di lingkungan tes, jadi gagal — yang penting
    // pesannya jelas dan bukan crash.
    expect([201, 500]).toContain(res.status)
    if (res.status === 500) {
      expect(((await res.json()) as { error: string }).error).toContain('Backup gagal')
    }
  })

  test('redis sekarang didukung, gagal karena container-nya belum jalan', async () => {
    const { database } = await bikinDb('redis', 'Cache')
    const res = await app.request(`/api/databases/${database.id}/backups`, {
      method: 'POST',
      headers: auth(),
    })
    // Tanpa container, redis-cli-nya nggak bisa dipanggil — yang penting
    // pesannya jelas dan bukan crash.
    expect([201, 500]).toContain(res.status)
    if (res.status === 500) {
      expect(((await res.json()) as { error: string }).error).toContain('Backup gagal')
    }
  })

  test('daftar backup kosong di awal', async () => {
    const { database } = await bikinDb()
    const res = await app.request(`/api/databases/${database.id}/backups`, {
      headers: auth(),
    })
    expect(((await res.json()) as { backups: unknown[] }).backups).toEqual([])
  })
})

describe('buckets', () => {
  test('bikin bucket, secret key cuma sekali', async () => {
    const res = await app.request(`/api/projects/${projectId}/buckets`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Aset' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      bucket: { secret_key: string; access_key: string }
      endpoint: string
    }
    expect(body.bucket.secret_key.length).toBeGreaterThanOrEqual(32)
    expect(body.endpoint).toContain('hikari-minio')
  })

  test('nama bucket bentrok balikin 409', async () => {
    await app.request(`/api/projects/${projectId}/buckets`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Aset' }),
    })
    const res = await app.request(`/api/projects/${projectId}/buckets`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Aset' }),
    })
    expect(res.status).toBe(409)
  })

  test('list bucket nggak bocorin secret key', async () => {
    await app.request(`/api/projects/${projectId}/buckets`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Aset' }),
    })
    const res = await app.request(`/api/projects/${projectId}/buckets`, {
      headers: auth(),
    })
    const { buckets } = (await res.json()) as { buckets: { secret_key: string }[] }
    expect(buckets[0].secret_key).toBe('••••••••')
  })

  test('bucket publik pakai endpoint IP VPS', async () => {
    await app.request(`/api/projects/${projectId}/buckets`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Publik', isPublic: true }),
    })
    const res = await app.request(`/api/projects/${projectId}/buckets`, {
      headers: auth(),
    })
    const { buckets } = (await res.json()) as { buckets: { id: string }[] }
    const detail = await app.request(`/api/buckets/${buckets[0].id}`, { headers: auth() })
    const body = (await detail.json()) as { endpoint: string }
    expect(body.endpoint).toContain('203.0.113.5')
  })
})

describe('proteksi login', () => {
  test('endpoint database & storage butuh login', async () => {
    const paths = [
      ['GET', `/api/projects/${projectId}/databases`],
      ['GET', '/api/databases/apa-saja'],
      ['POST', '/api/databases/apa-saja/start'],
      ['GET', '/api/databases/apa-saja/backups'],
      ['GET', `/api/projects/${projectId}/buckets`],
      ['POST', '/api/storage/start'],
    ] as const

    for (const [method, path] of paths) {
      const res = await app.request(path, { method })
      expect(res.status).toBe(401)
    }
  })
})
