import { Hono } from 'hono'
import type { Database } from '../db/client'
import { decrypt, encrypt } from '../lib/crypto'
import {
  buildDnsPayload,
  findZoneForHostname,
  listZones,
  rootDomainOf,
  upsertDnsRecord,
  type CfZone,
} from './dns'

const TOKEN_KEY = 'cloudflare_token'

export function getCloudflareToken(db: Database, cryptoKey: Buffer): string | null {
  const row = db.query('SELECT value FROM settings WHERE key = ?').get(TOKEN_KEY) as
    | { value: string }
    | null
  if (!row) return null
  return decrypt(row.value, cryptoKey)
}

export function setCloudflareToken(
  db: Database,
  cryptoKey: Buffer,
  token: string
): void {
  db.query(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(TOKEN_KEY, encrypt(token, cryptoKey))
}

export function deleteCloudflareToken(db: Database): void {
  db.query('DELETE FROM settings WHERE key = ?').run(TOKEN_KEY)
}

export type CloudflareDeps = {
  db: Database
  cryptoKey: Buffer
  /** Alamat IP yang dipakai buat record A. */
  vpsIp?: string
  onDomainChange: () => void
}

export function createCloudflareRoutes(deps: CloudflareDeps): Hono {
  const router = new Hono()

  router.get('/cloudflare/status', async (c) => {
    const token = getCloudflareToken(deps.db, deps.cryptoKey)
    if (!token) {
      return c.json({ connected: false, zones: [] })
    }

    const hasil = await listZones({ token })
    return c.json({
      connected: hasil.ok,
      zones: hasil.zones,
      error: hasil.error,
      vpsIp: deps.vpsIp ?? null,
    })
  })

  router.post('/cloudflare/token', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { token?: string } | null
    const token = body?.token?.trim()

    if (!token) return c.json({ error: 'Token wajib diisi' }, 400)

    // Dicek dulu sebelum disimpen — token yang salah mending ketahuan
    // sekarang daripada pas deploy.
    const cek = await listZones({ token })
    if (!cek.ok) {
      return c.json({ error: `Token-nya nggak bisa dipakai: ${cek.error}` }, 400)
    }

    setCloudflareToken(deps.db, deps.cryptoKey, token)
    return c.json({ ok: true, zones: cek.zones })
  })

  router.delete('/cloudflare/token', (c) => {
    deleteCloudflareToken(deps.db)
    return c.json({ ok: true })
  })

  /**
   * Bikin record A buat semua domain yang kedaftar. Dipanggil manual dari
   * halaman Settings — sengaja nggak otomatis tiap save domain, biar
   * nggak nembak API Cloudflare terus-terusan.
   */
  router.post('/cloudflare/sync-dns', async (c) => {
    const token = getCloudflareToken(deps.db, deps.cryptoKey)
    if (!token) return c.json({ error: 'Token Cloudflare belum diisi' }, 400)
    if (!deps.vpsIp) {
      return c.json(
        { error: 'IP VPS belum diketahui. Set HIKARI_VPS_IP di systemd.' },
        400
      )
    }

    const zones = await listZones({ token })
    if (!zones.ok) return c.json({ error: zones.error }, 400)

    // Kumpulin semua hostname: domain app + domain database.
    const hostnamesApp = (
      deps.db.query('SELECT hostname FROM domains').all() as { hostname: string }[]
    ).map((r) => r.hostname)
    const hostnamesDb = (
      deps.db
        .query('SELECT expose_domain FROM databases WHERE expose_domain IS NOT NULL')
        .all() as { expose_domain: string }[]
    ).map((r) => r.expose_domain)

    const semua = [...new Set([...hostnamesApp, ...hostnamesDb])]
    const hasil: { hostname: string; ok: boolean; error?: string }[] = []

    for (const hostname of semua) {
      const zone: CfZone | null = findZoneForHostname(zones.zones, hostname)
      if (!zone) {
        hasil.push({
          hostname,
          ok: false,
          error: `Nggak ada zone Cloudflare buat ${rootDomainOf(hostname)}`,
        })
        continue
      }

      const r = await upsertDnsRecord({
        token,
        zoneId: zone.id,
        payload: buildDnsPayload({ hostname, ip: deps.vpsIp }),
      })
      hasil.push({ hostname, ok: r.ok, error: r.error })
    }

    if (hasil.some((h) => h.ok)) deps.onDomainChange()

    return c.json({ ok: hasil.every((h) => h.ok), hasil })
  })

  return router
}
