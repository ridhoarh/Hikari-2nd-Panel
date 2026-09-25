import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { createProject } from '../repositories/projects'
import { createApp } from '../repositories/apps'
import { addDomain } from '../repositories/domains'
import { reloadCaddy, syncCaddy, writeCaddyfile } from './service'

let db: Database
let dir: string

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
  dir = mkdtempSync(join(tmpdir(), 'hikari-caddy-'))
  const projectId = createProject(db, { name: 'Blog' }).id
  createApp(db, {
    projectId,
    name: 'Web',
    sourceType: 'github',
    repoUrl: 'x',
    containerPort: 3000,
  })
})

/** Nangkep request yang dikirim ke Caddy, biar body-nya bisa diperiksa. */
function captureFetch(response: Response): {
  fetch: typeof fetch
  calls: { url: string; init?: RequestInit }[]
} {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return response
  }) as unknown as typeof fetch
  return { fetch: fn, calls }
}

describe('writeCaddyfile', () => {
  test('tulis isinya ke disk', () => {
    const path = join(dir, 'Caddyfile')
    writeCaddyfile(path, 'contoh.com {\n}\n')
    expect(readFileSync(path, 'utf8')).toContain('contoh.com')
  })

  test('bikin folder induk kalau belum ada', () => {
    const path = join(dir, 'nested', 'Caddyfile')
    writeCaddyfile(path, 'x')
    expect(readFileSync(path, 'utf8')).toBe('x')
  })
})

describe('reloadCaddy', () => {
  test('ngirim isi Caddyfile sebagai body', async () => {
    const path = join(dir, 'Caddyfile')
    writeFileSync(path, 'contoh.com {\n}\n', 'utf8')

    const { fetch: fakeFetch, calls } = captureFetch(new Response('', { status: 200 }))
    const result = await reloadCaddy('http://127.0.0.1:2019/load', path, fakeFetch)

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].init?.method).toBe('POST')
    // Inilah yang bikin Caddy bales "EOF": body kosong.
    expect(calls[0].init?.body).toBe('contoh.com {\n}\n')
    expect((calls[0].init?.headers as Record<string, string>)['Content-Type']).toBe(
      'text/caddyfile'
    )
  })

  test('balikin gagal kalau Caddyfile nggak bisa dibaca', async () => {
    const { fetch: fakeFetch, calls } = captureFetch(new Response('', { status: 200 }))
    const result = await reloadCaddy(
      'http://127.0.0.1:2019/load',
      join(dir, 'nggak-ada'),
      fakeFetch
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Caddyfile')
    // Nggak boleh nembak Caddy kalau filenya aja nggak ada.
    expect(calls).toHaveLength(0)
  })

  test('balikin gagal kalau Caddy mati', async () => {
    const path = join(dir, 'Caddyfile')
    writeFileSync(path, 'x', 'utf8')
    const fakeFetch = (async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch
    const result = await reloadCaddy('http://127.0.0.1:2019/load', path, fakeFetch)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('refused')
  })

  test('balikin gagal kalau Caddy bales error', async () => {
    const path = join(dir, 'Caddyfile')
    writeFileSync(path, 'x', 'utf8')
    const fakeFetch = (async () =>
      new Response('config jelek', { status: 400 })) as unknown as typeof fetch
    const result = await reloadCaddy('http://127.0.0.1:2019/load', path, fakeFetch)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('400')
  })
})

describe('syncCaddy', () => {
  test('nulis config yang isinya domain app', async () => {
    const path = join(dir, 'Caddyfile')
    const app = createApp(db, {
      projectId: (db.query('SELECT id FROM projects LIMIT 1').get() as { id: string }).id,
      name: 'Satu',
      sourceType: 'github',
      repoUrl: 'x',
      containerPort: 3000,
    })
    addDomain(db, app.id, 'satu.contoh.com')

    const { fetch: fakeFetch, calls } = captureFetch(new Response('', { status: 200 }))

    await syncCaddy({
      db,
      caddyfilePath: path,
      panelPort: 2508,
      adminUrl: 'http://127.0.0.1:2019/load',
      fetchImpl: fakeFetch,
    })

    expect(readFileSync(path, 'utf8')).toContain('satu.contoh.com')
    // Body reload harus sama dengan isi file yang baru ditulis.
    expect(calls[0].init?.body).toBe(readFileSync(path, 'utf8'))
  })

  test('nggak ada domain tetep nulis file valid', async () => {
    const path = join(dir, 'Caddyfile')
    const fakeFetch = (async () =>
      new Response('', { status: 200 })) as unknown as typeof fetch

    await syncCaddy({
      db,
      caddyfilePath: path,
      panelPort: 2508,
      adminUrl: 'http://127.0.0.1:2019/load',
      fetchImpl: fakeFetch,
    })

    expect(readFileSync(path, 'utf8')).toContain('admin 127.0.0.1:2019')
  })

  test('nggak error walau Caddy mati, file tetep ditulis', async () => {
    const path = join(dir, 'Caddyfile')
    const fakeFetch = (async () => {
      throw new Error('refused')
    }) as unknown as typeof fetch

    await syncCaddy({
      db,
      caddyfilePath: path,
      panelPort: 2508,
      adminUrl: 'http://127.0.0.1:2019/load',
      fetchImpl: fakeFetch,
    })

    expect(readFileSync(path, 'utf8')).toContain('admin')
  })
})
