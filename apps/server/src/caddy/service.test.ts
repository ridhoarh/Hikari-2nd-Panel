import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
  test('balikin ok kalau Caddy bales 200', async () => {
    const fakeFetch = (async () =>
      new Response('', { status: 200 })) as unknown as typeof fetch
    const result = await reloadCaddy('http://127.0.0.1:2019/load', fakeFetch)
    expect(result.ok).toBe(true)
  })

  test('balikin gagal kalau Caddy mati', async () => {
    const fakeFetch = (async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch
    const result = await reloadCaddy('http://127.0.0.1:2019/load', fakeFetch)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('refused')
  })

  test('balikin gagal kalau Caddy bales error', async () => {
    const fakeFetch = (async () =>
      new Response('config jelek', { status: 400 })) as unknown as typeof fetch
    const result = await reloadCaddy('http://127.0.0.1:2019/load', fakeFetch)
    expect(result.ok).toBe(false)
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

    const fakeFetch = (async () =>
      new Response('', { status: 200 })) as unknown as typeof fetch

    await syncCaddy({
      db,
      caddyfilePath: path,
      panelPort: 2508,
      adminUrl: 'http://127.0.0.1:2019/load',
      fetchImpl: fakeFetch,
    })

    expect(readFileSync(path, 'utf8')).toContain('satu.contoh.com')
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
