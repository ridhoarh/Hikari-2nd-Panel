import { createAppWithInternals } from './app'
import { envLabel, HIKARI_ENV, peringatanEnv } from './lib/env'
import { HIKARI_VERSION } from './lib/version'
import {
  handleTerminalUpgrade,
  terminalClose,
  terminalMessage,
  terminalOpen,
  type TerminalSocketData,
} from './terminal/ws'

const PORT = Number(process.env.HIKARI_PORT ?? 2508)
const DATA_DIR = process.env.HIKARI_DATA ?? '/var/lib/hikari'

const { app, db, docker, cryptoKey } = createAppWithInternals({
  dbPath: process.env.HIKARI_DB ?? `${DATA_DIR}/hikari.sqlite`,
  keyPath: process.env.HIKARI_KEY ?? `${DATA_DIR}/secret.key`,
  port: PORT,
  dataDir: DATA_DIR,
  staticDir: process.env.HIKARI_STATIC ?? `${DATA_DIR}/www`,
  caddyfilePath: process.env.HIKARI_CADDYFILE ?? '/etc/caddy/Caddyfile',
  caddyDataDir: process.env.HIKARI_CADDY_DATA ?? '/var/lib/caddy/.local/share/caddy',
  panelDomain: process.env.HIKARI_PANEL_DOMAIN ?? null,
  acmeEmail: process.env.HIKARI_ACME_EMAIL,
  vpsIp: process.env.HIKARI_VPS_IP,
  gitHost: process.env.HIKARI_GIT_HOST,
  gitPort: process.env.HIKARI_GIT_PORT
    ? Number(process.env.HIKARI_GIT_PORT)
    : undefined,
})

// Terminal butuh WebSocket, dan itu di luar jangkauan `app.fetch`.
const wsDeps = { db, docker, cryptoKey }

const server = Bun.serve<TerminalSocketData>({
  port: PORT,
  /**
   * Default-nya 10 detik, dan itu terlalu pendek buat beberapa endpoint.
   * Backup database (khususnya Redis) nunggu proses di dalam container kelar
   * sebelum balikin respons — kalau nggak dinaikin, Bun motong koneksinya
   * duluan dan user dapet respons kosong tanpa penjelasan.
   */
  idleTimeout: 120,
  fetch(req, srv) {
    // Hono nggak bisa nge-handle upgrade WebSocket, jadi dicek duluan.
    const up = handleTerminalUpgrade(wsDeps, req, {
      upgrade: (r, opts) => srv.upgrade(r, opts),
    })
    if (up) return up
    return app.fetch(req)
  },
  websocket: {
    async open(ws) {
      await terminalOpen(wsDeps, ws)
    },
    message(ws, msg) {
      terminalMessage(ws, msg)
    },
    close(ws) {
      terminalClose(ws)
    },
  },
})

console.log(`[hikari] v${HIKARI_VERSION} — ${envLabel()}`)
console.log(`[hikari] jalan di http://0.0.0.0:${server.port}`)

// Di development, peringatannya ditulis sekali pas nyala. Sengaja nggak
// dipasang di tiap request — itu bakal jadi berisik dan malah diabaikan.
const peringatan = peringatanEnv()
if (peringatan) console.warn(`[hikari] ${peringatan}`)
