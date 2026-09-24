import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Database } from '../db/client'
import { getApp } from '../repositories/apps'
import { listAllDomains } from '../repositories/domains'
import { renderCaddyfile, type CaddyEntry } from './config'

export function writeCaddyfile(path: string, content: string): void {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, content, 'utf8')
}

export async function reloadCaddy(
  adminUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchImpl(adminUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/caddyfile' },
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

  const content = renderCaddyfile({
    panelDomain: deps.panelDomain,
    panelPort: deps.panelPort,
    entries,
    acmeEmail: deps.acmeEmail,
  })

  // File ditulis duluan, baru reload. Kalau reload-nya gagal, config-nya
  // tetep ada di disk dan bisa di-reload manual — lebih baik daripada
  // kehilangan config-nya sama sekali.
  writeCaddyfile(deps.caddyfilePath, content)

  const result = await reloadCaddy(deps.adminUrl, deps.fetchImpl ?? fetch)
  if (!result.ok) {
    console.error('[hikari] gagal reload Caddy:', result.error)
  }
}
