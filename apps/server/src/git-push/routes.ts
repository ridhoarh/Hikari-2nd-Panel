import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from '../db/client'
import { getApp, listApps } from '../repositories/apps'
import {
  bareRepoPath,
  ensureBareRepo,
  hapusBareRepo,
  sshUrlFor,
} from './git-setup'
import { authorizedKeyLine, gitPushInstructions, normalizePublicKey } from './sshd-setup'

export type GitPushRoutesDeps = {
  db: Database
  dataDir: string
  /** Alamat Hikari yang bisa dijangkau dari hook (biasanya loopback). */
  apiUrl: string
  /** Host yang dipakai buat nampilin URL clone ke user. */
  gitHost: string
  gitPort: number
  onPush: (appId: string) => void
}

/**
 * Siapin bare repo buat satu app. Dipanggil pas app dibikin DAN pas Hikari
 * nyala, karena repo-nya harus ada sebelum ada yang push.
 */
export async function setupRepoForApp(deps: {
  db: Database
  dataDir: string
  apiUrl: string
  appId: string
  appSlug: string
}): Promise<string> {
  return ensureBareRepo({
    dataDir: deps.dataDir,
    appSlug: deps.appSlug,
    appId: deps.appId,
    apiUrl: deps.apiUrl,
    pushSecret: getOrCreatePushSecret(deps.db, deps.appId),
  })
}

function pushSecretKey(appId: string): string {
  return `git_push_secret:${appId}`
}

export function getOrCreatePushSecret(db: Database, appId: string): string {
  const key = pushSecretKey(appId)
  const row = db.query('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | null
  if (row) return row.value

  const secret = randomBytes(32).toString('hex')
  db.query('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, secret)
  return secret
}

const SSH_KEY_KEY = 'git_ssh_public_key'

/** Public key SSH yang dipakai buat push. Dibikin sekali, dipakai semua app. */
export function getOrCreateGitSshKey(db: Database): string | null {
  const row = db.query('SELECT value FROM settings WHERE key = ?').get(SSH_KEY_KEY) as
    | { value: string }
    | null
  return row ? row.value : null
}

export function setGitSshKey(db: Database, publicKey: string): void {
  db.query(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(SSH_KEY_KEY, publicKey)
}

export function createGitPushRoutes(deps: GitPushRoutesDeps): Hono {
  const { db } = deps
  const router = new Hono()

  /**
   * Dipanggil sama hook `post-receive` dari bare repo. Dijaga secret, bukan
   * cookie — yang manggil itu shell, bukan browser.
   */
  router.post('/git-push/:appId', async (c) => {
    const appId = c.req.param('appId')
    const app = getApp(db, appId)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const secret = c.req.header('x-hikari-push-secret') ?? ''
    const expected = getOrCreatePushSecret(db, appId)
    if (secret !== expected) {
      return c.json({ error: 'Secret nggak valid' }, 401)
    }

    const body = (await c.req.json().catch(() => null)) as { ref?: string } | null
    const pushedBranch = (body?.ref ?? '').replace('refs/heads/', '')

    deps.onPush(appId)

    return c.json({ ok: true, branch: pushedBranch }, 202)
  })

  router.get('/apps/:id/git', (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const sshUrl = sshUrlFor(app.slug, deps.gitHost, deps.gitPort)
    return c.json({
      sshUrl,
      repoPath: bareRepoPath(deps.dataDir, app.slug),
      commands: gitPushInstructions({ appSlug: app.slug, sshUrl }),
      publicKey: getOrCreateGitSshKey(db),
    })
  })

  /**
   * Siapin bare repo buat semua app. Dipanggil pas Hikari nyala, karena
   * sshd-nya nunjuk ke folder ini dan hook-nya harus udah ada sebelum ada
   * yang push.
   */
  router.post('/git/setup', async (c) => {
    const hasil: { slug: string; repoPath: string }[] = []

    for (const app of listApps(db)) {
      const repoPath = await setupRepoForApp({
        db,
        dataDir: deps.dataDir,
        apiUrl: deps.apiUrl,
        appId: app.id,
        appSlug: app.slug,
      })
      hasil.push({ slug: app.slug, repoPath })
    }

    return c.json({ ok: true, repos: hasil })
  })

  router.get('/git/authorized-keys', (c) => {
    const publicKey = getOrCreateGitSshKey(db)
    if (!publicKey) {
      return c.text(
        '# Belum ada deploy key. Bikin lewat panel, atau POST /api/git/ssh-key { publicKey }\n',
        200,
        { 'Content-Type': 'text/plain' }
      )
    }

    // SSH ngunci command-nya ke git-shell: kunci ini cuma bisa dipakai
    // buat git, bukan buat dapet shell.
    return c.text(`${authorizedKeyLine({ publicKey, dataDir: deps.dataDir })}\n`, 200, {
      'Content-Type': 'text/plain',
    })
  })

  /**
   * Bikin pasangan kunci deploy yang dipakai HIKARI buat push ke dirinya
   * sendiri. Private key-nya disimpen di dataDir, public key-nya dipakai
   * buat authorized_keys.
   *
   * Ini opsional: user juga bisa nempelin public key-nya sendiri kalau mau
   * push dari mesin dia.
   */
  router.post('/git/deploy-key', async (c) => {
    const keyPath = join(deps.dataDir, 'git_push_key')

    if (!existsSync(keyPath)) {
      mkdirSync(deps.dataDir, { recursive: true })
      const proc = Bun.spawn(
        ['ssh-keygen', '-t', 'ed25519', '-N', '', '-C', 'hikari-deploy', '-f', keyPath],
        { stdout: 'pipe', stderr: 'pipe' }
      )
      const err = await new Response(proc.stderr).text()
      if ((await proc.exited) !== 0) {
        return c.json({ error: `ssh-keygen gagal: ${err.trim()}` }, 500)
      }
    }

    const publicKey = normalizePublicKey(readFileSync(`${keyPath}.pub`, 'utf8'))
    if (!publicKey) return c.json({ error: 'Public key hasil generate nggak valid' }, 500)

    setGitSshKey(db, publicKey)
    return c.json({ ok: true, publicKey })
  })

  router.post('/git/ssh-key', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { publicKey?: string } | null
    const normalized = normalizePublicKey(body?.publicKey ?? '')
    if (!normalized) {
      return c.json({ error: 'Public key SSH nggak valid' }, 400)
    }

    setGitSshKey(db, normalized)
    return c.json({ ok: true, publicKey: normalized })
  })

  router.delete('/apps/:id/git', (c) => {
    const id = c.req.param('id')
    const app = getApp(db, id)
    if (!app) return c.json({ error: 'App nggak ketemu' }, 404)

    const dihapus = hapusBareRepo(deps.dataDir, app.slug)
    return c.json({ ok: true, dihapus })
  })

  return router
}
