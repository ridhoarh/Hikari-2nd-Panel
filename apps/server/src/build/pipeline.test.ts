import { beforeEach, describe, expect, test } from 'bun:test'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { generateKey } from '../lib/crypto'
import { createProject } from '../repositories/projects'
import { createApp, getApp, setAppStatus } from '../repositories/apps'
import { createDeployment, getDeployment } from '../repositories/deployments'
import { markDeployResult } from './pipeline'

let db: Database
let appId: string

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
  setAppStatus(db, appId, 'running')
})

describe('markDeployResult', () => {
  test('sukses nandain app running', () => {
    const dep = createDeployment(db, appId)
    markDeployResult(db, dep.id, appId, { ok: true, imageTag: 'hikari-web:1' })
    expect(getDeployment(db, dep.id)?.status).toBe('success')
    expect(getApp(db, appId)?.status).toBe('running')
  })

  test('gagal tapi container lama masih jalan: app tetap running', () => {
    const dep = createDeployment(db, appId)
    markDeployResult(db, dep.id, appId, {
      ok: false,
      error: 'build gagal',
      appMasihJalan: true,
    })
    expect(getDeployment(db, dep.id)?.status).toBe('failed')
    expect(getDeployment(db, dep.id)?.error).toBe('build gagal')
    expect(getApp(db, appId)?.status).toBe('running')
  })

  test('gagal DAN container lama nggak jalan: app jadi failed', () => {
    const dep = createDeployment(db, appId)
    markDeployResult(db, dep.id, appId, {
      ok: false,
      error: 'build gagal',
      appMasihJalan: false,
    })
    expect(getApp(db, appId)?.status).toBe('failed')
  })

  test('status building sebelum build nggak bikin keputusan salah', () => {
    // Ini regresi: deployApp nge-set 'building' sebelum build, jadi kalau
    // markDeployResult baca status dari database, app yang sebenarnya masih
    // jalan bakal salah ditandain failed.
    setAppStatus(db, appId, 'building')
    const dep = createDeployment(db, appId)
    markDeployResult(db, dep.id, appId, {
      ok: false,
      error: 'x',
      appMasihJalan: true,
    })
    expect(getApp(db, appId)?.status).toBe('running')
  })

  test('sukses nyimpen tag image', () => {
    const dep = createDeployment(db, appId)
    markDeployResult(db, dep.id, appId, { ok: true, imageTag: 'hikari-web:9' })
    expect(getDeployment(db, dep.id)?.image_tag).toBe('hikari-web:9')
  })

  test('sukses nyatet waktu selesai', () => {
    const dep = createDeployment(db, appId)
    markDeployResult(db, dep.id, appId, { ok: true, imageTag: 'x:1' })
    expect(getDeployment(db, dep.id)?.finished_at).not.toBeNull()
  })
})

// `generateKey` diimpor supaya file ini juga nge-cover jalur kripto yang
// dipakai pipeline — kalau kuncinya rusak, deploy nggak bisa resolve env var.
describe('kunci enkripsi buat pipeline', () => {
  test('generateKey bikin 32 byte', () => {
    expect(generateKey()).toHaveLength(32)
  })
})
