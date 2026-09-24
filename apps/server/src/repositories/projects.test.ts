import { beforeEach, describe, expect, test } from 'bun:test'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from './projects'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
})

describe('createProject', () => {
  test('bikin project dengan slug dari nama', () => {
    const p = createProject(db, { name: 'Blog Saya' })
    expect(p.slug).toBe('blog-saya')
    expect(p.name).toBe('Blog Saya')
  })

  test('slug unik walau namanya sama', () => {
    const a = createProject(db, { name: 'Blog' })
    const b = createProject(db, { name: 'Blog' })
    expect(a.slug).not.toBe(b.slug)
    expect(b.slug).toBe('blog-2')
  })

  test('slug unik sampai tiga kali', () => {
    createProject(db, { name: 'Blog' })
    createProject(db, { name: 'Blog' })
    const c = createProject(db, { name: 'Blog' })
    expect(c.slug).toBe('blog-3')
  })

  test('deskripsi opsional', () => {
    const p = createProject(db, { name: 'Tanpa Deskripsi' })
    expect(p.description).toBeNull()
  })
})

describe('listProjects', () => {
  test('kosong di awal', () => {
    expect(listProjects(db)).toEqual([])
  })

  test('balikin yang terbaru duluan', () => {
    createProject(db, { name: 'Pertama' })
    createProject(db, { name: 'Kedua' })
    const list = listProjects(db)
    expect(list[0].name).toBe('Kedua')
  })
})

describe('updateProject', () => {
  test('ganti nama', () => {
    const p = createProject(db, { name: 'Lama' })
    const updated = updateProject(db, p.id, { name: 'Baru' })
    expect(updated?.name).toBe('Baru')
    expect(updated?.slug).toBe('lama')
  })

  test('balikin null kalau id nggak ada', () => {
    expect(updateProject(db, 'nggak-ada', { name: 'X' })).toBeNull()
  })
})

describe('deleteProject', () => {
  test('hapus project yang ada', () => {
    const p = createProject(db, { name: 'Hapus Aku' })
    expect(deleteProject(db, p.id)).toBe(true)
    expect(getProject(db, p.id)).toBeNull()
  })

  test('balikin false kalau id nggak ada', () => {
    expect(deleteProject(db, 'nggak-ada')).toBe(false)
  })
})
