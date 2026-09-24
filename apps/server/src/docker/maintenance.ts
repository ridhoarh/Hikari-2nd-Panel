import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type Docker from 'dockerode'
import type { Database } from '../db/client'
import { networkName } from './client'

export function selectImagesToKeep(tags: string[], keep = 2): string[] {
  if (tags.length <= keep) return []
  return tags.slice(keep)
}

export async function ensureNetwork(docker: Docker): Promise<void> {
  const name = networkName()
  const networks = await docker.listNetworks({ filters: { name: [name] } })
  if (networks.some((n) => n.Name === name)) return
  await docker.createNetwork({ Name: name, Driver: 'bridge' })
}

export async function pruneImages(docker: Docker): Promise<{ deleted: number }> {
  const result = await docker.pruneImages({ filters: { dangling: { true: true } } })
  const deleted = Array.isArray(result.ImagesDeleted) ? result.ImagesDeleted.length : 0
  return { deleted }
}

export function pruneOldDeployments(db: Database, appId: string, keep = 50): number {
  const rows = db
    .query(
      'SELECT id FROM deployments WHERE app_id = ? ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?'
    )
    .all(appId, keep) as { id: string }[]

  for (const row of rows) {
    db.query('DELETE FROM deployments WHERE id = ?').run(row.id)
  }

  return rows.length
}

export function pruneBuildLogs(logDir: string, maxAgeDays: number): number {
  if (!existsSync(logDir)) return 0

  const batas = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  let dihapus = 0

  for (const nama of readdirSync(logDir)) {
    if (!nama.endsWith('.log')) continue

    const path = join(logDir, nama)
    try {
      if (statSync(path).mtimeMs < batas) {
        rmSync(path)
        dihapus += 1
      }
    } catch {
      // file udah nggak ada, lanjut
    }
  }

  return dihapus
}
