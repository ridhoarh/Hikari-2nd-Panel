import type { Database } from '../db/client'
import { newId, nowIso } from '../lib/id'

export type TlsStatus = 'pending' | 'active' | 'failed'

export type Domain = {
  id: string
  app_id: string
  hostname: string
  tls_status: TlsStatus
  created_at: string
}

export function listDomains(db: Database, appId: string): Domain[] {
  return db
    .query('SELECT * FROM domains WHERE app_id = ? ORDER BY created_at, id')
    .all(appId) as Domain[]
}

export function listAllDomains(db: Database): Domain[] {
  return db.query('SELECT * FROM domains ORDER BY hostname').all() as Domain[]
}

export function addDomain(db: Database, appId: string, hostname: string): Domain {
  const domain: Domain = {
    id: newId(),
    app_id: appId,
    hostname,
    tls_status: 'pending',
    created_at: nowIso(),
  }
  db.query(
    'INSERT INTO domains (id, app_id, hostname, tls_status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(domain.id, domain.app_id, domain.hostname, domain.tls_status, domain.created_at)
  return domain
}

export function removeDomain(db: Database, id: string): boolean {
  const result = db.query('DELETE FROM domains WHERE id = ?').run(id)
  return result.changes > 0
}

export function setTlsStatus(db: Database, id: string, status: TlsStatus): void {
  db.query('UPDATE domains SET tls_status = ? WHERE id = ?').run(status, id)
}
