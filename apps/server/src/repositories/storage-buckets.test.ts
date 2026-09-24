import { describe, expect, test, beforeEach } from 'bun:test'
import { openDatabase, type Database } from '../db/client'
import { runMigrations } from '../db/migrate'
import { createProject } from './projects'
import { generateKey } from '../lib/crypto'
import {
  createBucket,
  deleteBucket,
  getBucket,
  listBuckets,
  resolveBucketCredentials,
} from './storage-buckets'

let db: Database
let projectId: string
const cryptoKey = generateKey()

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
  projectId = createProject(db, { name: 'Blog' }).id
})

describe('createBucket', () => {
  test('bikin bucket dengan access key & secret key', () => {
    const b = createBucket(db, {
      projectId,
      name: 'Aset',
      cryptoKey,
    })
    expect(b.name).toBe('aset')
    expect(b.access_key.length).toBeGreaterThanOrEqual(16)
    expect(b.secret_key.length).toBeGreaterThanOrEqual(32)
    expect(b.is_public).toBe(0)
  })

  test('secret key disimpen terenkripsi', () => {
    const b = createBucket(db, { projectId, name: 'Aset', cryptoKey })
    // Yang di database bukan teks asli.
    expect(b.secret_key).not.toContain('v1:')
    const mentah = db
      .query('SELECT secret_key FROM storage_buckets WHERE id = ?')
      .get(b.id) as { secret_key: string }
    expect(mentah.secret_key.startsWith('v1:')).toBe(true)
  })

  test('nama bucket unik', () => {
    createBucket(db, { projectId, name: 'Aset', cryptoKey })
    expect(() => createBucket(db, { projectId, name: 'Aset', cryptoKey })).toThrow()
  })

  test('nama dibikin aman buat S3', () => {
    const b = createBucket(db, { projectId, name: 'Aset Publik!!', cryptoKey })
    expect(b.name).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('listBuckets', () => {
  test('difilter per project', () => {
    const p2 = createProject(db, { name: 'Lain' }).id
    createBucket(db, { projectId, name: 'A', cryptoKey })
    createBucket(db, { projectId: p2, name: 'B', cryptoKey })
    expect(listBuckets(db, projectId)).toHaveLength(1)
  })
})

describe('resolveBucketCredentials', () => {
  test('balikin secret key yang udah didekripsi', () => {
    const b = createBucket(db, { projectId, name: 'Aset', cryptoKey })
    const creds = resolveBucketCredentials(db, b.id, cryptoKey)
    expect(creds?.accessKey).toBe(b.access_key)
    expect(creds?.secretKey).toBe(b.secret_key)
  })

  test('kunci salah bikin error, bukan nilai ngawur', () => {
    const b = createBucket(db, { projectId, name: 'Aset', cryptoKey })
    expect(() => resolveBucketCredentials(db, b.id, generateKey())).toThrow()
  })

  test('balikin null kalau bucket nggak ada', () => {
    expect(resolveBucketCredentials(db, 'nggak-ada', cryptoKey)).toBeNull()
  })
})

describe('deleteBucket', () => {
  test('hapus bucket', () => {
    const b = createBucket(db, { projectId, name: 'Aset', cryptoKey })
    expect(deleteBucket(db, b.id)).toBe(true)
    expect(getBucket(db, b.id)).toBeNull()
  })
})
