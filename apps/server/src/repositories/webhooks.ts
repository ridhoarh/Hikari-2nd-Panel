import { randomBytes } from 'node:crypto'
import type { Database } from '../db/client'
import { newId, nowIso } from '../lib/id'

export function getOrCreateWebhookSecret(db: Database, appId: string): string {
  const key = `webhook_secret:${appId}`
  const row = db.query('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | null

  if (row) return row.value

  const secret = randomBytes(32).toString('hex')
  db.query('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, secret)
  return secret
}

export function recordDelivery(
  db: Database,
  appId: string,
  deliveryId: string,
  event: string,
  status: string
): void {
  db.query(
    `INSERT INTO webhook_deliveries (id, app_id, delivery_id, event, received_at, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId(), appId, deliveryId, event, nowIso(), status)
}

export function hasProcessedDelivery(db: Database, deliveryId: string): boolean {
  const row = db
    .query('SELECT 1 FROM webhook_deliveries WHERE delivery_id = ? LIMIT 1')
    .get(deliveryId)
  return Boolean(row)
}
