import { Hono } from 'hono'
import { totalmem, freemem } from 'node:os'
import { statfs } from 'node:fs/promises'
import type { Database } from '../db/client'
import { HIKARI_VERSION } from '../lib/version'
import { HIKARI_ENV } from '../lib/env'
import { getDocker, pingDocker } from '../docker/client'
import { formatBytes, diskPercent, isDiskWarning } from '../lib/disk'

const MB = 1024 * 1024

type DiskInfo = {
  total: number
  free: number
  used: number
  percent: number
  warning: boolean
  totalLabel: string
  usedLabel: string
  freeLabel: string
}

async function readDiskInfo(path: string): Promise<DiskInfo | null> {
  try {
    const s = await statfs(path)
    // bsize/bavail di Node bisa bigint kalau opsinya diaktifin. Kita
    // konversi ke number biar perhitungannya sederhana.
    const bsize = Number(s.bsize)
    const total = bsize * Number(s.blocks)
    const free = bsize * Number(s.bavail)
    const used = total - free
    const percent = diskPercent({ total, free })

    return {
      total,
      free,
      used,
      percent,
      warning: isDiskWarning(percent),
      totalLabel: formatBytes(total),
      usedLabel: formatBytes(used),
      freeLabel: formatBytes(free),
    }
  } catch {
    // statfs bisa gagal di filesystem aneh; disk info jadi null aja,
    // jangan bikin seluruh halaman settings error.
    return null
  }
}

export type SettingsDeps = {
  db: Database
  dataDir: string
  panelPort: number
  onSyncCaddy: () => void
}

export function createSettingsRoutes(deps: SettingsDeps): Hono {
  const router = new Hono()

  router.get('/settings', async (c) => {
    const dockerAvailable = await pingDocker(getDocker())

    return c.json({
      version: HIKARI_VERSION,
      // Ditampilin di sidebar biar kelihatan ini instance apa waktu lagi
      // ngoprek — bedain "VPS yang dipakai" sama "tempat uji".
      env: HIKARI_ENV,
      dataDir: deps.dataDir,
      // Port dikirim dari konfigurasi, bukan ditulis tetap di frontend —
      // halaman Settings dulu nampilin angka 2508 yang nggak ikut berubah
      // kalau HIKARI_PORT diset lain.
      panelPort: deps.panelPort,
      dockerAvailable,
      ramUsedMb: Math.round((totalmem() - freemem()) / MB),
      ramTotalMb: Math.round(totalmem() / MB),
      disk: await readDiskInfo(deps.dataDir),
    })
  })

  router.post('/settings/sync-caddy', (c) => {
    deps.onSyncCaddy()
    return c.json({ ok: true })
  })

  return router
}
