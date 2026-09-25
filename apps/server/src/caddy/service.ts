import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Database } from '../db/client'
import { getApp } from '../repositories/apps'
import { listAllDomains } from '../repositories/domains'
import { renderCaddyfile, type CaddyEntry, type CaddyTcpEntry } from './config'
import { listAllDatabases } from '../repositories/databases'

export function writeCaddyfile(path: string, content: string): void {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, content, 'utf8')
}

/**
 * Suruh Caddy baca file config yang baru.
 *
 * Endpoint `/load` butuh isi Caddyfile-nya DIKIRIM sebagai body request.
 * Kalau body-nya kosong, Caddy bales:
 *
 *  400 adapting config using caddyfile adapter: EOF
 *
 * Itu pesan yang menyesatkan — kelihatannya kayak file config-nya rusak,
 * padahal yang salah cuma request-nya nggak ngekirim apa-apa.
 *
 * `Content-Type: text/caddyfile` bikin Caddy nge-parse body-nya pakai
 * adapter Caddyfile; tanpa header itu dia nge-anggapnya JSON.
 */
export async function reloadCaddy(
  adminUrl: string,
  caddyfilePath: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; error?: string }> {
  let content: string
  try {
    content = readFileSync(caddyfilePath, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Nggak bisa baca Caddyfile: ${message}` }
  }

  try {
    const res = await fetchImpl(adminUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/caddyfile' },
      body: content,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `Caddy nolak config: ${res.status} ${text}` }
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Nggak bisa nyambung ke Caddy: ${message}` }
  }
}

export type SyncDeps = {
  db: Database
  caddyfilePath: string
  panelPort: number
  panelDomain?: string | null
  adminUrl: string
  acmeEmail?: string
  fetchImpl?: typeof fetch
}

export async function syncCaddy(deps: SyncDeps): Promise<void> {
  const entries: CaddyEntry[] = []

  for (const domain of listAllDomains(deps.db)) {
    const app = getApp(deps.db, domain.app_id)
    if (!app) continue
    entries.push({ hostname: domain.hostname, upstreamPort: app.container_port, tls: true })
  }

  // Database yang dibukain lewat domain: Caddy dengerin domain:hostPort dan
  // nerusin TCP ke loopback. TLS-nya pakai sertifikat Let's Encrypt yang sama.
  const tcpEntries: CaddyTcpEntry[] = listAllDatabases(deps.db)
    .filter((d) => d.access_mode === 'domain' && d.expose_domain)
    .map((d) => ({
      hostname: d.expose_domain as string,
      listenPort: d.host_port,
      upstreamPort: d.host_port,
    }))

  const content = renderCaddyfile({
    panelDomain: deps.panelDomain,
    panelPort: deps.panelPort,
    entries,
    tcpEntries,
    acmeEmail: deps.acmeEmail,
  })

  // File ditulis duluan, baru reload. Kalau reload-nya gagal, config-nya
  // tetep ada di disk dan bisa di-reload manual — lebih baik daripada
  // kehilangan config-nya sama sekali.
  writeCaddyfile(deps.caddyfilePath, content)

  const result = await reloadCaddy(
    deps.adminUrl,
    deps.caddyfilePath,
    deps.fetchImpl ?? fetch
  )
  if (!result.ok) {
    console.error('[hikari] gagal reload Caddy:', result.error)
  }
}
