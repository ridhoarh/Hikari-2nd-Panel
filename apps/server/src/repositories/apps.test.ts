import { beforeEach, describe, expect, test } from 'bun:test'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { createProject, deleteProject } from './projects'
import {
  createApp,
  deleteApp,
  getApp,
  getAppBySlug,
  listApps,
  setAppStatus,
  updateApp,
} from './apps'

let db: Database
let projectId: string
let projectId2: string

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
  projectId = createProject(db, { name: 'Blog' }).id
  projectId2 = createProject(db, { name: 'Lain' }).id
})

const githubInput = {
  projectId: '',
  name: 'Web',
  sourceType: 'github' as const,
  repoUrl: 'git@github.com:user/repo.git',
  branch: 'main',
  containerPort: 3000,
}

describe('createApp', () => {
  test('bikin app dengan slug unik dalam project', () => {
    const a = createApp(db, { ...githubInput, projectId })
    expect(a.slug).toBe('web')
    expect(a.container_port).toBe(3000)
    expect(a.memory_limit_mb).toBe(512)
    expect(a.status).toBe('stopped')
  })

  test('slug unik global walau beda project', () => {
    const a = createApp(db, { ...githubInput, projectId })
    const b = createApp(db, { ...githubInput, projectId: projectId2 })
    expect(a.slug).not.toBe(b.slug)
    expect(b.slug).toBe('web-2')
  })

  test('app docker image nggak butuh repo url', () => {
    const a = createApp(db, {
      projectId,
      name: 'Redis',
      sourceType: 'image',
      imageRef: 'redis:7-alpine',
      containerPort: 6379,
    })
    expect(a.image_ref).toBe('redis:7-alpine')
    expect(a.repo_url).toBeNull()
  })

  test('memory limit bisa dikustom', () => {
    const a = createApp(db, { ...githubInput, projectId, memoryLimitMb: 1024 })
    expect(a.memory_limit_mb).toBe(1024)
  })
})

describe('getAppBySlug', () => {
  test('nemu app lewat slug', () => {
    createApp(db, { ...githubInput, projectId })
    expect(getAppBySlug(db, 'web')?.name).toBe('Web')
  })

  test('balikin null kalau slug nggak ada', () => {
    expect(getAppBySlug(db, 'hantu')).toBeNull()
  })
})

describe('listApps', () => {
  test('difilter per project', () => {
    createApp(db, { ...githubInput, projectId })
    createApp(db, { ...githubInput, projectId: projectId2 })
    expect(listApps(db, projectId)).toHaveLength(1)
  })

  test('tanpa filter balikin semua', () => {
    createApp(db, { ...githubInput, projectId })
    createApp(db, { ...githubInput, projectId: projectId2 })
    expect(listApps(db)).toHaveLength(2)
  })
})

describe('updateApp', () => {
  test('ganti port dan memory limit', () => {
    const a = createApp(db, { ...githubInput, projectId })
    const updated = updateApp(db, a.id, { containerPort: 8080, memoryLimitMb: 256 })
    expect(updated?.container_port).toBe(8080)
    expect(updated?.memory_limit_mb).toBe(256)
    expect(updated?.slug).toBe('web')
  })

  test('balikin null kalau id nggak ada', () => {
    expect(updateApp(db, 'nggak-ada', { containerPort: 8080 })).toBeNull()
  })
})

describe('setAppStatus', () => {
  test('ubah status', () => {
    const a = createApp(db, { ...githubInput, projectId })
    setAppStatus(db, a.id, 'running')
    expect(getApp(db, a.id)?.status).toBe('running')
  })
})

describe('deleteApp', () => {
  test('hapus app', () => {
    const a = createApp(db, { ...githubInput, projectId })
    expect(deleteApp(db, a.id)).toBe(true)
    expect(getApp(db, a.id)).toBeNull()
  })

  test('hapus project ikut hapus app di dalamnya', () => {
    const a = createApp(db, { ...githubInput, projectId })
    deleteProject(db, projectId)
    expect(getApp(db, a.id)).toBeNull()
  })
})
