import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { generateKey } from '../lib/crypto'
import { createProject } from './projects'
import { createApp, getApp, setAppStatus } from './apps'
import { deleteEnvVar, listEnvVars, resolveEnvVars, setEnvVar } from './env-vars'
import {
  appendBuildLog,
  createDeployment,
  getDeployment,
  listDeployments,
  pruneOldDeploymentsIn,
  readBuildLog,
  setDeploymentStatus,
} from './deployments'

let db: Database
let appId: string
const key = generateKey()

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
  const projectId = createProject(db, { name: 'Blog' }).id
  appId = createApp(db, {
    projectId,
    name: 'Web',
    sourceType: 'github',
    containerPort: 3000,
  }).id
})

describe('setEnvVar', () => {
  test('simpan env var biasa', () => {
    setEnvVar(db, appId, 'NODE_ENV', 'production', false, key)
    const vars = listEnvVars(db, appId)
    expect(vars).toHaveLength(1)
    expect(vars[0].key).toBe('NODE_ENV')
    expect(vars[0].is_secret).toBe(0)
  })

  test('nilai rahasia disimpen terenkripsi, bukan teks asli', () => {
    setEnvVar(db, appId, 'DB_PASSWORD', 'superrahasia', true, key)
    const stored = db
      .query('SELECT value FROM env_vars WHERE key = ?')
      .get('DB_PASSWORD') as { value: string }
    expect(stored.value).not.toContain('superrahasia')
    expect(stored.value.startsWith('v1:')).toBe(true)
  })

  test('semua nilai disimpen terenkripsi, termasuk yang bukan rahasia', () => {
    setEnvVar(db, appId, 'PLAIN', 'biasa', false, key)
    const stored = db
      .query('SELECT value FROM env_vars WHERE key = ?')
      .get('PLAIN') as { value: string }
    expect(stored.value).not.toContain('biasa')
    expect(stored.value.startsWith('v1:')).toBe(true)
  })

  test('set ulang key yang sama menimpa nilainya', () => {
    setEnvVar(db, appId, 'FOO', 'satu', false, key)
    setEnvVar(db, appId, 'FOO', 'dua', false, key)
    expect(listEnvVars(db, appId)).toHaveLength(1)
    expect(resolveEnvVars(db, appId, key).FOO).toBe('dua')
  })
})

describe('resolveEnvVars', () => {
  test('balikin nilai yang udah didekripsi', () => {
    setEnvVar(db, appId, 'PLAIN', 'biasa', false, key)
    setEnvVar(db, appId, 'SECRET', 'rahasia123', true, key)
    const resolved = resolveEnvVars(db, appId, key)
    expect(resolved.PLAIN).toBe('biasa')
    expect(resolved.SECRET).toBe('rahasia123')
  })

  test('kosong kalau belum ada env var', () => {
    expect(resolveEnvVars(db, appId, key)).toEqual({})
  })

  test('kunci salah bikin error, bukan nilai ngawur', () => {
    setEnvVar(db, appId, 'SECRET', 'rahasia123', true, key)
    const kunciLain = generateKey()
    expect(() => resolveEnvVars(db, appId, kunciLain)).toThrow()
  })
})

describe('deleteEnvVar', () => {
  test('hapus env var', () => {
    setEnvVar(db, appId, 'FOO', 'bar', false, key)
    expect(deleteEnvVar(db, appId, 'FOO')).toBe(true)
    expect(listEnvVars(db, appId)).toHaveLength(0)
  })

  test('balikin false kalau nggak ada', () => {
    expect(deleteEnvVar(db, appId, 'HANTU')).toBe(false)
  })
})

describe('deployments', () => {
  test('bikin deployment dengan status queued', () => {
    const d = createDeployment(db, appId)
    expect(d.status).toBe('queued')
    expect(getDeployment(db, d.id)?.id).toBe(d.id)
  })

  test('listDeployments balikin yang terbaru duluan', () => {
    const a = createDeployment(db, appId)
    const b = createDeployment(db, appId)
    const list = listDeployments(db, appId)
    expect(list[0].id).toBe(b.id)
    expect(list[1].id).toBe(a.id)
  })

  test('setDeploymentStatus nyimpen patch', () => {
    const d = createDeployment(db, appId)
    setDeploymentStatus(db, d.id, 'success', {
      imageTag: 'hikari-web:1',
      commitSha: 'abc123',
      finishedAt: '2026-01-01T00:00:00.000Z',
    })
    const after = getDeployment(db, d.id)
    expect(after?.status).toBe('success')
    expect(after?.image_tag).toBe('hikari-web:1')
    expect(after?.commit_sha).toBe('abc123')
  })

  test('pruneOldDeployments nggak hapus app', () => {
    for (let i = 0; i < 5; i++) createDeployment(db, appId)
    pruneOldDeploymentsIn(db, appId, 2)
    expect(getApp(db, appId)).not.toBeNull()
  })
})

describe('log build', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hikari-buildlog-'))
  })

  test('tulis dan baca log', () => {
    const d = createDeployment(db, appId)
    appendBuildLog(dir, d.id, 'baris satu')
    appendBuildLog(dir, d.id, 'baris dua')
    expect(readBuildLog(dir, d.id)).toBe('baris satu\nbaris dua\n')
  })

  test('baca log yang belum ada balikin string kosong', () => {
    expect(readBuildLog(dir, 'nggak-ada')).toBe('')
  })

  test('bikin folder log kalau belum ada', () => {
    const d = createDeployment(db, appId)
    const belumAda = join(dir, 'nested', 'dalam')
    appendBuildLog(belumAda, d.id, 'x')
    expect(existsSync(join(belumAda, `${d.id}.log`))).toBe(true)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })
})
