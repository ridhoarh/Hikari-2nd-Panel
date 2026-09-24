import type { Database } from '../db/client'
import { decrypt, encrypt } from '../lib/crypto'
import { newId, nowIso } from '../lib/id'

export type BucketRecord = {
  id: string
  project_id: string
  name: string
  access_key: string
  /** Nilai asli (didekripsi) waktu dibalikin dari createBucket. */
  secret_key: string
  is_public: number
  created_at: string
}

const ALFABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function randomString(panjang: number): string {
  const bytes = new Uint8Array(panjang)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALFABET[b % ALFABET.length]
  return out
}

/** Nama bucket S3 cuma boleh huruf kecil, angka, dan tanda hubung. */
function bucketName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug.length > 0 ? slug : `bucket-${randomString(6).toLowerCase()}`
}

export function listBuckets(db: Database, projectId?: string): BucketRecord[] {
  if (projectId) {
    return db
      .query(
        'SELECT * FROM storage_buckets WHERE project_id = ? ORDER BY created_at DESC, id DESC'
      )
      .all(projectId) as BucketRecord[]
  }
  return db
    .query('SELECT * FROM storage_buckets ORDER BY created_at DESC, id DESC')
    .all() as BucketRecord[]
}

export function getBucket(db: Database, id: string): BucketRecord | null {
  return db.query('SELECT * FROM storage_buckets WHERE id = ?').get(id) as
    | BucketRecord
    | null
}

/**
 * `secret_key` yang dibalikin dari sini adalah nilai ASLI (belum dienkripsi),
 * karena dipakai buat ditampilin sekali ke user. Yang disimpen di database
 * bentuknya terenkripsi.
 */
export function createBucket(
  db: Database,
  input: { projectId: string; name: string; cryptoKey: Buffer; isPublic?: boolean }
): BucketRecord {
  const accessKey = randomString(20)
  const secretKey = randomString(40)

  const record: BucketRecord = {
    id: newId(),
    project_id: input.projectId,
    name: bucketName(input.name),
    access_key: accessKey,
    secret_key: secretKey,
    is_public: input.isPublic ? 1 : 0,
    created_at: nowIso(),
  }

  // UNIQUE constraint yang bakal nolak kalau namanya bentrok.
  db.query(
    `INSERT INTO storage_buckets (id, project_id, name, access_key, secret_key, is_public, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.project_id,
    record.name,
    record.access_key,
    encrypt(secretKey, input.cryptoKey),
    record.is_public,
    record.created_at
  )

  return record
}

export function resolveBucketCredentials(
  db: Database,
  id: string,
  cryptoKey: Buffer
): { accessKey: string; secretKey: string } | null {
  const row = getBucket(db, id)
  if (!row) return null
  return {
    accessKey: row.access_key,
    secretKey: decrypt(row.secret_key, cryptoKey),
  }
}

export function setBucketPublic(db: Database, id: string, isPublic: boolean): void {
  db.query('UPDATE storage_buckets SET is_public = ? WHERE id = ?').run(
    isPublic ? 1 : 0,
    id
  )
}

export function deleteBucket(db: Database, id: string): boolean {
  const result = db.query('DELETE FROM storage_buckets WHERE id = ?').run(id)
  return result.changes > 0
}
