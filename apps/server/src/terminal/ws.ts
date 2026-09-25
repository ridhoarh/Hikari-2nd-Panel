import type { ServerWebSocket } from 'bun'
import type Docker from 'dockerode'
import { getCookie } from 'hono/cookie'
import { SESSION_COOKIE, verifySession } from '../lib/session'
import { findUserById } from '../repositories/users'
import { getApp } from '../repositories/apps'
import type { Database } from '../db/client'
import { openTerminal, type TerminalSession } from './session'
import { isValidShell } from './shell'
import { isKontrolPesan, validResize } from './protocol'

export type TerminalSocketData = {
  session: TerminalSession | null
  /** Slug app yang dibuka. Diisi pas handshake. */
  appSlug: string
}

export type TerminalSocket = ServerWebSocket<TerminalSocketData>

export type TerminalDeps = {
  db: Database
  docker: Docker
  cryptoKey: Buffer
}

/** Yang dibutuhin dari server buat nge-upgrade request. */
export type UpgradeTarget = {
  upgrade: (req: Request, opts: { data: TerminalSocketData }) => boolean
}

/**
 * Cookie diambil dari header handshake. WebSocket di browser nggak bisa
 * dikasih header custom, jadi cookie-nya ikut otomatis — dan itu cukup
 * buat autentikasi.
 */
function authDariHeader(deps: TerminalDeps, req: Request): { ok: boolean; error?: string } {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const token = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)

  if (!token) return { ok: false, error: 'Belum login' }

  const session = verifySession(token, deps.cryptoKey)
  if (!session) return { ok: false, error: 'Session nggak valid' }

  const user = findUserById(deps.db, session.userId)
  if (!user) return { ok: false, error: 'Belum login' }

  return { ok: true }
}

/**
 * Dipanggil dari `Bun.serve` `fetch` handler pas ada upgrade ke
 * `/api/apps/:id/terminal`.
 */
export function handleTerminalUpgrade(
  deps: TerminalDeps,
  req: Request,
  server: UpgradeTarget
): Response | undefined {
  const url = new URL(req.url)
  const m = /^\/api\/apps\/([^/]+)\/terminal$/.exec(url.pathname)
  if (!m) return undefined

  const appId = m[1]
  const auth = authDariHeader(deps, req)
  if (!auth.ok) {
    return new Response(auth.error ?? 'Nggak diizinin', { status: 401 })
  }

  const app = getApp(deps.db, appId)
  if (!app) return new Response('App nggak ketemu', { status: 404 })

  const diupgrade = server.upgrade(req, {
    data: { session: null, appSlug: app.slug },
  })

  if (!diupgrade) {
    return new Response('Upgrade ke WebSocket gagal', { status: 400 })
  }

  return undefined
}

/** Ukuran pesan yang diterima dari browser. Cukup buat ketikan & paste wajar. */
const MAX_PESAN = 64 * 1024

export async function terminalOpen(
  deps: TerminalDeps,
  ws: TerminalSocket
): Promise<void> {
  try {
    const session = await openTerminal({
      docker: deps.docker,
      appSlug: ws.data.appSlug,
      onData: (chunk) => {
        try {
          ws.send(chunk)
        } catch {
          // socket-nya udah ketutup
        }
      },
      onClose: () => {
        try {
          ws.close()
        } catch {
          // emang udah ketutup
        }
      },
    })
    ws.data.session = session
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    try {
      ws.send(`\r\n[terminal gagal dibuka: ${message}]\r\n`)
      ws.close()
    } catch {
      // socket-nya udah ketutup
    }
  }
}

export function terminalMessage(ws: TerminalSocket, raw: string | Buffer): void {
  const session = ws.data.session
  if (!session) return

  const text = typeof raw === 'string' ? raw : raw.toString('utf8')
  if (text.length > MAX_PESAN) return

  // Pesan kontrol dikirim sebagai JSON; selain itu dianggap ketikan.
  if (isKontrolPesan(text)) {
    try {
      const msg = JSON.parse(text) as {
        type?: string
        cols?: number
        rows?: number
        shell?: string
      }

      if (msg.type === 'resize') {
        const ukuran = validResize(Number(msg.cols), Number(msg.rows))
        if (ukuran.ok) {
          session.resize(Number(msg.cols), Number(msg.rows))
        }
        return
      }

      if (msg.type === 'shell') {
        // Shell dikunci ke daftar putih. Ganti shell di tengah sesi nggak
        // didukung — harus buka terminal baru.
        if (typeof msg.shell === 'string' && !isValidShell(msg.shell)) {
          ws.send('\r\n[shell itu nggak diizinin]\r\n')
        }
        return
      }
    } catch {
      // bukan JSON, berarti ketikan biasa
    }
  }

  session.write(text)
}

export function terminalClose(ws: TerminalSocket): void {
  ws.data.session?.close()
  ws.data.session = null
}
