import { createApp } from './app'

const PORT = Number(process.env.HIKARI_PORT ?? 2508)
const DATA_DIR = process.env.HIKARI_DATA ?? '/var/lib/hikari'

const app = createApp({
  dbPath: process.env.HIKARI_DB ?? `${DATA_DIR}/hikari.sqlite`,
  keyPath: process.env.HIKARI_KEY ?? `${DATA_DIR}/secret.key`,
  port: PORT,
  dataDir: DATA_DIR,
  staticDir: process.env.HIKARI_STATIC ?? `${DATA_DIR}/www`,
  caddyfilePath: process.env.HIKARI_CADDYFILE ?? '/etc/caddy/Caddyfile',
  panelDomain: process.env.HIKARI_PANEL_DOMAIN ?? null,
  acmeEmail: process.env.HIKARI_ACME_EMAIL,
  vpsIp: process.env.HIKARI_VPS_IP,
})

console.log(`[hikari] jalan di http://0.0.0.0:${PORT}`)

export default { port: PORT, fetch: app.fetch }
