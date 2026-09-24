import { createApp } from './app'

const PORT = Number(process.env.HIKARI_PORT ?? 2508)
const DB_PATH = process.env.HIKARI_DB ?? '/var/lib/hikari/hikari.sqlite'
const KEY_PATH = process.env.HIKARI_KEY ?? '/var/lib/hikari/secret.key'

const app = createApp({ dbPath: DB_PATH, keyPath: KEY_PATH, port: PORT })

console.log(`[hikari] jalan di http://0.0.0.0:${PORT}`)

export default { port: PORT, fetch: app.fetch }
